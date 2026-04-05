import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import { FloatingUI } from "../shared/FloatingUI";
import { RenderProp } from "../shared/Props3D";
import CompassIndicator from "../shared/CompassIndicator";
import MapReadOnlyView from "../shared/MapReadOnlyView";
import { getPlotBounds, getPlotCenter } from "../../utils/plotGeometry";

const SCALE3D = 0.05;
const CAMERA_ANIMATION_DURATION = 2000;
const STATUS_WAVE_DURATION = 1800;
const CREAM_COLOR = "#E8E2CD";
const STATUS_COLORS = {
  Available: "#22c55e",
  Reserved: "#f59e0b",
  Sold: "#ef4444",
};

// --- Shared 3D Components ---
function CameraAnimator({ cameraTargetPlot, isTopDownView, image, layout }) {
  const { camera, controls } = useThree();
  React.useEffect(() => {
    if (cameraTargetPlot === undefined) return;
    if (!controls || !image || !layout) return;
    const analysisW = layout.meta?.analysisWidth || image.width;
    const analysisH = layout.meta?.analysisHeight || image.height;
    let frame, cancelled = false;
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startTime = performance.now();
    let endTarget, endPos;
    if (cameraTargetPlot) {
      const cx = getPlotCenter(cameraTargetPlot).x * SCALE3D - (analysisW * SCALE3D) / 2;
      const cz = getPlotCenter(cameraTargetPlot).y * SCALE3D - (analysisH * SCALE3D) / 2;
      endTarget = new THREE.Vector3(cx, 0, cz);
      const bounds = getPlotBounds(cameraTargetPlot);
      const maxD = Math.max(bounds.width, bounds.height) * SCALE3D;
      const dist = Math.max(15, maxD * 1.6);
      endPos = new THREE.Vector3();
      if (isTopDownView) endPos.set(cx, dist, cz + 0.001);
      else endPos.set(cx - dist * 0.4, dist * 0.8, cz + dist * 0.8);
    } else {
      endTarget = new THREE.Vector3(0, 0, 0);
      const overviewH = Math.max(analysisH * SCALE3D * 1.5, 50);
      endPos = new THREE.Vector3(0, isTopDownView ? overviewH : overviewH * 0.6, isTopDownView ? 0.001 : (analysisH * SCALE3D) / 2 + 40);
    }
    const cancelOnInteract = () => { cancelled = true; };
    controls.addEventListener('start', cancelOnInteract);
    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / CAMERA_ANIMATION_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.update();
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelled = true; controls.removeEventListener('start', cancelOnInteract); if (frame) cancelAnimationFrame(frame); };
  }, [cameraTargetPlot, isTopDownView, camera, controls, image]);
  return null;
}

function NavigateToNorth({ trigger, onDone }) {
  const { controls, camera } = useThree();
  React.useEffect(() => {
    if (!trigger || !controls) return;
    let frame, cancelled = false;
    const startTime = performance.now();
    const startAzimuth = controls.getAzimuthalAngle();
    const diff = -startAzimuth;
    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / 800, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const currentAzimuth = startAzimuth + diff * ease;
      const distance = camera.position.distanceTo(controls.target);
      const polar = controls.getPolarAngle();
      camera.position.x = controls.target.x + distance * Math.sin(polar) * Math.sin(currentAzimuth);
      camera.position.z = controls.target.z + distance * Math.sin(polar) * Math.cos(currentAzimuth);
      camera.position.y = controls.target.y + distance * Math.cos(polar);
      controls.update();
      if (t < 1) frame = requestAnimationFrame(animate);
      else onDone?.();
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame); };
  }, [trigger, controls, camera]);
  return null;
}

function CameraRotationTracker({ onAngleChange }) {
  const { controls } = useThree();
  React.useEffect(() => {
    if (!controls) return;
    const handler = () => onAngleChange(controls.getAzimuthalAngle() * (180 / Math.PI));
    controls.addEventListener('change', handler);
    return () => controls.removeEventListener('change', handler);
  }, [controls, onAngleChange]);
  return null;
}

