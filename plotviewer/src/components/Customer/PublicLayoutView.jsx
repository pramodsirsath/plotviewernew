import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import { FloatingUI } from "../shared/FloatingUI";
import { RenderProp } from "../shared/Props3D";
import CompassIndicator from "../shared/CompassIndicator";
import MapReadOnlyView from "../shared/MapReadOnlyView";
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
const BASE_AZIMUTH = -Math.PI / 4;
const POLAR_3D = Math.PI / 4;
const POLAR_EPS = 0.0005;
const TOP_DOWN_POLAR_EPS = 0.0001;
const DEFAULT_TOUCH_CONTROLS = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const MOBILE_TOUCH_CONTROLS = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

// --- Shared 3D Components ---
function CameraAnimator({ cameraTargetPlot, image, layout, isTopDown, angleAnimating, fitLocked }) {
  const { camera, controls } = useThree();
  React.useEffect(() => {
    if (angleAnimating || fitLocked) return; // don't run camera animations while angle animation/fit lock is running
    if (cameraTargetPlot === undefined) return;
    if (!controls || !image || !layout) return;
    const analysisW = layout.meta?.analysisWidth || image.width;
    const analysisH = layout.meta?.analysisHeight || image.height;
    let frame, cancelled = false;

    // Save previous control constraints/state
    const prevEnableRotate = controls.enableRotate;
    const prevEnablePan = controls.enablePan;
    const prevMinPolar = controls.minPolarAngle;
    const prevMaxPolar = controls.maxPolarAngle;
    const prevMinAz = typeof controls.minAzimuthAngle !== 'undefined' ? controls.minAzimuthAngle : null;
    const prevMaxAz = typeof controls.maxAzimuthAngle !== 'undefined' ? controls.maxAzimuthAngle : null;

    // Relax constraints & disable interactions while animating
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI / 2 - 0.0001;
    controls.minAzimuthAngle = -Math.PI;
    controls.maxAzimuthAngle = Math.PI;
    controls.update();

    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const getSpherical = (position, target) => {
      const offset = position.clone().sub(target);
      const distance = Math.max(offset.length(), 0.0001);

      return {
        distance,
        azimuth: Math.atan2(offset.x, offset.z),
      };
    };
    const startSph = getSpherical(startPos, startTarget);
    const startTime = performance.now();
    let endTarget, endPos;
    if (cameraTargetPlot) {
      const cx = getPlotCenter(cameraTargetPlot).x * SCALE3D - (analysisW * SCALE3D) / 2;
      const cz = getPlotCenter(cameraTargetPlot).y * SCALE3D - (analysisH * SCALE3D) / 2;
      endTarget = new THREE.Vector3(cx, 0, cz);
      const bounds = getPlotBounds(cameraTargetPlot);
      const width = Math.max(0.0001, bounds.width * SCALE3D);
      const height = Math.max(0.0001, bounds.height * SCALE3D);
      const fillFraction = 0.82;
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
        endPos = new THREE.Vector3(
          endTarget.x + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(TOP_DOWN_POLAR_EPS),
          endTarget.z + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        const polar = POLAR_3D;
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos = new THREE.Vector3(
          endTarget.x + dist * Math.sin(polar) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(polar),
          endTarget.z + dist * Math.sin(polar) * Math.cos(azimuth)
        );
      }
    } else {
      endTarget = new THREE.Vector3(0, 0, 0);
      const overviewH = Math.max(analysisH * SCALE3D * 1.6, 50);
      if (isTopDown) {
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos = new THREE.Vector3(
          overviewH * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          overviewH * Math.cos(TOP_DOWN_POLAR_EPS),
          overviewH * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        const dist = overviewH * 1.2;
        const polar = POLAR_3D;
        const azimuth = startSph.azimuth || BASE_AZIMUTH;
        endPos = new THREE.Vector3(
          dist * Math.sin(polar) * Math.sin(azimuth),
          dist * Math.cos(polar),
          dist * Math.sin(polar) * Math.cos(azimuth)
        );
      }
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
      else {
        // reapply final constraints
        controls.minPolarAngle = isTopDown ? 0 : POLAR_3D - POLAR_EPS;
        controls.maxPolarAngle = isTopDown ? 0 : POLAR_3D + POLAR_EPS;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.enableRotate = isTopDown ? false : prevEnableRotate;
        controls.enablePan = prevEnablePan;
        controls.update();
      }
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelled = true; controls.removeEventListener('start', cancelOnInteract); if (frame) cancelAnimationFrame(frame);
      // restore previous values in case of early cancel
      controls.minPolarAngle = prevMinPolar; controls.maxPolarAngle = prevMaxPolar;
      if (prevMinAz !== null) controls.minAzimuthAngle = prevMinAz; if (prevMaxAz !== null) controls.maxAzimuthAngle = prevMaxAz;
      controls.enableRotate = prevEnableRotate; controls.enablePan = prevEnablePan; controls.update(); };
  }, [cameraTargetPlot, camera, controls, image, layout]);
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

// --- Main Component ---
const PublicLayoutView = () => {
  const { token } = useParams();
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
  const statusAnimRef = React.useRef(null);
  const controlsRef = useRef();
  const [isTopDown, setIsTopDown] = useState(false);
  const [angleAnimating, setAngleAnimating] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [fitLocked, setFitLocked] = useState(false);
  const isCoarsePointer = useIsCoarsePointer();

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

  useEffect(() => {
    if (searchQuery && layout?.plots) {
      const match = layout.plots.find(p => p.plotNo?.toLowerCase() === searchQuery.toLowerCase());
      if (match) focusPlot(match);
    }
  }, [searchQuery, layout]);

  const handleShare = () => { navigator.clipboard?.writeText(window.location.href); };

  if (!layout || !image) return <div style={{ height: '100vh', background: LAYOUT_MAP_COLORS.background }} />;

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
        onFit={fitToScreen} onShare={handleShare}
        onOpenGallery={() => setShowGallery(true)} onOpenInfo={() => setShowInfo(true)}
        onLocate={() => setShowMap(true)}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} showExtraActions={true}
        showStatus={showStatus} setShowStatus={setShowStatus}
        isTopDown={isTopDown}
        onToggleTopDown={() => setIsTopDown((s) => !s)}
      />

      {/* Selected plot info */}
      {selectedPlot && (
        <div style={styles.infoPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h4 style={{ marginTop: 0, marginBottom: 6, color: '#fff', fontFamily: "'Outfit','Inter',sans-serif" }}>Plot {selectedPlot.plotNo || "-"}</h4>
            <button onClick={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
          </div>
          <p style={styles.infoText}>Status: <span style={{ fontWeight: 700, color: LAYOUT_STATUS_COLORS[selectedPlot.status] || LAYOUT_STATUS_COLORS.Available }}>{selectedPlot.status}</span></p>
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
            <color attach="background" args={[LAYOUT_MAP_COLORS.background]} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
            <directionalLight position={[50, 150, 50]} intensity={1.0} />
            <CameraAnimator cameraTargetPlot={cameraTargetPlot} image={image} layout={layout} isTopDown={isTopDown} angleAnimating={angleAnimating} fitLocked={fitLocked} />
            <CameraAngleController isTopDown={isTopDown} controlsRef={controlsRef} duration={360} onStart={() => setAngleAnimating(true)} onComplete={() => setAngleAnimating(false)} />
            <FitToLayoutController fitKey={fitKey} isTopDown={isTopDown} image={image} layout={layout} scale={SCALE3D} duration={1600} onStart={() => setAngleAnimating(true)} onComplete={() => { setAngleAnimating(false); setFitLocked(true); }} />
            <CameraRotationTracker onAngleChange={setCameraAzimuth} />
            <NavigateToNorth trigger={navigateNorthTrigger} onDone={() => {}} />
            <group position={[-(metaObj.analysisWidth * SCALE3D) / 2, 0, -(metaObj.analysisHeight * SCALE3D) / 2]}>
              <BoundaryMesh boundary={layout.boundary} meta={metaObj} />
              <CompoundWall boundary={layout.boundary} meta={metaObj} />
              {layout.plots.map((plot) => {
                const plotCenter = getPlotCenter(plot);
                const normalizedX = plotCenter.x / metaObj.analysisWidth;
                const plotReveal = Math.min(1, Math.max(0, (statusRevealProgress * 1.6) - normalizedX * 0.6));
                return <PlotMesh key={plot._id || plot.id} plot={plot} isSelected={selectedPlot?._id === plot._id} isDimmed={!!selectedPlot && selectedPlot._id !== plot._id} onClick={(p) => focusPlot(p)} showStatus={showStatus} statusRevealProgress={plotReveal} meta={layout.meta} />;
              })}
            </group>
            {(layout.props3D || []).map((item) => <RenderProp key={item.id} item={item} onClick={(i, e) => e.stopPropagation()} isSelected={false} transformMode="translate" onTransformEnd={() => {}} />)}
            <OrbitControls ref={controlsRef} makeDefault touches={isCoarsePointer ? MOBILE_TOUCH_CONTROLS : DEFAULT_TOUCH_CONTROLS} minPolarAngle={POLAR_3D - POLAR_EPS} maxPolarAngle={POLAR_3D + POLAR_EPS} minAzimuthAngle={-Infinity} maxAzimuthAngle={Infinity} enableRotate={true} enablePan enableDamping={true} dampingFactor={0.08} minDistance={5} maxDistance={metaObj.analysisHeight * SCALE3D * 3} />
          </Canvas>
          {angleAnimating && <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'auto', background: 'transparent' }} />}
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

const styles = {
  page: { height: "100vh", background: LAYOUT_MAP_COLORS.background, position: "relative", overflow: "hidden" },
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
