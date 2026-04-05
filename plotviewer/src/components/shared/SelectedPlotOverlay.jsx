import React from "react";
import { Group, Line, Text } from "react-konva";
import PlotShape from "./PlotShape";
import { getPlotBounds, getPlotCenter } from "../../utils/plotGeometry";

const WHITE = "#ffffff";
const REFERENCE_BLUE = "#2D89EF";
const SHADOW = "#0f172a";

const formatNumericValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (value === null || value === undefined || value === "") return null;
    return String(value);
  }
  if (Math.abs(parsed - Math.round(parsed)) < 0.01) return String(Math.round(parsed));
  if (Math.abs(parsed) >= 10) return parsed.toFixed(1).replace(/\.0$/, "");
  return parsed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

// Convert ft to meters (1 ft = 0.3048 m)
const ftToMeters = (ft) => {
  const parsed = Number(ft);
  if (!Number.isFinite(parsed)) return null;
  return parsed * 0.3048;
};

// Convert sq.ft to sq.m (1 sq.ft = 0.092903 sq.m)
const sqftToSqm = (sqft) => {
  const parsed = Number(sqft);
  if (!Number.isFinite(parsed)) return null;
  return parsed * 0.092903;
};

const formatDimensionLabel = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  // Convert to meters
  const meters = ftToMeters(parsed);
  if (meters === null) return null;
  const formatted = meters >= 10 ? meters.toFixed(1).replace(/\.0$/, "") : meters.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} m`;
};

const formatAreaYd = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const sqyd = parsed * 0.111111; // 1 sq.ft = 0.111111 sq.yd
  const formatted = sqyd >= 10 ? sqyd.toFixed(2) : sqyd.toFixed(2);
  return `${formatted} yd²`;
};

const formatAreaSqM = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const sqm = sqftToSqm(parsed);
  const formatted = sqm >= 10 ? Math.round(sqm).toString() : sqm.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} m²`;
};

const getCenterTextLayout = (bounds) => {
  const plotNoFontSize = Math.max(24, Math.min(bounds.width * 0.3, bounds.height * 0.35, 54));
  const detailFontSize = Math.max(11, Math.min(bounds.width * 0.085, bounds.height * 0.11, 16));
  const secondaryFontSize = Math.max(11, detailFontSize);
  const labelWidth = Math.max(Math.min(bounds.width - 18, 300), 104);
  return { plotNoFontSize, detailFontSize, secondaryFontSize, labelWidth };
};

