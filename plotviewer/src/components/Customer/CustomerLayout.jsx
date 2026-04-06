import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import { FloatingUI } from "../shared/FloatingUI";
import { RenderProp } from "../shared/Props3D";
import CompassIndicator from "../shared/CompassIndicator";
import MapReadOnlyView from "../shared/MapReadOnlyView";
import PlotSelection3D from "../shared/PlotSelection3D";
import GroundTextLabel3D from "../shared/GroundTextLabel3D";
import CameraAngleController from "../shared/CameraAngleController";
import FitToLayoutController from "../shared/FitToLayoutController";
import useIsCoarsePointer from "../shared/useIsCoarsePointer";
import { getPlotBounds, getPlotCenter } from "../../utils/plotGeometry";
import {
  blendHexColors,
  LAYOUT_MAP_COLORS,
  LAYOUT_STATUS_COLORS,
} from "../../theme/layoutMapTheme";

const SCALE3D = 0.05;
const CAMERA_ANIMATION_DURATION = 1000;
const STATUS_WAVE_DURATION = 1800;
const BASE_AZIMUTH = -Math.PI / 4; // default 45° view (in radians, negative to match visual)
const POLAR_3D = Math.PI / 4; // 45° polar angle for 3D view
const POLAR_EPS = 0.0005; // tiny epsilon to lock polar angle in OrbitControls
const TOP_DOWN_POLAR_EPS = 0.0001;
const DEFAULT_TOUCH_CONTROLS = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const MOBILE_TOUCH_CONTROLS = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

const shortestAngleDiff = (from, to) => {
  let diff = to - from;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
};

