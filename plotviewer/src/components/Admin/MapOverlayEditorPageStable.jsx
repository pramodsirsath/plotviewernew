import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Search } from "lucide-react";

import API from "../../services/api";
import { createCustomOverlayClass } from "../../utils/CustomOverlay";
import { loadGoogleMaps } from "../../utils/googleMapsLoader";
import { generateLayoutSVG, getLayoutCropBounds } from "../../utils/plotGeometry";

const DEFAULT_CENTER = [19.846811, 75.890633];
const DEFAULT_ZOOM = 18;
const DEFAULT_OPACITY = 0.65;
const DEFAULT_SCALE = 1;
const hasSavedMapOverlay = (mapOverlay) => {
  const lat = mapOverlay?.center?.lat;
  const lng = mapOverlay?.center?.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  return (
    Math.abs(lat) > 1e-6
    || Math.abs(lng) > 1e-6
    || (Number.isFinite(mapOverlay?.rotation) && mapOverlay.rotation !== 0)
    || (Number.isFinite(mapOverlay?.opacity) && mapOverlay.opacity !== DEFAULT_OPACITY)
    || (Number.isFinite(mapOverlay?.zoom) && mapOverlay.zoom !== DEFAULT_ZOOM)
    || (Number.isFinite(mapOverlay?.scale) && mapOverlay.scale !== DEFAULT_SCALE)
  );
};
const getOverlayViewState = (layout) => {
  if (hasSavedMapOverlay(layout?.mapOverlay)) {
    return {
      center: [layout.mapOverlay.center.lat, layout.mapOverlay.center.lng],
      rotation: layout.mapOverlay.rotation || 0,
      opacity: layout.mapOverlay.opacity || DEFAULT_OPACITY,
      zoom: layout.mapOverlay.zoom || DEFAULT_ZOOM,
      scale: layout.mapOverlay.scale || DEFAULT_SCALE,
    };
  }

  return {
    center: DEFAULT_CENTER,
    rotation: 0,
    opacity: DEFAULT_OPACITY,
    zoom: DEFAULT_ZOOM,
    scale: DEFAULT_SCALE,
  };
};