// Removed createPlotLabelTexture as using Vector Text
const PlotMesh = React.memo(function PlotMesh({ plot, isSelected, isDimmed, onClick, showStatus, statusRevealProgress, meta }) {
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape();
    if (plot.points && plot.points.length >= 6) {
      if (plot.isCurved) {
        const shapeVectors = [];
        for (let i = 0; i < plot.points.length; i += 2) {
          shapeVectors.push(new THREE.Vector2(plot.points[i] * SCALE3D, -plot.points[i + 1] * SCALE3D));
        }
        shape.moveTo(shapeVectors[0].x, shapeVectors[0].y);
        shape.splineThru(shapeVectors);
      } else {
        shape.moveTo(plot.points[0] * SCALE3D, -plot.points[1] * SCALE3D);
        for (let i = 2; i < plot.points.length; i += 2) {
          shape.lineTo(plot.points[i] * SCALE3D, -plot.points[i+1] * SCALE3D);
        }
        shape.lineTo(plot.points[0] * SCALE3D, -plot.points[1] * SCALE3D);
      }
    } else {
      shape.moveTo(plot.x * SCALE3D, -plot.y * SCALE3D);
      shape.lineTo((plot.x + plot.width) * SCALE3D, -plot.y * SCALE3D);
      shape.lineTo((plot.x + plot.width) * SCALE3D, -(plot.y + plot.height) * SCALE3D);
      shape.lineTo(plot.x * SCALE3D, -(plot.y + plot.height) * SCALE3D);
      shape.lineTo(plot.x * SCALE3D, -plot.y * SCALE3D);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: isSelected ? 0.1 : 0.05, bevelEnabled: false });
  }, [plot, isSelected]);

  const bounds = getPlotBounds(plot);

  // Wave transition color: blend between cream and status color spatially
  const plotColor = React.useMemo(() => {
    if (isSelected) return "#3b82f6";
    const statusColor = STATUS_COLORS[plot.status] || CREAM_COLOR;
    
    if (statusRevealProgress <= 0) return CREAM_COLOR;
    if (statusRevealProgress >= 1) return statusColor;

    // Blend
    const creamRGB = { r: 232, g: 226, b: 205 };
    const statusRGB = {
      r: parseInt(statusColor.slice(1, 3), 16),
      g: parseInt(statusColor.slice(3, 5), 16),
      b: parseInt(statusColor.slice(5, 7), 16),
    };
    const r = Math.round(creamRGB.r + (statusRGB.r - creamRGB.r) * statusRevealProgress);
    const g = Math.round(creamRGB.g + (statusRGB.g - creamRGB.g) * statusRevealProgress);
    const b = Math.round(creamRGB.b + (statusRGB.b - creamRGB.b) * statusRevealProgress);
    return `rgb(${r},${g},${b})`;
  }, [isSelected, plot.status, showStatus, statusRevealProgress]);

  const center = getPlotCenter(plot);
  const labelW = bounds.width * SCALE3D * 0.45;
  const labelH = bounds.height * SCALE3D * 0.45;
  const labelSize = Math.max(0.4, Math.min(labelW, labelH, 2.5));

  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(plot); }}
      >
        <meshStandardMaterial color={plotColor} roughness={1} metalness={0} transparent={isDimmed} opacity={isDimmed ? 0.25 : 1} />
        <lineSegments raycast={() => null} transparent={isDimmed} opacity={isDimmed ? 0.25 : 1}>
          <edgesGeometry attach="geometry" args={[geometry]} />
          <lineBasicMaterial attach="material" color="#1a1a1a" linewidth={1} />
        </lineSegments>
      </mesh>
      {plot.plotNo && (
        <Text
          position={[center.x * SCALE3D, isSelected ? 0.12 : 0.06, center.y * SCALE3D]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={labelSize}
          color={isSelected ? '#ffffff' : '#1a1a1a'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor={isSelected ? '#3b82f6' : CREAM_COLOR}
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZJhjp-Ek-_EeA.woff"
          fillOpacity={isDimmed ? 0.25 : 1}
          outlineOpacity={isDimmed ? 0.25 : 1}
          depthWrite={false}
          renderOrder={1}
          raycast={() => null}
        >
          {plot.plotNo}
        </Text>
      )}
    </group>
  );
});

