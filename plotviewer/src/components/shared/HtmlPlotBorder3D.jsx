import React from "react";
import { Html } from "@react-three/drei";
import { getPlotCenter, getPlotRenderPointObjects } from "../../utils/plotGeometry";

const SVG_INNER_HEIGHT_PX = 320;
const SVG_MIN_WORLD_SIZE = 0.001;
const SVG_Z_INDEX_RANGE = [8, 0];

const clampPositive = (value, fallback) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

export default function HtmlPlotBorder3D({
  plot,
  center = null,
  scale = 0.05,
  elevation = 0,
  rotation = [-Math.PI / 2, 0, 0],
  color = "#000000",
  lineWidth = 1,
  opacity = 1,
  padding = 0,
  fillColor = null,
  fillOpacity = 0,
  dashArray = null,
  zIndexRange = SVG_Z_INDEX_RANGE,
  useLocalCenter = false,
}) {
  const borderShape = React.useMemo(() => {
    if (!plot || ((lineWidth <= 0 || opacity <= 0) && (!fillColor || fillOpacity <= 0))) {
      return null;
    }

    const resolvedCenter = center || getPlotCenter(plot);
    const renderPoints = getPlotRenderPointObjects(plot);

    if (!renderPoints.length) {
      return null;
    }

    const paddedPoints = renderPoints.map((point) => {
      if (padding <= 0) {
        return point;
      }

      const dirX = point.x - resolvedCenter.x;
      const dirY = point.y - resolvedCenter.y;
      const vectorLength = Math.hypot(dirX, dirY) || 1;

      return {
        x: point.x + (dirX / vectorLength) * padding,
        y: point.y + (dirY / vectorLength) * padding,
      };
    });

    const localPoints = paddedPoints.map((point) => ({
      x: (point.x - resolvedCenter.x) * scale,
      y: -(point.y - resolvedCenter.y) * scale,
    }));

    const minX = Math.min(...localPoints.map((point) => point.x));
    const maxX = Math.max(...localPoints.map((point) => point.x));
    const minY = Math.min(...localPoints.map((point) => point.y));
    const maxY = Math.max(...localPoints.map((point) => point.y));

    // Calculate maximum extents so the SVG bounding box is completely symmetric around 0,0
    const maxWorldExtentX = Math.max(Math.abs(minX), Math.abs(maxX));
    const maxWorldExtentY = Math.max(Math.abs(minY), Math.abs(maxY));

    const worldWidth = clampPositive(maxWorldExtentX * 2, SVG_MIN_WORLD_SIZE);
    const worldHeight = clampPositive(maxWorldExtentY * 2, SVG_MIN_WORLD_SIZE);
    
    const innerHeightPx = SVG_INNER_HEIGHT_PX;
    const innerWidthPx = Math.max(2, Math.round((worldWidth / worldHeight) * innerHeightPx));
    const worldToPx = innerHeightPx / worldHeight;
    
    const strokeWidthPx = lineWidth > 0 ? Math.max(2.25, lineWidth * 2.85) : 0;
    const paddingPx = Math.ceil(strokeWidthPx * 2 + 4);
    const widthPx = innerWidthPx + paddingPx * 2;
    const heightPx = innerHeightPx + paddingPx * 2;
    
    const points = localPoints
      .map((point) => {
        const x = paddingPx + (point.x + maxWorldExtentX) * worldToPx;
        const y = paddingPx + (maxWorldExtentY - point.y) * worldToPx;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    return {
      center: resolvedCenter,
      distanceFactor: (worldHeight * 400) / innerHeightPx,
      widthPx,
      heightPx,
      points,
      strokeWidthPx,
    };
  }, [center, dashArray, fillColor, fillOpacity, lineWidth, opacity, padding, plot, scale]);

  if (!borderShape) {
    return null;
  }

  const groupPosition = useLocalCenter
    ? [0, elevation, 0]
    : [borderShape.center.x * scale, elevation, borderShape.center.y * scale];

  return (
    <group
      position={groupPosition}
      rotation={rotation}
    >
      <Html
        transform
        pointerEvents="none"
        distanceFactor={borderShape.distanceFactor}
        zIndexRange={zIndexRange}
        style={{
          width: `${borderShape.widthPx}px`,
          height: `${borderShape.heightPx}px`,
          overflow: "visible",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <svg
          width={borderShape.widthPx}
          height={borderShape.heightPx}
          viewBox={`0 0 ${borderShape.widthPx} ${borderShape.heightPx}`}
          style={{ display: "block", overflow: "visible" }}
        >
          <polygon
            points={borderShape.points}
            fill={fillColor || "none"}
            fillOpacity={fillColor ? fillOpacity : 0}
            stroke={borderShape.strokeWidthPx > 0 ? color : "none"}
            strokeOpacity={borderShape.strokeWidthPx > 0 ? opacity : 0}
            strokeWidth={borderShape.strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray || undefined}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
          />
        </svg>
      </Html>
    </group>
  );
}