const MapOverlayEditorPageStable = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayImageUrlRef = useRef("");
  const mapIdleListenerRef = useRef(null);
  const initialViewportAppliedRef = useRef(false);

  const [layout, setLayout] = useState(null);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [overlayScale, setOverlayScale] = useState(DEFAULT_SCALE);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isMobile = viewport.width < 980;
  const mobileMapHeight = Math.max(340, Math.min(620, Math.round(viewport.height * 0.58)));

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await API.get(`/layout/${id}`);
        const data = res.data;
        const overlayViewState = getOverlayViewState(data);

        setLayout(data);
        setCenter(overlayViewState.center);
        setRotation(overlayViewState.rotation);
        setOpacity(overlayViewState.opacity);
        setZoom(overlayViewState.zoom);
        setOverlayScale(overlayViewState.scale);
      } catch (error) {
        setMessage("Failed to load layout");
      } finally {
        setLoading(false);
      }
    };

    fetchLayout();
  }, [id]);

  useEffect(() => {
    if (loading || !layout || !mapRef.current || mapInstanceRef.current) {
      return;
    }
    

    let cancelled = false;
    let localMap = null;
    const initialViewState = getOverlayViewState(layout);

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) {
          return;
        }

        // Clear any leftover Google Maps DOM from a prior strict-mode mount.
        mapRef.current.innerHTML = "";

        localMap = new maps.Map(mapRef.current, {
          center: { lat: initialViewState.center[0], lng: initialViewState.center[1] },
          zoom: initialViewState.zoom,
          mapTypeId: "roadmap",
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: false,
        });

        mapInstanceRef.current = localMap;
        initialViewportAppliedRef.current = false;
        mapIdleListenerRef.current = localMap.addListener("idle", () => {
          const nextZoom = localMap.getZoom();
          setZoom((previousZoom) => (previousZoom === nextZoom ? previousZoom : nextZoom));
        });

        setMapReady(true);
      })
      .catch(() => {
        setMessage("Failed to load Google Maps");
      });

    return () => {
      cancelled = true;

      if (mapIdleListenerRef.current) {
        mapIdleListenerRef.current.remove();
        mapIdleListenerRef.current = null;
      }

      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
        overlayImageUrlRef.current = "";
      }

      if (mapInstanceRef.current === localMap) {
        mapInstanceRef.current = null;
      }

      initialViewportAppliedRef.current = false;
      setMapReady(false);

      if (mapRef.current) {
        mapRef.current.innerHTML = "";
      }
    };
  }, [loading, layout]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !layout) {
      return;
    }

    const maps = window.google?.maps;
    if (!maps) {
      return;
    }

    const cropBounds = getLayoutCropBounds(layout);
    const aspect = cropBounds.width > 0 ? cropBounds.height / cropBounds.width : 1;
    const baseWidthMeters = 200;
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

    const imageUrl = generateLayoutSVG(layout);
    if (!imageUrl) {
      return;
    }

    const map = mapInstanceRef.current;
    if (!initialViewportAppliedRef.current) {
      map.setCenter({ lat: center[0], lng: center[1] });
      map.setZoom(zoom);
      initialViewportAppliedRef.current = true;
    }

    if (!overlayRef.current || overlayImageUrlRef.current !== imageUrl) {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
      }

      const CustomOverlayClass = createCustomOverlayClass(maps);
      const overlay = new CustomOverlayClass(
        bounds,
        imageUrl,
        opacity,
        rotation,
        overlayScale,
        (nextCenter) => {
          setCenter([nextCenter.lat, nextCenter.lng]);
        }
      );

      overlay.setMap(map);
      overlayRef.current = overlay;
      overlayImageUrlRef.current = imageUrl;
      const syncOverlay = () => {
        overlay.updateConfig({
          opacity,
          rotation,
          scale: overlayScale,
          bounds,
        });
      };
      window.requestAnimationFrame(syncOverlay);
      maps.event.addListenerOnce(map, "idle", syncOverlay);
      return;
    }

    overlayRef.current.updateConfig({
      opacity,
      rotation,
      scale: overlayScale,
      bounds,
    });
  }, [mapReady, layout, center, rotation, opacity, overlayScale]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google?.maps) {
      return;
    }

    window.google.maps.event.trigger(mapInstanceRef.current, "resize");
    overlayRef.current?.updateConfig({});
  }, [mapReady, viewport.width, viewport.height]);

  const handleSave = async () => {
    if (!layout?._id) {
      return;
    }

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
      setMessage("Map overlay saved!");
      setTimeout(() => setMessage(""), 2500);
    } catch (error) {
      setMessage("Failed to save overlay");
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    if (!searchQuery.trim()) {
      return;
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();

      if (data.length === 0) {
        setMessage("Location not found");
        setTimeout(() => setMessage(""), 2000);
        return;
      }

      const nextCenter = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      setCenter(nextCenter);
      setZoom(DEFAULT_ZOOM);

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter({ lat: nextCenter[0], lng: nextCenter[1] });
        mapInstanceRef.current.setZoom(DEFAULT_ZOOM);
      }
    } catch {
      setMessage("Search failed");
    }
  };

  if (loading) {
    return <div style={styles.loader}>Loading Map...</div>;
  }
  

  return (
    <div style={{ ...styles.page, flexDirection: isMobile ? "column" : "row" }}>
      {isMobile && (
        <div style={styles.mobileHeader}>
          <button onClick={() => navigate("/admin-dashboard")} style={{ ...styles.backBtn, width: "100%", justifyContent: "center" }}>
            <ArrowLeft size={18} />
            Back to Dashboard
          </button>

          <form onSubmit={handleSearch} style={{ ...styles.searchForm, width: "100%", maxWidth: "none" }}>
            <Search size={18} color="#aaa" style={{ marginLeft: 16, flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search location (e.g. Jalna)..."
              style={{ ...styles.searchInput, fontSize: "16px" }}
            />
            <button type="submit" style={styles.searchBtn}>Find</button>
          </form>
        </div>
      )}

      <div style={{ ...styles.mapArea, height: isMobile ? mobileMapHeight : "100%" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {!isMobile && (
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
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search location (e.g. Jalna)..."
                style={styles.searchInput}
              />
              <button type="submit" style={styles.searchBtn}>Find</button>
            </form>
          </div>
        )}
      </div>

      <div style={{
        ...styles.sidebar,
        width: isMobile ? "100%" : 380,
        borderLeft: isMobile ? "none" : "1px solid #333",
        borderTop: isMobile ? "1px solid #333" : "none",
        flex: isMobile ? "1 1 auto" : "none",
        minHeight: isMobile ? 0 : "auto",
      }}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.title}>Map Setup</h2>
          <p style={styles.subtitle}>Align your layout with real-world Google Maps satellite imagery.</p>
        </div>

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
              <span>{rotation}deg</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={rotation}
              onChange={(event) => setRotation(Number(event.target.value))}
              style={styles.slider}
            />
          </div>

          <div style={styles.controlGroup}>
            <div style={styles.controlLabelRow}>
              <span>Opacity</span>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={opacity * 100}
              onChange={(event) => setOpacity(Number(event.target.value) / 100)}
              style={styles.slider}
            />
          </div>

          <div style={styles.controlGroup}>
            <div style={styles.controlLabelRow}>
              <span>Scale</span>
              <span>{Math.round(overlayScale * 100)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="400"
              value={overlayScale * 100}
              onChange={(event) => setOverlayScale(Number(event.target.value) / 100)}
              style={styles.slider}
            />
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
  loader: {
    height: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    background: "#0b1120",
  },
  page: {
    display: "flex",
    width: "100%",
    height: "100dvh",
    background: "#0b1120",
    overflow: "hidden",
    fontFamily: "'Inter', sans-serif",
  },
  mobileHeader: {
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background: "#0f172a",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  mapArea: {
    flex: 1,
    position: "relative",
    minHeight: 0,
  },
  header: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    zIndex: 1000,
    display: "flex",
    gap: 16,
    alignItems: "center",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(12px)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  searchForm: {
    display: "flex",
    alignItems: "center",
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    overflow: "hidden",
    maxWidth: 400,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    padding: "12px 16px",
    background: "transparent",
    border: "none",
    color: "#fff",
    outline: "none",
    fontSize: "0.9rem",
  },
  searchBtn: {
    padding: "0 24px",
    background: "#14b8a6",
    border: "none",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    height: "100%",
  },
  sidebar: {
    width: 380,
    background: "#1e1e2e",
    borderLeft: "1px solid #333",
    display: "flex",
    flexDirection: "column",
    zIndex: 10,
    minHeight: 0,
  },
  sidebarHeader: { padding: 32, borderBottom: "1px solid #333" },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#fff" },
  subtitle: { margin: "8px 0 0", fontSize: "0.9rem", color: "#888", lineHeight: 1.5 },
  compassContainer: {
    padding: "32px 0",
    borderBottom: "1px solid #333",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  compassBox: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "#2a2a3e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    border: "2px solid rgba(255,255,255,0.1)",
  },
  compassNeedle: {
    position: "absolute",
    bottom: "50%",
    width: 4,
    height: 32,
    background: "#ef4444",
    borderRadius: 2,
    transformOrigin: "bottom center",
    transition: "transform 0.1s ease",
  },
  compassDot: { width: 6, height: 6, borderRadius: "50%", background: "#fff", zIndex: 2 },
  compassLabel: { position: "absolute", top: 6, fontSize: 10, fontWeight: 900, color: "#fff", zIndex: 2 },
  controlsList: {
    padding: 32,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    minHeight: 0,
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 12 },
  controlLabelRow: { display: "flex", justifyContent: "space-between", color: "#fff", fontSize: "0.95rem", fontWeight: 600 },
  slider: { width: "100%", accentColor: "#14b8a6", height: 6, borderRadius: 3, outline: "none" },
  message: {
    margin: "0 32px",
    padding: 12,
    background: "rgba(20, 184, 166, 0.1)",
    color: "#14b8a6",
    textAlign: "center",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.85rem",
  },
  sidebarFooter: { padding: 32, position: "sticky", bottom: 0, background: "#1e1e2e" },
  saveBtn: {
    width: "100%",
    padding: "14px 0",
    background: "#14b8a6",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: "1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "0.2s",
  },
};

export default MapOverlayEditorPageStable;
