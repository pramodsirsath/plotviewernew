import React, { useEffect, useRef, useState } from "react";
import { resolveServerUrl } from "../../config/runtime";
import { generateLayoutSVG, getLayoutCropBounds } from "../../utils/plotGeometry";

const GOOGLE_MAPS_API_KEY = "AIzaSyB-njL0QCNaGM8yjJw3q3PZ1ZYncy9IclA";

// Load Google Maps script dynamically
let googleMapsPromise = null;
function loadGoogleMaps() {
  if (googleMapsPromise) return googleMapsPromise;
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = (e) => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

/**
 * MapReadOnlyView — read-only map view showing the layout image overlaid on Google Maps satellite imagery.
 */
const MapReadOnlyView = ({ layout, onClose }) => {
  const mapOverlay = layout?.mapOverlay;
  const hasOverlay = mapOverlay?.center?.lat && mapOverlay?.center?.lng;
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    if (!hasOverlay) return;
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current) return;

        const center = { lat: mapOverlay.center.lat, lng: mapOverlay.center.lng };
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: mapOverlay.zoom || 18,
          mapTypeId: "satellite",
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: "all", elementType: "labels", stylers: [{ visibility: "on" }] },
          ],
        });

        mapInstanceRef.current = map;

        // Add layout image overlay
        const imageUrl = generateLayoutSVG(layout);
        if (imageUrl) {
          const cropBounds = getLayoutCropBounds(layout);
          const w = cropBounds.width;
          const h = cropBounds.height;
          const aspect = h / w;
          const scale = mapOverlay.scale || 1;
          const baseWidthMeters = 200 * scale;
          const halfW = baseWidthMeters / 2;
          const halfH = (baseWidthMeters * aspect) / 2;

          const south = center.lat - (halfH / 111320);
          const north = center.lat + (halfH / 111320);
          const west = center.lng - (halfW / (111320 * Math.cos(center.lat * Math.PI / 180)));
          const east = center.lng + (halfW / (111320 * Math.cos(center.lat * Math.PI / 180)));

          const bounds = new maps.LatLngBounds(
            new maps.LatLng(south, west),
            new maps.LatLng(north, east)
          );

          const overlayInstance = new maps.GroundOverlay(imageUrl, bounds, {
            opacity: mapOverlay.opacity || 0.65,
            clickable: false,
          });
          overlayInstance.setMap(map);
        }

        setMapLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setMapError(err.message);
      });

    return () => { cancelled = true; };
  }, [hasOverlay, mapOverlay, layout]);

  if (!hasOverlay) {
    return (
      <div style={styles.overlay}>
        <div style={styles.noData}>
          <h3 style={{ margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: "#f8fafc" }}>
            🗺️ Map Not Available
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: 8 }}>
            The admin hasn't set up the map overlay for this layout yet.
          </p>
          <button onClick={onClose} style={styles.closeActionBtn}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>🗺️ Layout on Map</h2>
            <p style={styles.subtitle}>{layout.name} — positioned on Google Maps satellite view</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>&times;</button>
        </div>

        <div style={styles.mapContainer}>
          <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: 16 }} />
          {mapError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 16 }}>
              <p style={{ color: '#ef4444', fontSize: '0.9rem', padding: 16 }}>⚠️ {mapError}</p>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          {layout.locationUrl && (
            <a href={layout.locationUrl} target="_blank" rel="noopener noreferrer" style={styles.mapsLink}>
              📍 Open in Google Maps
            </a>
          )}
          <button onClick={onClose} style={styles.closeActionBtn}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default MapReadOnlyView;

const styles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 60,
    background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16,
  },
  modal: {
    background: "rgba(15, 23, 42, 0.95)", borderRadius: 24,
    width: "min(900px, 100%)", maxHeight: "90vh", overflowY: "auto",
    border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
  },
  noData: {
    background: "rgba(15, 23, 42, 0.95)", borderRadius: 24, padding: 40,
    textAlign: "center", border: "1px solid rgba(255,255,255,0.12)",
    maxWidth: 420,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "24px 24px 0",
  },
  title: {
    margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800,
    fontSize: "1.3rem", color: "#f8fafc",
  },
  subtitle: {
    color: "#94a3b8", fontSize: "0.85rem", marginTop: 4,
  },
  closeBtn: {
    background: "none", border: "none", fontSize: "1.8rem",
    cursor: "pointer", color: "#94a3b8", lineHeight: 1,
  },
  mapContainer: {
    margin: "16px 24px 0", height: 450, borderRadius: 16,
    overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)",
    position: "relative",
  },
  footer: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px 24px", gap: 12,
  },
  mapsLink: {
    color: "#14b8a6", fontWeight: 700, fontSize: "0.9rem",
    textDecoration: "none",
  },
  closeActionBtn: {
    padding: "10px 24px", borderRadius: 12, border: "none",
    background: "#14b8a6", color: "#fff",
    cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
    marginLeft: "auto",
  },
};
