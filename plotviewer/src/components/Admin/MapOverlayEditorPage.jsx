import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, Navigation, Map as MapIcon, Save, ArrowLeft, Search } from "lucide-react";

import API from "../../services/api";
import { getLayoutCropBounds, generateLayoutSVG } from "../../utils/plotGeometry";
import { createCustomOverlayClass } from "../../utils/CustomOverlay";
import { loadGoogleMaps } from "../../utils/googleMapsLoader";

const MapOverlayEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const overlayRef = useRef(null);

  const [layout, setLayout] = useState(null);
  const [center, setCenter] = useState([19.846811, 75.890633]);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(0.65);
  const [zoom, setZoom] = useState(18);
  const [overlayScale, setOverlayScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await API.get(`/layout/${id}`);
        const data = res.data;
        setLayout(data);
        if (data?.mapOverlay?.center?.lat) {
          setCenter([data.mapOverlay.center.lat, data.mapOverlay.center.lng]);
          setRotation(data.mapOverlay.rotation || 0);
          setOpacity(data.mapOverlay.opacity || 0.65);
          setZoom(data.mapOverlay.zoom || 18);
          setOverlayScale(data.mapOverlay.scale || 1);
        }
      } catch (err) {
        setMessage("❌ Failed to load layout");
      } finally {
        setLoading(false);
      }
    };
    fetchLayout();
  }, [id]);

  // Initialize Google Map
  useEffect(() => {
    if (loading || !layout) return;
    let cancelled = false;

    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapRef.current) return;
      const map = new maps.Map(mapRef.current, {
        center: { lat: center[0], lng: center[1] },
        zoom: zoom,
        mapTypeId: "roadmap",
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapInstanceRef.current = map;

      // Listen for zoom changes
      map.addListener("idle", () => {
        setZoom(map.getZoom());
      });

      setMapReady(true);
    }).catch(() => {
      setMessage("❌ Failed to load Google Maps");
    });

    return () => {
      cancelled = true;
    };
  }, [loading, layout]);

  // Update overlay when params change
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !layout) return;
    const maps = window.google?.maps;
    if (!maps) return;

    const cropBounds = getLayoutCropBounds(layout);
    // Avoid division by zero
    const aspect = (cropBounds.width > 0) ? (cropBounds.height / cropBounds.width) : 1;
    const baseWidthMeters = 200; // Base width assumption
    const halfW = baseWidthMeters / 2;
    const halfH = (baseWidthMeters * aspect) / 2;

    const lat = center[0];
    const lng = center[1];
    const south = lat - (halfH / 111320);
    const north = lat + (halfH / 111320);
    const west = lng - (halfW / (111320 * Math.cos(lat * Math.PI / 180)));
    const east = lng + (halfW / (111320 * Math.cos(lat * Math.PI / 180)));

    const bounds = new maps.LatLngBounds(
      new maps.LatLng(south, west),
      new maps.LatLng(north, east)
    );

    if (!overlayRef.current) {
      const imageUrl = generateLayoutSVG(layout);
      if (!imageUrl) return;
      const CustomOverlayClass = createCustomOverlayClass(maps);
      const onDragEnd = (newCenter) => {
        setCenter([newCenter.lat, newCenter.lng]);
      };
      
      const overlay = new CustomOverlayClass(
        bounds, 
        imageUrl, 
        opacity, 
        rotation, 
        overlayScale, 
        onDragEnd
      );
      overlay.setMap(mapInstanceRef.current);
      overlayRef.current = overlay;
    } else {
      overlayRef.current.updateConfig({ 
        opacity, 
        rotation, 
        scale: overlayScale, 
        bounds 
      });
    }
  }, [mapReady, overlayScale, opacity, rotation, center, layout]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const mapOverlay = {
        center: { lat: center[0], lng: center[1] },
        rotation,
        zoom,
        opacity,
        scale: overlayScale,
      };
      await API.put(`/layouts/${layout._id}/map-overlay`, { mapOverlay });
      setMessage("✅ Map overlay saved!");
      setTimeout(() => setMessage(""), 2500);
    } catch (err) {
      setMessage("❌ Failed to save overlay");
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data.length > 0) {
        const newCenter = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setCenter(newCenter);
        setZoom(18);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter({ lat: newCenter[0], lng: newCenter[1] });
          mapInstanceRef.current.setZoom(18);
        }
      } else {
        setMessage("Location not found");
        setTimeout(() => setMessage(""), 2000);
      }
    } catch {
      setMessage("Search failed");
    }
  };

  if (loading) return <div style={styles.loader}>Loading Map...</div>;

  return (
    <div style={styles.page}>
      {/* Full Screen Map Container */}
      <div style={styles.mapArea}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        
        {/* Navigation / Header overlay */}
        <div style={styles.header}>
            <button onClick={() => navigate("/admin-dashboard")} style={styles.backBtn}>
               <ArrowLeft size={20} />
               Back to Dashboard
            </button>
            <form onSubmit={handleSearch} style={styles.searchForm}>
               <Search size={18} color="#aaa" style={{ marginLeft: 16 }} />
               <input
                 type="text"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder="Search location (e.g. Jalna)..."
                 style={styles.searchInput}
               />
               <button type="submit" style={styles.searchBtn}>Find</button>
            </form>
        </div>
      </div>

      {/* Control Sidebar */}
      <div style={styles.sidebar}>
         <div style={styles.sidebarHeader}>
            <h2 style={styles.title}>Map Setup</h2>
            <p style={styles.subtitle}>Align your layout with real-world Google Maps satellite imagery.</p>
         </div>

         {/* Compass */}
         <div style={styles.compassContainer}>
            <div style={styles.compassBox}>
               <div style={{ ...styles.compassNeedle, transform: `rotate(${rotation}deg)` }} />
               <div style={styles.compassDot} />
               <span style={styles.compassLabel}>N</span>
            </div>
            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#888", marginTop: 8 }}>Heading</p>
         </div>

         <div style={styles.controlsList}>
            <div style={styles.controlGroup}>
               <div style={styles.controlLabelRow}>
                  <span>Rotation</span>
                  <span>{rotation}°</span>
               </div>
               <input type="range" min="0" max="360" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} style={styles.slider} />
            </div>

            <div style={styles.controlGroup}>
               <div style={styles.controlLabelRow}>
                  <span>Opacity</span>
                  <span>{Math.round(opacity * 100)}%</span>
               </div>
               <input type="range" min="10" max="100" value={opacity * 100} onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={styles.slider} />
            </div>

            <div style={styles.controlGroup}>
               <div style={styles.controlLabelRow}>
                  <span>Scale</span>
                  <span>{Math.round(overlayScale * 100)}%</span>
               </div>
               <input type="range" min="10" max="400" value={overlayScale * 100} onChange={(e) => setOverlayScale(Number(e.target.value) / 100)} style={styles.slider} />
            </div>
         </div>

         {message && <div style={styles.message}>{message}</div>}

         <div style={styles.sidebarFooter}>
            <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
               <Save size={18} />
               {saving ? "Saving..." : "Save Configuration"}
            </button>
         </div>
      </div>
    </div>
  );
};

