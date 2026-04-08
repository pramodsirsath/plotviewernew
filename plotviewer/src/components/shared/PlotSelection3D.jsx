import React from "react";
import * as THREE from "three";
import { Line as DreiLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  getPlotAreaSqFt,
  getPlotAxisDimensionsFeet,
  getPlotBounds,
  getPlotCenter,
  getPolygonEdgeMeasurements,
  getPlotRenderPointObjects,
  hasPolygonPoints,
} from "../../utils/plotGeometry";
import GroundTextLabel3D from "./GroundTextLabel3D";
import { LAYOUT_MAP_COLORS } from "../../theme/layoutMapTheme";

const POPUP_ANIMATION_DURATION = 1000;
const OVERLAY_FILL_LIFT = 0.02;
const OVERLAY_OUTLINE_LIFT = 0.055;
const OVERLAY_TEXT_LIFT = 0.09;
const OVERLAY_DIMENSION_LIFT = 0.065;

const formatDisplayNumber = (value) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (Math.abs(parsed - Math.round(parsed)) < 0.01) {
    return String(Math.round(parsed));
  }

  return parsed >= 10
    ? parsed.toFixed(1).replace(/\.0$/, "")
    : parsed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const formatFeetLabel = (value) => {
  const formatted = formatDisplayNumber(value);
  return formatted ? `${formatted} ft` : null;
};

const formatMetersLabel = (value) => {
  const formatted = formatDisplayNumber(value);
  return formatted ? `${formatted} m` : null;
};

const formatAreaLabel = (value) => {
  const formatted = formatDisplayNumber(value);
  return formatted ? `${formatted} sq.ft` : null;
};

const getReadableEdgeRotation = (angleRadians) => {
  let nextAngle = angleRadians;

  if (nextAngle > Math.PI / 2) {
    nextAngle -= Math.PI;
  } else if (nextAngle < -Math.PI / 2) {
    nextAngle += Math.PI;
  }

  return -nextAngle;
};

export default function PlotSelection3D({
  plot,
  scale = 0.05,
  elevation = 0.14,
  pixelToFt = 1,
  theme = LAYOUT_MAP_COLORS,
}) {
  const popupAnimStartRef = React.useRef(0);
  const lineRef = React.useRef(); // ✅ ADDED
    const popupRef = React.useRef(); // ✅ ADD THIS

  if (!plot) return null;

  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);

  // Outline & Fill geometry (dashed border + blue shape)
const { outlinePoints, fillGeo } = React.useMemo(() => {
  const pts = [];
  const padding = 1; // 🔥 adjust this for spacing
  const renderPoints = getPlotRenderPointObjects(plot);

  if (renderPoints.length >= 3) {
    // ✅ For custom polygon → expand from center
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    for (const point of renderPoints) {
      const x = point.x;
      const y = point.y;

      // push point slightly outward
      const dirX = x - centerX;
      const dirY = y - centerY;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;

      const newX = x + (dirX / len) * padding;
      const newY = y + (dirY / len) * padding;

      pts.push(new THREE.Vector2(newX * scale, -newY * scale));
    }
  } else {
    // ✅ Rectangle case → simple padding
    const px = bounds.x - padding;
    const py = bounds.y - padding;
    const pw = bounds.width + padding * 2;
    const ph = bounds.height + padding * 2;

    pts.push(new THREE.Vector2(px * scale, -py * scale));
    pts.push(new THREE.Vector2((px + pw) * scale, -py * scale));
    pts.push(new THREE.Vector2((px + pw) * scale, -(py + ph) * scale));
    pts.push(new THREE.Vector2(px * scale, -(py + ph) * scale));
  }

  const renderPts = pts;

  const linePts = [...renderPts, renderPts[0].clone()].map((point) => [
    point.x,
    point.y,
    0,
  ]);

  // 2. Build Fill ShapeGeometry (centered at origin so it scales correctly)
  const shape = new THREE.Shape();
  const cX = center.x * scale;
  const cY = -center.y * scale;

  shape.moveTo(renderPts[0].x - cX, renderPts[0].y - cY);
  for (let i = 1; i < renderPts.length; i++) {
    shape.lineTo(renderPts[i].x - cX, renderPts[i].y - cY);
  }
  shape.lineTo(renderPts[0].x - cX, renderPts[0].y - cY);
  
  const geoFill = new THREE.ShapeGeometry(shape);

  return { outlinePoints: linePts, fillGeo: geoFill };
}, [plot, bounds, scale, center.x, center.y]);

  // ✅ IMPORTANT: compute distances AFTER mount
  React.useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [outlinePoints]);
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

  const widthLabel = formatDimensionLabel(plot?.plotWidth || (bounds.width * pixelToFt));
  const heightLabel = formatDimensionLabel(plot?.plotHeight || (bounds.height * pixelToFt));
  // ✅ ADD THIS BELOW widthLabel & heightLabel