function BoundaryMesh({ boundary, meta, isDimOverlay }) {
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape();
    if (boundary && boundary.length > 0) {
      shape.moveTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
      for (let i = 2; i < boundary.length; i += 2) shape.lineTo(boundary[i] * SCALE3D, -boundary[i + 1] * SCALE3D);
      shape.lineTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
    } else if (meta) {
      shape.moveTo(0, 0); shape.lineTo(meta.analysisWidth * SCALE3D, 0);
      shape.lineTo(meta.analysisWidth * SCALE3D, -meta.analysisHeight * SCALE3D); shape.lineTo(0, -meta.analysisHeight * SCALE3D);
    }
    return new THREE.ShapeGeometry(shape);
  }, [boundary, meta]);
  if (isDimOverlay) return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} raycast={() => null}><meshBasicMaterial color="#000000" transparent opacity={0.65} /></mesh>;
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}><meshStandardMaterial color="#3f3f3f" roughness={1} /></mesh>;
}

function CompoundWall({ boundary, meta }) {
  const wallGeometry = React.useMemo(() => {
    const points = [];
    if (boundary && boundary.length >= 6) {
      for (let i = 0; i < boundary.length; i += 2) points.push(new THREE.Vector3(boundary[i] * SCALE3D, 0, boundary[i + 1] * SCALE3D));
      points.push(points[0].clone());
    } else if (meta) {
      const w = meta.analysisWidth * SCALE3D, h = meta.analysisHeight * SCALE3D;
      points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, 0, 0), new THREE.Vector3(w, 0, h), new THREE.Vector3(0, 0, h), new THREE.Vector3(0, 0, 0));
    }
    if (points.length < 3) return null;
    const WALL_HEIGHT = 1.2;
    const positions = [], indices = [];
    for (let i = 0; i < points.length - 1; i++) {
      const bi = positions.length / 3;
      const a = points[i], b = points[i + 1];
      positions.push(a.x, 0, a.z, b.x, 0, b.z, b.x, WALL_HEIGHT, b.z, a.x, WALL_HEIGHT, a.z);
      indices.push(bi, bi + 1, bi + 2, bi, bi + 2, bi + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [boundary, meta]);
  if (!wallGeometry) return null;
  return <mesh geometry={wallGeometry}><meshStandardMaterial color="#8B7355" roughness={0.85} metalness={0.05} side={THREE.DoubleSide} /></mesh>;
}

// --- Main Component ---
const PublicLayoutView = () => {
  const { token } = useParams();
  const [layout, setLayout] = useState(null);
  const [image, setImage] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [isTopDownView, setIsTopDownView] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cameraAzimuth, setCameraAzimuth] = useState(0);
  const [cameraTargetPlot, setCameraTargetPlot] = useState(undefined);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [statusRevealProgress, setStatusRevealProgress] = useState(0);
  const [navigateNorthTrigger, setNavigateNorthTrigger] = useState(0);
  const statusAnimRef = React.useRef(null);

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await API.get(`/layouts/public/${token}`);
        setLayout(res.data);
        setGalleryImages(res.data.galleryImages || []);
        const img = new window.Image();
        img.src = resolveServerUrl(res.data.imageUrl);
        img.onload = () => setImage(img);
      } catch (error) { console.error(error); }
    };
    fetchLayout();
  }, [token]);

  // Status wave animation
  React.useEffect(() => {
    if (statusAnimRef.current) cancelAnimationFrame(statusAnimRef.current);
    const targetProgress = showStatus ? 1 : 0;
    const startProgress = statusRevealProgress;
    if (Math.abs(startProgress - targetProgress) < 0.001) return;
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / STATUS_WAVE_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setStatusRevealProgress(startProgress + (targetProgress - startProgress) * ease);
      if (t < 1) statusAnimRef.current = requestAnimationFrame(animate);
      else statusAnimRef.current = null;
    };
    statusAnimRef.current = requestAnimationFrame(animate);
    return () => { if (statusAnimRef.current) cancelAnimationFrame(statusAnimRef.current); };
  }, [showStatus]);

  const handleNavigateNorth = React.useCallback(() => {
    setNavigateNorthTrigger((n) => n + 1);
  }, []);

  const fitToScreen = () => {
    setSelectedPlot(null);
    setCameraTargetPlot(null);
  };

  const focusPlot = (plot) => {
    setSelectedPlot(plot);
    setCameraTargetPlot(plot);
  };

  useEffect(() => {
    if (searchQuery && layout?.plots) {
      const match = layout.plots.find(p => p.plotNo?.toLowerCase() === searchQuery.toLowerCase());
      if (match) focusPlot(match);
    }
  }, [searchQuery, layout]);

  const handleShare = () => { navigator.clipboard?.writeText(window.location.href); };

  if (!layout || !image) return <div style={{ height: '100vh', background: '#0b1120' }} />;

  const imageCenterX = image.width / 2;
  const imageCenterY = image.height / 2;
  const metaObj = layout.meta || { analysisWidth: image.width, analysisHeight: image.height };

  return (
    <div style={styles.page}>
      {/* Project Title */}
      <div style={styles.titleBar}>
        <div style={styles.titleIcon}>▲</div>
        <span style={styles.titleText}>{layout.name}</span>
      </div>

      {/* Compass */}
      <div style={{ position: 'absolute', top: 66, left: 16, zIndex: 20 }}>
        <CompassIndicator rotation={cameraAzimuth} frontDirection={layout?.frontDirection || 0} size={44} onClick={handleNavigateNorth} />
      </div>

      <FloatingUI
        isCanvasMode={true} setIsCanvasMode={() => {}}
        isTopDownView={isTopDownView} setIsTopDownView={setIsTopDownView}
        onFit={fitToScreen} onShare={handleShare}
        onOpenGallery={() => setShowGallery(true)} onOpenInfo={() => setShowInfo(true)}
        onLocate={() => setShowMap(true)}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} showExtraActions={true}
        showStatus={showStatus} setShowStatus={setShowStatus}
      />

      {/* Selected plot info */}
      {selectedPlot && (
        <div style={styles.infoPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h4 style={{ marginTop: 0, marginBottom: 6, color: '#fff', fontFamily: "'Outfit','Inter',sans-serif" }}>Plot {selectedPlot.plotNo || "-"}</h4>
            <button onClick={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
          </div>
          <p style={styles.infoText}>Status: <span style={{ fontWeight: 700, color: selectedPlot.status === 'Sold' ? '#ef4444' : selectedPlot.status === 'Reserved' ? '#f59e0b' : '#22c55e' }}>{selectedPlot.status}</span></p>
          <p style={styles.infoText}>Area: {selectedPlot.area || 0} sq.ft / {((selectedPlot.area || 0) * 0.092903).toFixed(1)} m²</p>
          <p style={styles.infoText}>Size: {selectedPlot.plotWidth || "-"} × {selectedPlot.plotHeight || "-"} ft</p>
          {selectedPlot.category && selectedPlot.category !== "Standard" && (
            <p style={styles.infoText}>Category: <span style={{ fontWeight: 700, color: selectedPlot.category === 'Premium' ? '#d97706' : '#8b5cf6' }}>{selectedPlot.category}</span></p>
          )}
          {selectedPlot.rate > 0 && <p style={styles.infoText}>Rate: ₹{selectedPlot.rate.toLocaleString('en-IN')}</p>}
          {layout?.builderContact?.whatsappNumber && (
            <a href={`https://wa.me/${layout.builderContact.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, interested in Plot #${selectedPlot.plotNo || '-'} at ${layout.name}`)}`} target="_blank" rel="noopener noreferrer" style={styles.whatsappBtn}>💬 WhatsApp</a>
          )}
        </div>
      )}

      {/* 3D Canvas */}
      {layout && image && (
        <div style={{ width: '100%', height: '100%', animation: 'fadeIn 1s ease-out' }}>
          <Canvas dpr={[1, 1.5]} performance={{ min: 0.5 }} shadows={false}
            camera={{ position: [0, Math.max(metaObj.analysisHeight * SCALE3D * 1.5, 50), metaObj.analysisHeight * SCALE3D / 2 + 40], fov: 45 }}
            style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, cursor: 'default', touchAction: 'none' }}
            onPointerMissed={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }}>
            <color attach="background" args={['#0b1120']} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
            <directionalLight position={[50, 150, 50]} intensity={1.0} />
            <CameraAnimator cameraTargetPlot={cameraTargetPlot} isTopDownView={isTopDownView} image={image} layout={layout} />
            <CameraRotationTracker onAngleChange={setCameraAzimuth} />
            <NavigateToNorth trigger={navigateNorthTrigger} onDone={() => {}} />
            <group position={[-(metaObj.analysisWidth * SCALE3D) / 2, 0, -(metaObj.analysisHeight * SCALE3D) / 2]}>
              <BoundaryMesh boundary={layout.boundary} meta={metaObj} />
              <CompoundWall boundary={layout.boundary} meta={metaObj} />
              {selectedPlot && isTopDownView && <BoundaryMesh boundary={layout.boundary} meta={metaObj} isDimOverlay={true} />}
              {layout.plots.map((plot) => {
                const plotCenter = getPlotCenter(plot);
                const normalizedX = plotCenter.x / metaObj.analysisWidth;
                const plotReveal = Math.min(1, Math.max(0, (statusRevealProgress * 1.6) - normalizedX * 0.6));
                return <PlotMesh key={plot._id || plot.id} plot={plot} isSelected={selectedPlot?._id === plot._id} isDimmed={!!selectedPlot && selectedPlot._id !== plot._id} onClick={(p) => focusPlot(p)} showStatus={showStatus} statusRevealProgress={plotReveal} meta={layout.meta} />;
              })}
            </group>
            {(layout.props3D || []).map((item) => <RenderProp key={item.id} item={item} onClick={(i, e) => e.stopPropagation()} isSelected={false} transformMode="translate" onTransformEnd={() => {}} />)}
            <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={isTopDownView ? 0.001 : Math.PI / 2 - 0.05} enableRotate enablePan enableDamping={true} dampingFactor={0.08} minDistance={5} maxDistance={metaObj.analysisHeight * SCALE3D * 3} />
          </Canvas>
        </div>
      )}

      {/* Gallery */}
      {showGallery && (
        <div style={styles.modalOverlay} onClick={() => setShowGallery(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={styles.modalTitle}>Gallery</h2>
              <button onClick={() => setShowGallery(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
              {(galleryImages || []).map((img, i) => (
                <div key={i} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', aspectRatio: '1' }}>
                  <img src={resolveServerUrl(img)} alt={`Gallery ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
              {(!galleryImages || galleryImages.length === 0) && <p style={{ color: '#94a3b8', fontSize: '0.9rem', gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>No images yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {showInfo && layout && (
        <div style={styles.modalOverlay} onClick={() => setShowInfo(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={styles.modalTitle}>Layout Info</h2>
              <button onClick={() => setShowInfo(false)} style={styles.modalClose}>&times;</button>
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.7 }}>
              <p><strong>Name:</strong> {layout.name || '-'}</p>
              <p><strong>Total Plots:</strong> {layout.plots?.length || 0}</p>
              <p><strong>Available:</strong> {layout.plots?.filter(p => p.status === 'Available').length || 0}</p>
              <p><strong>Reserved:</strong> {layout.plots?.filter(p => p.status === 'Reserved').length || 0}</p>
              <p><strong>Sold:</strong> {layout.plots?.filter(p => p.status === 'Sold').length || 0}</p>
            </div>
          </div>
        </div>
      )}

      {showMap && layout && <MapReadOnlyView layout={layout} onClose={() => setShowMap(false)} />}
    </div>
  );
};

const STATUS_STYLES = {
  Available: { fill: "rgba(148, 227, 148, 0.76)", solid: "#94e394", selectedFill: "#2D89EF" },
  Reserved: { fill: "rgba(184, 139, 74, 0.76)", solid: "#B88B4A", selectedFill: "#2D89EF" },
  Sold: { fill: "rgba(160, 67, 67, 0.78)", solid: "#A04343", selectedFill: "#2D89EF" },
};

const styles = {
  page: { height: "100vh", background: "#0b1120", position: "relative", overflow: "hidden" },
  titleBar: {
    position: 'absolute', top: 16, left: 16, zIndex: 20,
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(20, 20, 20, 0.8)', backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 18px 8px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  titleIcon: { width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #d97706, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' },
  titleText: { color: '#f59e0b', fontWeight: 900, fontSize: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Outfit','Inter',sans-serif" },
  infoPanel: {
    position: "absolute", top: 80, left: 16,
    background: "rgba(20, 20, 20, 0.88)", backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.12)", padding: "16px", borderRadius: "18px",
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)", zIndex: 10, width: "240px",
    animation: "fadeInUp 0.3s ease-out", color: "#f8fafc"
  },
  infoText: { margin: "5px 0", fontSize: "0.85rem", color: "#e2e8f0" },
  whatsappBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 16px', borderRadius: 999, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' },
  modalOverlay: { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 28, padding: 24, width: 'min(640px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' },
  modalTitle: { margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: '#f8fafc', fontSize: '1.4rem' },
  modalClose: { background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' },
};

export default PublicLayoutView;
