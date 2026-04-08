import React from "react";
import * as THREE from "three";
import { Line as DreiLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  getPlotAreaSqM,
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
const OUTLINE_PADDING = 1;
const DIMENSION_LABEL_OFFSET = OUTLINE_PADDING + 2.5;
const FEET_TO_METERS = 0.3048;

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

const formatMetersLabel = (value) => {
  const formatted = formatDisplayNumber(value);
  return formatted ? `${formatted} m` : null;
};

const formatAreaLabel = (value) => {
  const formatted = formatDisplayNumber(value);
  return formatted ? `${formatted} m²` : null;
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

export default function PlotSelection3DExact({
  plot,
  scale = 0.05,
  elevation = 0.14,
  pixelToFt = 1,
  theme = LAYOUT_MAP_COLORS,
}) {
  const popupAnimStartRef = React.useRef(0);
  const lineRef = React.useRef();
  const popupRef = React.useRef();

  if (!plot) {
    return null;
  }

  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);
  const isPolygonPlot = hasPolygonPoints(plot);

  const { outlinePoints, fillGeo } = React.useMemo(() => {
    const paddedPoints = [];
    const renderPoints = getPlotRenderPointObjects(plot);

    if (renderPoints.length >= 3) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      renderPoints.forEach((point) => {
        const dirX = point.x - centerX;
        const dirY = point.y - centerY;
        const vectorLength = Math.hypot(dirX, dirY) || 1;
        const nextX = point.x + (dirX / vectorLength) * OUTLINE_PADDING;
        const nextY = point.y + (dirY / vectorLength) * OUTLINE_PADDING;

        paddedPoints.push(new THREE.Vector2(nextX * scale, -nextY * scale));
      });
    } else {
      const x = bounds.x - OUTLINE_PADDING;
      const y = bounds.y - OUTLINE_PADDING;
      const width = bounds.width + OUTLINE_PADDING * 2;
      const height = bounds.height + OUTLINE_PADDING * 2;

      paddedPoints.push(new THREE.Vector2(x * scale, -y * scale));
      paddedPoints.push(new THREE.Vector2((x + width) * scale, -y * scale));
      paddedPoints.push(new THREE.Vector2((x + width) * scale, -(y + height) * scale));
      paddedPoints.push(new THREE.Vector2(x * scale, -(y + height) * scale));
    }

    const linePoints = [...paddedPoints, paddedPoints[0].clone()].map((point) => [
      point.x,
      point.y,
      0,
    ]);

    const shape = new THREE.Shape();
    const centerX = center.x * scale;
    const centerY = -center.y * scale;

    shape.moveTo(paddedPoints[0].x - centerX, paddedPoints[0].y - centerY);
    for (let index = 1; index < paddedPoints.length; index += 1) {
      shape.lineTo(paddedPoints[index].x - centerX, paddedPoints[index].y - centerY);
    }
    shape.lineTo(paddedPoints[0].x - centerX, paddedPoints[0].y - centerY);

    return {
      outlinePoints: linePoints,
      fillGeo: new THREE.ShapeGeometry(shape),
    };
  }, [plot, bounds.x, bounds.y, bounds.width, bounds.height, scale, center.x, center.y]);

  const polygonDimensionLabels = React.useMemo(() => {
    if (!isPolygonPlot) {
      return [];
    }

    return getPolygonEdgeMeasurements(plot, pixelToFt)
      .filter((edge) => !edge.isCurved)
      .map((edge) => {
        const directionX = edge.end.x - edge.start.x;
        const directionY = edge.end.y - edge.start.y;
        const edgeLength = Math.hypot(directionX, directionY) || 1;
        let normalX = -directionY / edgeLength;
        let normalY = directionX / edgeLength;
        const toCenterX = center.x - edge.midpoint.x;
        const toCenterY = center.y - edge.midpoint.y;

        if (normalX * toCenterX + normalY * toCenterY > 0) {
          normalX *= -1;
          normalY *= -1;
        }

        const fontSize = Math.max(0.11, Math.min(0.18, edge.pixelLength * scale * 0.16));
        return {
          key: `${plot._id || plot.id || plot.plotNo || "plot"}-edge-${edge.edgeIndex}`,
          text: formatMetersLabel(edge.lengthMeters) || "0 m",
          position: [
            (edge.midpoint.x + normalX * DIMENSION_LABEL_OFFSET) * scale,
            elevation + OVERLAY_DIMENSION_LIFT,
            (edge.midpoint.y + normalY * DIMENSION_LABEL_OFFSET) * scale,
          ],
          rotation: [-Math.PI / 2, 0, getReadableEdgeRotation(edge.angleRadians)],
          fontSize,
        };
      });
  }, [center.x, center.y, elevation, isPolygonPlot, pixelToFt, plot, scale]);

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

  useFrame(() => {
    if (!popupRef.current) {
      return;
    }

    const elapsed = performance.now() - popupAnimStartRef.current;
    const animationProgress = Math.min(elapsed / POPUP_ANIMATION_DURATION, 1);
    const ease = 1 - Math.pow(1 - animationProgress, 3);
    const popupScale = THREE.MathUtils.lerp(0.01, 1, ease);

    popupRef.current.scale.set(popupScale, popupScale, 1);
  });

  const { widthFeet, heightFeet } = getPlotAxisDimensionsFeet(plot, pixelToFt);
  const widthLabel = !isPolygonPlot ? formatMetersLabel(widthFeet * FEET_TO_METERS) : null;
  const heightLabel = !isPolygonPlot ? formatMetersLabel(heightFeet * FEET_TO_METERS) : null;
  const plotArea = formatAreaLabel(getPlotAreaSqM(plot, pixelToFt));

  return (
    <group>
      <DreiLine
        ref={lineRef}
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

      <mesh
        ref={popupRef}
        geometry={fillGeo}
        scale={[0.01, 0.01, 1]}
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
        text={plot.plotNo ? `${plot.plotNo}` : "-"}
        position={[
          center.x * scale,
          elevation + OVERLAY_TEXT_LIFT,
          center.y * scale - 0.15,
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

      {plotArea ? (
        <GroundTextLabel3D
          text={plotArea}
          position={[
            center.x * scale,
            elevation + OVERLAY_TEXT_LIFT,
            center.y * scale + 0.15,
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
      ) : null}

      {!isPolygonPlot && widthLabel ? (
        <>
          <GroundTextLabel3D
            text={widthLabel}
            position={[
              center.x * scale,
              elevation + OVERLAY_DIMENSION_LIFT,
              (center.y - bounds.height / 2 - DIMENSION_LABEL_OFFSET) * scale,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
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
              (center.y + bounds.height / 2 + DIMENSION_LABEL_OFFSET) * scale,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
          />
        </>
      ) : null}

      {!isPolygonPlot && heightLabel ? (
        <>
          <GroundTextLabel3D
            text={heightLabel}
            position={[
              (center.x - bounds.width / 2 - DIMENSION_LABEL_OFFSET) * scale,
              elevation + OVERLAY_DIMENSION_LIFT,
              center.y * scale,
            ]}
            rotation={[-Math.PI / 2, 0, Math.PI / 2]}
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
              (center.x + bounds.width / 2 + DIMENSION_LABEL_OFFSET) * scale,
              elevation + OVERLAY_DIMENSION_LIFT,
              center.y * scale,
            ]}
            rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
            fontSize={0.2}
            color={theme.white}
            outlineColor={theme.background}
            outlineWidth={0.15}
            depthWrite={false}
            depthTest={false}
          />
        </>
      ) : null}

      {polygonDimensionLabels.map((label) => (
        <GroundTextLabel3D
          key={label.key}
          text={label.text}
          position={label.position}
          rotation={label.rotation}
          fontSize={label.fontSize}
          fontWeight={600}
          color={theme.white}
          outlineColor={theme.background}
          outlineWidth={0.14}
          depthWrite={false}
          depthTest={false}
          renderOrder={11}
        />
      ))}
    </group>
  );
}
