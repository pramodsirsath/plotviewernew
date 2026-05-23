import React from "react";
import * as THREE from "three";
import { LAYOUT_MAP_FONT_FAMILY } from "../../theme/layoutMapTheme";
import { getPlotCenter, getPlotBounds } from "../../utils/plotGeometry";

/**
 * BatchedPlotLabels3D
 *
 * Renders ALL plot labels onto a SINGLE canvas texture, then displays
 * that texture as one flat mesh over the layout. This replaces the
 * per-plot GroundTextLabel3D approach, so every plot number appears
 * instantly as a single draw call — no staggered / one-by-one rendering.
 *
 * Props:
 *   plots          – Full array of plot objects (will filter to isPlot && plotNo)
 *   analysisWidth  – Layout analysis width in pixels
 *   analysisHeight – Layout analysis height in pixels
 *   scale          – World scale factor (e.g. 0.05)
 *   elevation      – Y-axis lift for the label plane
 *   color          – Text fill color
 *   fontWeight     – Canvas font weight (default 700)
 *   opacity        – Mesh opacity
 *   selectedPlotId – ID of currently selected plot (hidden from batch)
 *   renderOrder    – Three.js render order
 *   sharpness      – Texture sharpness multiplier
 */
const BatchedPlotLabels3D = React.memo(function BatchedPlotLabels3D({
  plots = [],
  analysisWidth = 0,
  analysisHeight = 0,
  scale = 0.05,
  elevation = 0,
  color = "#050505",
  fontWeight = 700,
  opacity = 1,
  selectedPlotId = null,
  renderOrder = 3,
  sharpness = 1,
}) {
  const textureRef = React.useRef(null);

  // Filter to only actual plots with a plotNo
  const labelEntries = React.useMemo(() => {
    if (!plots?.length || !analysisWidth || !analysisHeight) return [];

    return plots
      .filter((plot) => plot?.isPlot !== false && plot?.plotNo)
      .map((plot) => {
        const center = getPlotCenter(plot);
        const bounds = getPlotBounds(plot);
        return {
          id: plot._id || plot.id,
          text: String(plot.plotNo),
          // Center in pixel-space (analysis coordinates)
          cx: center.x,
          cy: center.y,
          // Use the smaller of width/height to size the label proportionally
          fitSize: Math.min(bounds.width, bounds.height),
        };
      });
  }, [plots, analysisWidth, analysisHeight]);

  const { texture, worldWidth, worldHeight } = React.useMemo(() => {
    if (!labelEntries.length || !analysisWidth || !analysisHeight) {
      return { texture: null, worldWidth: 0, worldHeight: 0 };
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { texture: null, worldWidth: 0, worldHeight: 0 };

    // --- Determine canvas resolution ---
    // Cap the final texture size so large layouts do not exhaust mobile GPU memory.
    const nativeDpr = window.devicePixelRatio || 2;
    const isMobile = window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth <= 768;
    const sharpnessFactor = Math.min(1.5, Math.max(0.85, sharpness));
    const preferredPixelRatio = Math.min(
      isMobile ? 1.5 : 3,
      Math.max(isMobile ? 1 : 1.5, nativeDpr * (0.8 + sharpnessFactor * 0.4))
    );
    const maxTextureSide = isMobile ? 2048 : 4096;
    const sideCapRatio = Math.min(
      preferredPixelRatio,
      maxTextureSide / Math.max(analysisWidth, 1),
      maxTextureSide / Math.max(analysisHeight, 1)
    );
    const pixelRatio = Math.max(0.5, sideCapRatio);

    canvas.width = Math.ceil(analysisWidth * pixelRatio);
    canvas.height = Math.ceil(analysisHeight * pixelRatio);
    ctx.scale(pixelRatio, pixelRatio);
    ctx.clearRect(0, 0, analysisWidth, analysisHeight);

    // --- Draw every label at once ---
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;

    labelEntries.forEach((entry) => {
      // Skip selected plot (it's handled by the selection overlay)
      if (selectedPlotId && entry.id === selectedPlotId) return;

      // Size the font proportional to the plot's smaller dimension
      // Clamp between reasonable min/max so tiny plots are still readable
      const fontSize = Math.max(8, Math.min(entry.fitSize * 0.38, 48));
      ctx.font = `${fontWeight} ${fontSize}px ${LAYOUT_MAP_FONT_FAMILY}`;
      ctx.fillStyle = color;
      ctx.fillText(entry.text, entry.cx, entry.cy);
    });

    // --- Create a Three.js texture from the canvas ---
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = !isMobile;
    tex.minFilter = isMobile ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = isMobile ? 1 : Math.min(8, Math.max(4, Math.round(nativeDpr * 2)));
    tex.needsUpdate = true;

    return {
      texture: tex,
      worldWidth: analysisWidth * scale,
      worldHeight: analysisHeight * scale,
    };
  }, [labelEntries, analysisWidth, analysisHeight, scale, color, fontWeight, selectedPlotId, sharpness]);

  // Clean up old texture on change
  React.useEffect(() => {
    const prev = textureRef.current;
    textureRef.current = texture;
    return () => {
      if (prev && prev !== texture) {
        prev.dispose();
      }
    };
  }, [texture]);

  // Dispose on unmount
  React.useEffect(() => {
    return () => {
      textureRef.current?.dispose();
    };
  }, []);

  if (!texture || !worldWidth || !worldHeight) {
    return null;
  }

  // The plane is centred at (0, elevation, 0) and rotated to lie flat.
  // It spans the full layout area.
  return (
    <mesh
      position={[worldWidth / 2, elevation, worldHeight / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={renderOrder}
      raycast={() => null}
    >
      <planeGeometry args={[worldWidth, worldHeight]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
        alphaTest={0.02}
        toneMapped={false}
      />
    </mesh>
  );
});

export default BatchedPlotLabels3D;