const SelectedPlotOverlay = ({ plot, statusStyle }) => {
  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);
  const widthLabel = formatDimensionLabel(plot?.plotWidth);
  const heightLabel = formatDimensionLabel(plot?.plotHeight);
  const areaSqM = formatAreaSqM(plot?.area);
  const areaYd = formatAreaYd(plot?.area);
  const plotLabel = plot?.plotNo ? String(plot.plotNo) : "Plot";
  const selectedFill = statusStyle?.selectedFill || REFERENCE_BLUE;
  const { plotNoFontSize, detailFontSize, secondaryFontSize, labelWidth } = getCenterTextLayout(bounds);
  const edgeInset = Math.max(10, Math.min(Math.min(bounds.width, bounds.height) * 0.12, 16));
  const cornerTick = Math.max(8, Math.min(Math.min(bounds.width, bounds.height) * 0.08, 15));
  const showHorizontalLabels = Boolean(widthLabel) && bounds.width >= 64 && bounds.height >= 42;
  const showVerticalLabels = Boolean(heightLabel) && bounds.height >= 72;
  const showSecondaryArea = Boolean(areaYd) && bounds.height >= 74;
  // Compute vertical layout: plotNo, areaSqM, areaSqFt
  const totalTextHeight = plotNoFontSize + (areaSqM ? detailFontSize * 1.3 : 0) + (showSecondaryArea ? secondaryFontSize * 1.3 : 0);
  const centerTop = center.y - totalTextHeight / 2;
  const labelShadowProps = {
    shadowColor: SHADOW,
    shadowBlur: 6,
    shadowOpacity: 0.55,
    shadowOffsetY: 1,
  };

  return (
    <>
      <PlotShape
        plot={plot}
        fill={selectedFill}
        stroke={WHITE}
        strokeWidth={1}
        listening={false}
      />
      <PlotShape
        plot={plot}
        fill="transparent"
        stroke={WHITE}
        strokeWidth={1.6}
        dash={[7, 7]}
        listening={false}
      />

      {/* Corner tick marks */}
      <Line points={[bounds.x - cornerTick, bounds.y, bounds.x, bounds.y, bounds.x, bounds.y - cornerTick]} stroke={WHITE} strokeWidth={1.4} lineCap="square" listening={false} />
      <Line points={[bounds.x + bounds.width + cornerTick, bounds.y, bounds.x + bounds.width, bounds.y, bounds.x + bounds.width, bounds.y - cornerTick]} stroke={WHITE} strokeWidth={1.4} lineCap="square" listening={false} />
      <Line points={[bounds.x - cornerTick, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height, bounds.x, bounds.y + bounds.height + cornerTick]} stroke={WHITE} strokeWidth={1.4} lineCap="square" listening={false} />
      <Line points={[bounds.x + bounds.width + cornerTick, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height + cornerTick]} stroke={WHITE} strokeWidth={1.4} lineCap="square" listening={false} />

      {/* Width labels (top and bottom edges) — in meters */}
      {showHorizontalLabels && (
        <>
          <Text x={bounds.x} y={bounds.y - detailFontSize * 0.8} width={bounds.width} align="center" text={widthLabel} fontSize={detailFontSize} fill={WHITE} fontStyle="bold" listening={false} {...labelShadowProps} />
          <Text x={bounds.x} y={bounds.y + bounds.height - detailFontSize * 0.2} width={bounds.width} align="center" text={widthLabel} fontSize={detailFontSize} fill={WHITE} fontStyle="bold" listening={false} {...labelShadowProps} />
        </>
      )}

      {/* Height labels (left and right edges) — in meters */}
      {showVerticalLabels && (
        <>
          <Group x={bounds.x + edgeInset} y={center.y} rotation={-90} listening={false}>
            <Text x={-bounds.height / 2} y={-detailFontSize / 1.25} width={bounds.height} align="center" text={heightLabel} fontSize={detailFontSize} fill={WHITE} fontStyle="bold" {...labelShadowProps} />
          </Group>
          <Group x={bounds.x + bounds.width - edgeInset} y={center.y} rotation={90} listening={false}>
            <Text x={-bounds.height / 2} y={-detailFontSize / 1.25} width={bounds.height} align="center" text={heightLabel} fontSize={detailFontSize} fill={WHITE} fontStyle="bold" {...labelShadowProps} />
          </Group>
        </>
      )}

      {/* Plot Number — large bold centered */}
      <Text
        x={center.x - labelWidth / 2}
        y={centerTop}
        width={labelWidth}
        align="center"
        text={plotLabel}
        fontSize={plotNoFontSize}
        fill={WHITE}
        fontStyle="bold"
        listening={false}
        shadowColor={SHADOW}
        shadowBlur={8}
        shadowOpacity={0.62}
        shadowOffsetY={1}
      />

      {/* Area in m² */}
      {areaSqM && (
        <Text
          x={center.x - labelWidth / 2}
          y={centerTop + plotNoFontSize + detailFontSize * 0.15}
          width={labelWidth}
          align="center"
          text={areaSqM}
          fontSize={detailFontSize}
          fill={WHITE}
          fontStyle="bold"
          listening={false}
          {...labelShadowProps}
        />
      )}

      {/* Area in sq.ft */}
      {showSecondaryArea && (
        <Text
          x={center.x - labelWidth / 2}
          y={centerTop + plotNoFontSize + detailFontSize * 1.45}
          width={labelWidth}
          align="center"
          text={areaYd}
          fontSize={secondaryFontSize}
          fill={WHITE}
          fontStyle="bold"
          listening={false}
          {...labelShadowProps}
        />
      )}
    </>
  );
};

export default SelectedPlotOverlay;
