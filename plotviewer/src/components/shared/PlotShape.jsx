import React from "react";
import { Line, Rect } from "react-konva";
import { getPlotBounds, getPlotPoints, hasPolygonPoints } from "../../utils/plotGeometry";

/**
 * PlotShape renders either a polygon (Line) or rectangle (Rect) for a plot.
 * Uses custom hitFunc for pixel-perfect hit detection.
 */
const PlotShape = ({
  plot,
  fill,
  stroke,
  strokeWidth,
  dash,
  onClick,
  onTap,
  onPointerDown,
  listening = true,
  cornerRadius = 4,
  hitStrokeWidth = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
}) => {
  if (hasPolygonPoints(plot)) {
    const plotPoints = getPlotPoints(plot);

    return (
      <Line
        points={plotPoints}
        closed
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        tension={plot.isCurved ? 0.35 : 0}
        lineJoin="round"
        lineCap="round"
        miterLimit={8}
        perfectDrawEnabled={false}
        hitStrokeWidth={hitStrokeWidth}
        listening={listening}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        onTap={onTap}
        onPointerDown={onPointerDown}
        hitFunc={(context, shape) => {
          // Custom hit function: fill entire polygon area for accurate detection
          context.beginPath();
          if (plotPoints.length >= 2) {
            context.moveTo(plotPoints[0], plotPoints[1]);
            for (let i = 2; i < plotPoints.length; i += 2) {
              context.lineTo(plotPoints[i], plotPoints[i + 1]);
            }
          }
          context.closePath();
          context.fillStrokeShape(shape);
        }}
      />
    );
  }

  const bounds = getPlotBounds(plot);

  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      dash={dash}
      cornerRadius={cornerRadius}
      listening={listening}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTap={onTap}
      onPointerDown={onPointerDown}
    />
  );
};

export default PlotShape;