const styles = {
  loader: { height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "#0b1120" },
  page: { display: "flex", width: "100%", height: "100vh", background: "#0b1120", overflow: "hidden", fontFamily: "'Inter', sans-serif" },
  mapArea: { flex: 1, position: "relative" },
  header: {
     position: "absolute", top: 24, left: 24, right: 24, zIndex: 1000,
     display: "flex", gap: 16, alignItems: "center"
  },
  backBtn: {
     display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
     background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)", color: "#fff",
     border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", fontWeight: 600, fontSize: "0.9rem"
  },
  searchForm: {
     display: "flex", alignItems: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)",
     border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, overflow: "hidden", maxWidth: 400, flex: 1
  },
  searchInput: { flex: 1, padding: "12px 16px", background: "transparent", border: "none", color: "#fff", outline: "none", fontSize: "0.9rem" },
  searchBtn: { padding: "0 24px", background: "#14b8a6", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", height: "100%" },
  
  sidebar: {
     width: 380, background: "#1e1e2e", borderLeft: "1px solid #333",
     display: "flex", flexDirection: "column", zIndex: 10
  },
  sidebarHeader: { padding: 32, borderBottom: "1px solid #333" },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#fff" },
  subtitle: { margin: "8px 0 0", fontSize: "0.9rem", color: "#888", lineHeight: 1.5 },
  
  compassContainer: { padding: "32px 0", borderBottom: "1px solid #333", display: "flex", flexDirection: "column", alignItems: "center" },
  compassBox: {
     width: 80, height: 80, borderRadius: "50%", background: "#2a2a3e",
     display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
     border: "2px solid rgba(255,255,255,0.1)"
  },
  compassNeedle: {
     position: "absolute", bottom: "50%", width: 4, height: 32, background: "#ef4444",
     borderRadius: 2, transformOrigin: "bottom center", transition: "transform 0.1s ease"
  },
  compassDot: { width: 6, height: 6, borderRadius: "50%", background: "#fff", zIndex: 2 },
  compassLabel: { position: "absolute", top: 6, fontSize: 10, fontWeight: 900, color: "#fff", zIndex: 2 },

  controlsList: { padding: 32, flex: 1, display: "flex", flexDirection: "column", gap: 24 },
  controlGroup: { display: "flex", flexDirection: "column", gap: 12 },
  controlLabelRow: { display: "flex", justifyContent: "space-between", color: "#fff", fontSize: "0.95rem", fontWeight: 600 },
  slider: { width: "100%", accentColor: "#14b8a6", height: 6, borderRadius: 3, outline: "none" },
  message: { margin: "0 32px", padding: 12, background: "rgba(20, 184, 166, 0.1)", color: "#14b8a6", textAlign: "center", borderRadius: 8, fontWeight: 600, fontSize: "0.85rem" },

  sidebarFooter: { padding: 32 },
  saveBtn: {
     width: "100%", padding: "14px 0", background: "#14b8a6", color: "#fff", border: "none",
     borderRadius: 12, fontWeight: 700, fontSize: "1rem", cursor: "pointer",
     display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "0.2s"
  }
};

export default MapOverlayEditorPage;