// --- 3D Components ---
function CameraAnimator({ cameraTargetPlot, image, layout, isTopDown, angleAnimating, fitLocked }) {
  const { camera, controls } = useThree();

  React.useEffect(() => {
    if (angleAnimating || fitLocked) return; // skip animating camera when angle/fit lock is active
    if (cameraTargetPlot === undefined) return;
    if (!controls || !image || !layout) return;

    const analysisW = layout.meta?.analysisWidth || image.width;
    const analysisH = layout.meta?.analysisHeight || image.height;
    let frame;
    let cancelled = false;
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();

    const getSpherical = (pos, target) => {
      const v = pos.clone().sub(target);
      const dist = Math.max(v.length(), 0.0001);
      const polar = Math.acos(THREE.MathUtils.clamp(v.y / dist, -1, 1));
      const azimuth = Math.atan2(v.x, v.z);
      return { dist, polar, azimuth };
    };

    const startSph = getSpherical(startPos, startTarget);
    let endTarget = new THREE.Vector3();
    let endPos = new THREE.Vector3();

    if (cameraTargetPlot) {
      const cx = getPlotCenter(cameraTargetPlot).x * SCALE3D - (analysisW * SCALE3D) / 2;
      const cz = getPlotCenter(cameraTargetPlot).y * SCALE3D - (analysisH * SCALE3D) / 2;
      endTarget.set(cx, 0, cz);

      const bounds = getPlotBounds(cameraTargetPlot);
      const width = Math.max(0.0001, bounds.width * SCALE3D);
      const height = Math.max(0.0001, bounds.height * SCALE3D);
      const fillFraction = 0.82; // occupy most of the viewport for a clearer selection
      const fov = ((camera.fov || 45) * Math.PI) / 180;
      const aspect = camera.aspect || (window.innerWidth / window.innerHeight);
      const tanFov2 = Math.tan(fov / 2);
      const halfH = height / 2;
      const halfW = width / 2;
      const distV = halfH / (tanFov2 * fillFraction);
      const distH = halfW / (tanFov2 * aspect * fillFraction);
      const dist = Math.max(4.5, Math.max(distV, distH));
      if (isTopDown) {
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos.set(
          endTarget.x + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(TOP_DOWN_POLAR_EPS),
          endTarget.z + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        const polar = POLAR_3D;
        const azimuth = startSph.azimuth || BASE_AZIMUTH;

        endPos.set(
          endTarget.x + dist * Math.sin(polar) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(polar),
          endTarget.z + dist * Math.sin(polar) * Math.cos(azimuth)
        );
      }
    } else {
      const target = new THREE.Vector3(0, 0, 0);
      const boxW = analysisW * SCALE3D;
      const boxH = analysisH * SCALE3D;
      const halfW = boxW / 2;
      const halfH = boxH / 2;
      const fov = (camera.fov || 45) * (Math.PI / 180);
      const aspect = camera.aspect || (window.innerWidth / window.innerHeight);
      const distForH = halfH / Math.tan(fov / 2);
      const distForW = halfW / (Math.tan(fov / 2) * aspect);
      const dist = Math.max(distForH, distForW) * 1.6;
      endTarget.copy(target);
      if (isTopDown) {
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos.set(
          target.x + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          target.y + dist * Math.cos(TOP_DOWN_POLAR_EPS),
          target.z + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        const polar = POLAR_3D;
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos.set(
          target.x + dist * Math.sin(polar) * Math.sin(azimuth),
          target.y + dist * Math.cos(polar),
          target.z + dist * Math.sin(polar) * Math.cos(azimuth)
        );
      }
    }

    const endSph = getSpherical(endPos, endTarget);
    const startTime = performance.now();
    const cancelOnInteract = () => { cancelled = true; };
    controls.addEventListener('start', cancelOnInteract);

    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / CAMERA_ANIMATION_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const currentTarget = new THREE.Vector3().lerpVectors(startTarget, endTarget, ease);

      controls.target.copy(currentTarget);

      const currentDist = THREE.MathUtils.lerp(startSph.dist, endSph.dist, ease);
      const currentPolar = startSph.polar + shortestAngleDiff(startSph.polar, endSph.polar) * ease;
      const currentAzimuth = startSph.azimuth + shortestAngleDiff(startSph.azimuth, endSph.azimuth) * ease;

      camera.position.set(
        currentTarget.x + currentDist * Math.sin(currentPolar) * Math.sin(currentAzimuth),
        currentTarget.y + currentDist * Math.cos(currentPolar),
        currentTarget.z + currentDist * Math.sin(currentPolar) * Math.cos(currentAzimuth)
      );

      controls.update();
      if (t < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => {
      cancelled = true;
      controls.removeEventListener('start', cancelOnInteract);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cameraTargetPlot, camera, controls, image, layout]);

  return null;
}

function NavigateToNorth({ trigger, onDone }) {
  const { controls, camera } = useThree();
  React.useEffect(() => {
    if (!trigger || !controls) return;
    let frame;
    let cancelled = false;
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
    if (isSelected) return LAYOUT_MAP_COLORS.selectedPlot;
    const statusColor = LAYOUT_STATUS_COLORS[plot.status] || LAYOUT_MAP_COLORS.plot;

    if (statusRevealProgress <= 0) return LAYOUT_MAP_COLORS.plot;
    if (statusRevealProgress >= 1) return statusColor;

    return blendHexColors(LAYOUT_MAP_COLORS.plot, statusColor, statusRevealProgress);
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
          <lineBasicMaterial attach="material" color={LAYOUT_MAP_COLORS.plotNumber} linewidth={1} />
        </lineSegments>
      </mesh>
      {plot.plotNo && (
        <GroundTextLabel3D
          text={plot.plotNo}
          position={[center.x * SCALE3D, isSelected ? 0.12 : 0.06, center.y * SCALE3D]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={labelSize}
          color={isSelected ? LAYOUT_MAP_COLORS.white : LAYOUT_MAP_COLORS.plotNumber}
          opacity={isDimmed ? 0.25 : 1}
          depthWrite={false}
          renderOrder={1}
          raycast={() => null}
        />
      )}
    </group>
  );
});

function BoundaryMesh({ boundary, meta }) {
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
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}><meshStandardMaterial color={LAYOUT_MAP_COLORS.background} roughness={1} /></mesh>;
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
  return <mesh geometry={wallGeometry}><meshStandardMaterial color={LAYOUT_MAP_COLORS.compoundWall} roughness={0.85} metalness={0.05} side={THREE.DoubleSide} /></mesh>;
}



// ---------------------
const CustomerLayout = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [image, setImage] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
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
  const statusAnimRef = useRef(null);
  const controlsRef = useRef();
  const [isTopDown, setIsTopDown] = useState(false);
  const [angleAnimating, setAngleAnimating] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [fitLocked, setFitLocked] = useState(false);
  const isCoarsePointer = useIsCoarsePointer();

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await API.get(`/layout/${id}`);
        setLayout(res.data);
        setGalleryImages(res.data.galleryImages || []);
        const img = new window.Image();
        img.src = resolveServerUrl(res.data.imageUrl);
        img.onload = () => setImage(img);
      } catch (err) { console.error(err); }
    };
    fetchLayout();
  }, [id]);

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

  const handleNavigateNorth = useCallback(() => {
    setNavigateNorthTrigger((n) => n + 1);
  }, []);

  const fitToScreen = () => {
    setSelectedPlot(null);
    setCameraTargetPlot(undefined);
    setFitLocked(false);
    setAngleAnimating(true);
    setFitKey((k) => k + 1);
  };

  const focusPlot = (plot) => {
    setFitLocked(false);
    setSelectedPlot(plot);
    setCameraTargetPlot(plot);
  };

  // Clear fit lock when user interacts with controls (so Home persists until user starts interacting)
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const onStart = () => setFitLocked(false);
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controlsRef]);

  // Removed pointer handlers for single-finger pan / two-finger rotate,
  // as OrbitControls built-in touches config handles this correctly.

  useEffect(() => {
    if (searchQuery && layout?.plots) {
      const match = layout.plots.find(p => p.plotNo?.toLowerCase() === searchQuery.toLowerCase() || p.id === searchQuery);
      if (match) focusPlot(match);
    }
  }, [searchQuery, layout]);

  if (!layout || !image) return <div style={styles.page} />;

  const imageCenterX = image.width / 2;
  const imageCenterY = image.height / 2;

  return (
    <div style={styles.page}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute', top: 20, left: 20, zIndex: 10,
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(20, 20, 20, 0.75)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', transition: 'transform 0.2s ease',
        }}
        title="Back"
      >←</button>

      {/* Layout name */}
      <div style={{ position: 'absolute', top: 22, left: 76, zIndex: 10, color: 'var(--text)', fontWeight: 800, fontSize: '1rem', fontFamily: "'Outfit','Inter',sans-serif", background: 'var(--surface)', padding: '8px 16px', borderRadius: 12, backdropFilter: 'blur(16px)', border: '1px solid var(--line)' }}>
        {layout.name}
      </div>

      {/* Compass */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 8 }}>
        <CompassIndicator rotation={cameraAzimuth} frontDirection={layout?.frontDirection || 0} onClick={handleNavigateNorth} />
      </div>

      <FloatingUI
        isCanvasMode={true}
        setIsCanvasMode={() => {}}
        onFit={() => fitToScreen()}
        onShare={null}
        onOpenGallery={() => setShowGallery(true)}
        onOpenInfo={() => setShowInfo(true)}
        onLocate={() => setShowMap(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showExtraActions={true}
        showStatus={showStatus}
        setShowStatus={setShowStatus}
        isTopDown={isTopDown}
        onToggleTopDown={() => setIsTopDown((s) => !s)}
      />

      {/* Selected plot info */}
      {selectedPlot && (
        <div style={styles.infoPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h4 style={{ marginTop: 0, marginBottom: 6, color: 'var(--text)', fontFamily: "'Outfit','Inter',sans-serif" }}>Plot {selectedPlot.plotNo || "-"}</h4>
            <button onClick={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
          </div>
          <p style={styles.infoText}>Status: <span style={{ fontWeight: 700, color: LAYOUT_STATUS_COLORS[selectedPlot.status] || LAYOUT_STATUS_COLORS.Available }}>{selectedPlot.status}</span></p>
          <p style={styles.infoText}>Area: {selectedPlot.area || 0} sq.ft / {((selectedPlot.area || 0) * 0.092903).toFixed(1)} m²</p>
          <p style={styles.infoText}>Size: {selectedPlot.plotWidth || "-"} × {selectedPlot.plotHeight || "-"} ft</p>
          {selectedPlot.category && selectedPlot.category !== "Standard" && (
            <p style={styles.infoText}>Category: <span style={{ fontWeight: 700, color: selectedPlot.category === 'Premium' ? '#d97706' : '#8b5cf6' }}>{selectedPlot.category}</span></p>
          )}
        </div>
      )}

      {/* 3D Canvas */}
      {layout && image && (
        <div style={{ width: '100%', height: '100%', animation: 'fadeIn 1s ease-out' }}>
          <Canvas dpr={[1, 2]} performance={{ min: 0.5 }} shadows={false} camera={{ position: [0, Math.max((layout?.meta?.analysisHeight || image.height) * SCALE3D * 1.5, 50), ((layout?.meta?.analysisHeight || image.height) * SCALE3D) / 2 + 40], fov: 45 }} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, cursor: 'default', touchAction: 'none' }}
            onPointerMissed={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }}>
            <color attach="background" args={[LAYOUT_MAP_COLORS.background]} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
            <directionalLight position={[50, 150, 50]} intensity={1.0} />
            <CameraAnimator cameraTargetPlot={cameraTargetPlot} image={image} layout={layout} isTopDown={isTopDown} angleAnimating={angleAnimating} fitLocked={fitLocked} />
            <CameraAngleController isTopDown={isTopDown} controlsRef={controlsRef} duration={360} onStart={() => setAngleAnimating(true)} onComplete={() => setAngleAnimating(false)} />
            <FitToLayoutController fitKey={fitKey} isTopDown={isTopDown} image={image} layout={layout} scale={SCALE3D} duration={1600} onStart={() => setAngleAnimating(true)} onComplete={() => { setAngleAnimating(false); setFitLocked(true); }} />
            <CameraRotationTracker onAngleChange={setCameraAzimuth} />
            <NavigateToNorth trigger={navigateNorthTrigger} onDone={() => {}} />
            <group position={[-((layout?.meta?.analysisWidth || image.width) * SCALE3D) / 2, 0, -((layout?.meta?.analysisHeight || image.height) * SCALE3D) / 2]}>
              <BoundaryMesh boundary={layout.boundary} meta={layout.meta || { analysisWidth: image.width, analysisHeight: image.height }} />
              <CompoundWall boundary={layout.boundary} meta={layout.meta || { analysisWidth: image.width, analysisHeight: image.height }} />
              {layout.plots.map((plot) => {
                const plotCenter = getPlotCenter(plot);
                const analysisW = layout.meta?.analysisWidth || image.width;
                const normalizedX = plotCenter.x / analysisW;
                const plotReveal = Math.min(1, Math.max(0, (statusRevealProgress * 1.6) - normalizedX * 0.6));
                return <PlotMesh key={plot._id || plot.id} plot={plot} isSelected={selectedPlot?._id === plot._id} isDimmed={!!selectedPlot && selectedPlot._id !== plot._id} onClick={(p) => focusPlot(p)} showStatus={showStatus} statusRevealProgress={plotReveal} meta={layout.meta} />;
              })}
            </group>
            {(layout.props3D || []).map((item) => <RenderProp key={item.id} item={item} onClick={(i, e) => e.stopPropagation()} isSelected={false} transformMode={"translate"} onTransformEnd={() => {}} />)}

            {/* Selected plot dashed outline + dimension label (shared 3D overlay) */}
            {selectedPlot && (
              <PlotSelection3D plot={selectedPlot} scale={SCALE3D} />
            )}

            <OrbitControls
              ref={controlsRef}
              makeDefault
              touches={isCoarsePointer ? MOBILE_TOUCH_CONTROLS : DEFAULT_TOUCH_CONTROLS}
              minAzimuthAngle={-Infinity}
              maxAzimuthAngle={Infinity}
              minPolarAngle={POLAR_3D - POLAR_EPS}
              maxPolarAngle={POLAR_3D + POLAR_EPS}
              enableRotate={true}
              enablePan={true}
              enableDamping={true}
              dampingFactor={0.08}
              minDistance={5}
              maxDistance={(layout?.meta?.analysisHeight || image.height) * SCALE3D * 3}
            />
          </Canvas>
          {angleAnimating && <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'auto', background: 'transparent' }} />}
        </div>
      )}

      {/* Gallery (view-only, no upload) */}
      {showGallery && (
        <div style={styles.galleryOverlay} onClick={() => setShowGallery(false)}>
          <div style={styles.galleryModal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: 'var(--text)', fontSize: '1.4rem' }}>Gallery</h2>
              <button onClick={() => setShowGallery(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)' }}>&times;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
              {(galleryImages || []).map((img, index) => (
                <div key={index} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '1' }}>
                  <img src={resolveServerUrl(img)} alt={`Gallery ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
              {(!galleryImages || galleryImages.length === 0) && <p style={{ color: 'var(--muted)', fontSize: '0.9rem', gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>No images yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      {showInfo && layout && (
        <div style={styles.galleryOverlay} onClick={() => setShowInfo(false)}>
          <div style={styles.galleryModal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: 'var(--text)', fontSize: '1.4rem' }}>Layout Info</h2>
              <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)' }}>&times;</button>
            </div>
            <div style={{ color: 'var(--text)', fontSize: '0.95rem', lineHeight: 1.7 }}>
              <p><strong>Name:</strong> {layout.name || '-'}</p>
              <p><strong>Total Plots:</strong> {layout.plots?.length || 0}</p>
              <p><strong>Available:</strong> {layout.plots?.filter(p => p.status === 'Available').length || 0}</p>
              <p><strong>Reserved:</strong> {layout.plots?.filter(p => p.status === 'Reserved').length || 0}</p>
              <p><strong>Sold:</strong> {layout.plots?.filter(p => p.status === 'Sold').length || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      {showMap && layout && <MapReadOnlyView layout={layout} onClose={() => setShowMap(false)} />}
    </div>
  );
};


const styles = {
  page: { height: "100vh", background: LAYOUT_MAP_COLORS.background, position: "relative", overflow: "hidden" },
  infoPanel: {
    position: "absolute", top: 80, left: 20, background: "var(--surface)",
    backdropFilter: "blur(24px)", border: "1px solid var(--line)",
    padding: "16px", borderRadius: "18px", boxShadow: "var(--shadow-strong)",
    zIndex: 10, width: "240px", animation: "fadeInUp 0.3s ease-out", color: "var(--text)"
  },
  infoText: { margin: "5px 0", fontSize: "0.85rem", color: "var(--text)" },
  galleryOverlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  galleryModal: {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 28, padding: 24, width: 'min(640px, 100%)',
    maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 32px 64px rgba(0,0,0,0.3)',
  },
};

export default CustomerLayout;