const plotArea = (() => {
  const widthFt = Number(plot?.plotWidth || (bounds.width * pixelToFt));
  const heightFt = Number(plot?.plotHeight || (bounds.height * pixelToFt));

  if (!widthFt || !heightFt) return null;

  const areaFt = Number(plot?.area || (widthFt * heightFt));
  const areaM = areaFt * 0.092903;

  const ftText = `${Math.round(areaFt)} ft²`;
  const mText =
    areaM >= 100
      ? `${Math.round(areaM)} m²`
      : `${areaM.toFixed(2)} m²`;

  return `${mText} / ${ftText}`; // 👈 combined text block for area
})();
    const padding = 1; // 🔥 adjust this for spacing
    const dimOffset = 2.5; // 🔥 distance of dimension labels from plot edge


  return (
    <group>
      {/* dashed outline */}
      <DreiLine
        ref={lineRef} // ✅ ADDED
        points={outlinePoints}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, elevation + OVERLAY_OUTLINE_LIFT, 0]}
        color="#ffffff"
        lineWidth={2.2}
        dashed
        dashScale={1}
        dashSize={0.12}
        gapSize={0.1}
        transparent
        opacity={1}
        depthWrite={false}
        depthTest={false}
        renderOrder={14}
      />
      {/*
          dashSize={0.05}   // 🔥 FIXED (was 6)
          gapSize={0.05}    // 🔥 FIXED (was 5)
          linewidth={2}    // 🔥 CLEAN UI
          depthWrite={false}
          depthTest={false}
        */}


      {/* small blue popup panel (flat) */}
     <mesh
 ref={popupRef}
  geometry={fillGeo}
  scale={[0.01, 0.01, 1]} // 🔥 IMPORTANT (start small)
  position={[center.x * scale, elevation + OVERLAY_FILL_LIFT, center.y * scale]}
  rotation={[-Math.PI / 2, 0, 0]}
  renderOrder={8}
>
  <meshBasicMaterial
    color={theme.selectedPlotpopup}
    transparent
    opacity={1}
    depthWrite={false}
    polygonOffset
    polygonOffsetFactor={1}
    polygonOffsetUnits={1}
  />
</mesh>

 <GroundTextLabel3D
  text={plot.plotNo ? `${plot.plotNo}` : '-'}
  position={[
    center.x * scale,
    elevation + OVERLAY_TEXT_LIFT,
    center.y * scale - 0.15
  ]}
  rotation={[-Math.PI / 2, 0, 0]}
  fontSize={0.35} 
  fontWeight={700}
  color={theme.white}
  outlineColor={theme.background}
  outlineWidth={0.15}
  depthWrite={false}
  renderOrder={10}
  depthTest={false}
/>
<GroundTextLabel3D
  text={plotArea || ""}
  position={[
    center.x * scale,
    elevation + OVERLAY_TEXT_LIFT,
    center.y * scale + 0.15 
  ]}
  rotation={[-Math.PI / 2, 0, 0]}
  fontSize={0.12} 
  fontWeight={500}
  color={theme.white}
  outlineColor={theme.background}
  outlineWidth={0.1}
  depthWrite={false}
  renderOrder={10}
  depthTest={false}
/>


      {/* width labels */}
      {widthLabel && (
        <>
          <GroundTextLabel3D
            text={widthLabel}
position={[
  center.x * scale,
  elevation + OVERLAY_DIMENSION_LIFT,
  (center.y - bounds.height / 2 - padding - dimOffset) * scale
]}            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
          />
          <GroundTextLabel3D
            text={widthLabel}
position={[
  center.x * scale,
  elevation + OVERLAY_DIMENSION_LIFT,
  (center.y + bounds.height / 2 + padding + dimOffset) * scale
]}            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
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
  elevation + OVERLAY_DIMENSION_LIFT,
  center.y * scale
]}            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
          />
          <GroundTextLabel3D
            text={heightLabel}
position={[
  (center.x + bounds.width / 2 + padding + dimOffset) * scale, // ✅ shifted right
  elevation + OVERLAY_DIMENSION_LIFT,
  center.y * scale
]}            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
          />
        </>
      )}
    </group>
  );
}
