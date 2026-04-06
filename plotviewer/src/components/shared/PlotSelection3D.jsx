import React from 'react';
import * as THREE from 'three';
import { getPlotBounds, getPlotCenter } from '../../utils/plotGeometry';
import GroundTextLabel3D from './GroundTextLabel3D';
import { LAYOUT_MAP_COLORS } from '../../theme/layoutMapTheme';
import { useFrame } from "@react-three/fiber";

const POPUP_ANIMATION_DURATION = 1000;

const ftToMeters = (ft) => {
  const parsed = Number(ft);
  if (!Number.isFinite(parsed)) return null;
  return parsed * 0.3048;
};


const formatDimensionLabel = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const meters = ftToMeters(parsed);
  if (!Number.isFinite(meters)) return null;
  if (meters >= 10) return `${Math.round(meters)} m`;
  return `${meters.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} m`;
};

export default function PlotSelection3D({ plot, scale = 0.05, elevation = 0.14 }) {
  const popupAnimStartRef = React.useRef(0);
  const lineRef = React.useRef(); // ✅ ADDED
    const popupRef = React.useRef(); // ✅ ADD THIS

  if (!plot) return null;

  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);

  // Outline geometry (dashed)
const outlineGeo = React.useMemo(() => {
  const pts = [];
  const padding = 1; // 🔥 adjust this for spacing

  if (plot.points && plot.points.length >= 6) {
    // ✅ For custom polygon → expand from center
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    for (let i = 0; i < plot.points.length; i += 2) {
      const x = plot.points[i];
      const y = plot.points[i + 1];

      // push point slightly outward
      const dirX = x - centerX;
      const dirY = y - centerY;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;

      const newX = x + (dirX / len) * padding;
      const newY = y + (dirY / len) * padding;

      pts.push(new THREE.Vector3(newX * scale, -newY * scale, 0));
    }

    pts.push(pts[0].clone());
  } else {
    // ✅ Rectangle case → simple padding
    const px = bounds.x - padding;
    const py = bounds.y - padding;
    const pw = bounds.width + padding * 2;
    const ph = bounds.height + padding * 2;

    pts.push(new THREE.Vector3(px * scale, -py * scale, 0));
    pts.push(new THREE.Vector3((px + pw) * scale, -py * scale, 0));
    pts.push(new THREE.Vector3((px + pw) * scale, -(py + ph) * scale, 0));
    pts.push(new THREE.Vector3(px * scale, -(py + ph) * scale, 0));
    pts.push(new THREE.Vector3(px * scale, -py * scale, 0));
  }

  const positions = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    positions[i * 3 + 0] = pts[i].x;
    positions[i * 3 + 1] = pts[i].y;
    positions[i * 3 + 2] = pts[i].z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  return geo;
}, [plot, bounds, scale]);

  // ✅ IMPORTANT: compute distances AFTER mount
  React.useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [outlineGeo]);
  React.useEffect(() => {
    popupAnimStartRef.current = performance.now();
    if (popupRef.current) {
      popupRef.current.scale.set(0.01, 0.01, 1);
    }
  }, [plot]);
  React.useEffect(() => {
  if (popupRef.current) {
    popupRef.current.scale.set(0.01, 0.01, 1); // 🔥 reset animation
  }
}, [plot]); 
useFrame(() => {
  if (!popupRef.current) return;

  const elapsed = performance.now() - popupAnimStartRef.current;
  const t = Math.min(elapsed / POPUP_ANIMATION_DURATION, 1);
  const ease = 1 - Math.pow(1 - t, 3);
  const popupScale = THREE.MathUtils.lerp(0.01, 1, ease);

  popupRef.current.scale.set(popupScale, popupScale, 1);
});
  // popup panel dimensions
  const panelWidth = Math.max(0.5, Math.min(bounds.width * scale * 0, 1.6));
  const panelHeight = Math.max(0.22, panelWidth * 0);

  const widthLabel = formatDimensionLabel(plot?.plotWidth || bounds.width);
  const heightLabel = formatDimensionLabel(plot?.plotHeight || bounds.height);
    const padding = 1; // 🔥 adjust this for spacing
    const dimOffset = 2.5; // 🔥 distance of dimension labels from plot edge


  return (
    <group>
      {/* dashed outline */}
      <line
        ref={lineRef} // ✅ ADDED
        geometry={outlineGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, elevation + 0.01, 0]}
        renderOrder={2}
      >
        <lineDashedMaterial
          attach="material"
          color={"#ffffff"}
          dashSize={0.05}   // 🔥 FIXED (was 6)
          gapSize={0.05}    // 🔥 FIXED (was 5)
          linewidth={2}    // 🔥 CLEAN UI
        />
      </line>

      {/* small blue popup panel (flat) */}
     <mesh
  ref={popupRef}
  scale={[0.01, 0.1, 1]} // 🔥 IMPORTANT (start small)
  position={[center.x * scale, elevation, center.y * scale]}
  rotation={[-Math.PI / 2, 0, 0]}
>
  <planeGeometry args={[bounds.width * scale, bounds.height * scale]} />
  <meshBasicMaterial color={"#2c86db"} transparent opacity={1} />
</mesh>

      {/* popup text (plotNo + area) */}
      <GroundTextLabel3D
        text={plot.plotNo ? `${plot.plotNo}` : 'Plot'}
        position={[center.x * scale, elevation + 0.001, center.y * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color={LAYOUT_MAP_COLORS.white}
        outlineColor={LAYOUT_MAP_COLORS.background}
        outlineWidth={0.15}
        depthWrite={false}
      />

      {/* width labels */}
      {widthLabel && (
        <>
          <GroundTextLabel3D
            text={widthLabel}
position={[
  center.x * scale,
  elevation + 0.02,
  (center.y - bounds.height / 2 - padding - dimOffset) * scale
]}            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.2}
            color={LAYOUT_MAP_COLORS.white}
            outlineColor={LAYOUT_MAP_COLORS.background}
            outlineWidth={0.15}
            depthWrite={false}
          />
          <GroundTextLabel3D
            text={widthLabel}
position={[
  center.x * scale,
  elevation + 0.02,
  (center.y + bounds.height / 2 + padding + dimOffset) * scale
]}            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.2}
            color={LAYOUT_MAP_COLORS.white}
            outlineColor={LAYOUT_MAP_COLORS.background}
            outlineWidth={0.15}
            depthWrite={false}
          />
        </>
      )}

      {/* height labels */}
      {heightLabel && (
        <>
          <GroundTextLabel3D
            text={heightLabel}
position={[
  (center.x - bounds.width / 2 - padding - dimOffset) * scale, // ✅ shifted left
  elevation + 0.02,
  center.y * scale
]}            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            fontSize={0.2}
            color={LAYOUT_MAP_COLORS.white}
            outlineColor={LAYOUT_MAP_COLORS.background}
            outlineWidth={0.15}
            depthWrite={false}
          />
          <GroundTextLabel3D
            text={heightLabel}
position={[
  (center.x + bounds.width / 2 + padding + dimOffset) * scale, // ✅ shifted right
  elevation + 0.02,
  center.y * scale
]}            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.2}
            color={LAYOUT_MAP_COLORS.white}
            outlineColor={LAYOUT_MAP_COLORS.background}
            outlineWidth={0.15}
            depthWrite={false}
          />
        </>
      )}
    </group>
  );
}
