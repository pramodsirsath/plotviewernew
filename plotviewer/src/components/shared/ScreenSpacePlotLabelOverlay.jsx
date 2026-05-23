import React from "react";
import * as THREE from "three";
import {
  getPlotCenter,
  getPlotBounds,
} from "../../utils/plotGeometry";
import { LAYOUT_MAP_FONT_FAMILY } from "../../theme/layoutMapTheme";

export default function ScreenSpacePlotLabelOverlay({
  controlsRef,
  plots = [],
  layout,
  image,
  selectedPlot = null,
  scale = 0.05,
  elevation = 0,
  color = "#000",
  fontWeight = 700,
  dimmedOpacity = 0.25,
  isEnabled = false,
  isTopDown = false,
}) {
  const rootRef = React.useRef(null);
  const [labels, setLabels] = React.useState([]);

  const plotEntries = React.useMemo(
    () =>
      plots
        .filter((plot) => plot?.isPlot !== false && plot?.plotNo)
        .map((plot, index) => ({
          id: plot._id || plot.id || `plot-label-${index}`,
          text: String(plot.plotNo),
          center: getPlotCenter(plot),
          bounds: getPlotBounds(plot),
        })),
    [plots]
  );

  const selectedPlotId = selectedPlot?._id || selectedPlot?.id || null;

  const analysisWidth = layout?.meta?.analysisWidth || image?.width || 0;
  const analysisHeight = layout?.meta?.analysisHeight || image?.height || 0;

  const offsetX = -(analysisWidth * scale) / 2;
  const offsetZ = -(analysisHeight * scale) / 2;

  const syncLabels = React.useCallback(() => {
    const root = rootRef.current;
    const width = root?.clientWidth || 0;
    const height = root?.clientHeight || 0;
    const camera = controlsRef?.current?.object;

    if (!isEnabled || !camera || !width || !height) {
      setLabels([]);
      return;
    }

    const nextLabels = [];

    plotEntries.forEach((entry) => {
      if (selectedPlotId && entry.id === selectedPlotId) return;

      // 🔥 Convert world → screen
      const vector = new THREE.Vector3(
        entry.center.x * scale + offsetX,
        elevation,
        entry.center.y * scale + offsetZ
      );

      vector.project(camera);
      if (vector.z < -1 || vector.z > 1) return;

      const x = (vector.x * 0.5 + 0.5) * 100;
      const y = (-vector.y * 0.5 + 0.5) * 100;
      if (x < -5 || x > 105 || y < -5 || y > 105) return;

      // 🔥 2D vs 3D font
      const plotScreenSize = Math.min(
        (entry.bounds.width * scale / Math.max(analysisWidth * scale, 1)) * width,
        (entry.bounds.height * scale / Math.max(analysisHeight * scale, 1)) * height
      );
      const fontSize = Math.max(9, Math.min(plotScreenSize * 0.38, isTopDown ? 18 : 15));

      nextLabels.push({
        id: entry.id,
        text: entry.text,
        x,
        y,
        fontSize,
        opacity: selectedPlotId
          ? dimmedOpacity
          : isTopDown
          ? 1
          : 0.9,
      });
    });

    setLabels(nextLabels);
  }, [
    controlsRef,
    plotEntries,
    scale,
    offsetX,
    offsetZ,
    elevation,
    analysisWidth,
    analysisHeight,
    selectedPlotId,
    dimmedOpacity,
    isEnabled,
    isTopDown,
  ]);

  React.useEffect(() => {
    syncLabels();
  }, [syncLabels]);

  React.useEffect(() => {
    if (!isEnabled) return;

    let frame;
    const loop = () => {
      syncLabels();
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frame);
  }, [isEnabled, syncLabels]);

  if (!isEnabled) return null;

  return (
    <svg
      ref={rootRef}
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        pointerEvents: "none",
      }}
    >
      {labels.map((label) => (
        <text
          key={label.id}
          x={`${label.x}%`}
          y={`${label.y}%`}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          stroke="rgba(255, 255, 255, 0.45)"
          fillOpacity={label.opacity}
          fontFamily={LAYOUT_MAP_FONT_FAMILY}
          fontSize={`${label.fontSize}px`}
          fontWeight={fontWeight}
          style={{
            letterSpacing: 0,
            paintOrder: "stroke",
            strokeWidth: 2,
          }}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}
