import React, { useEffect, useRef, useState, useMemo } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveServerUrl } from "../../config/runtime";
import { LAYOUT_STATUS_COLORS } from "../../theme/layoutMapTheme";
import { getPlotCenter, getPlotBounds } from "../../utils/plotGeometry";

const SCALE3D = 0.05;
const PLOT_LABEL_LIFT = 0.025;

// ── Cached font (loaded once, reused forever) ──
let _cachedFont = null;
let _fontLoadPromise = null;

const loadFontCached = () => {
  if (_cachedFont) return Promise.resolve(_cachedFont);
  if (_fontLoadPromise) return _fontLoadPromise;

  _fontLoadPromise = import("three/examples/jsm/loaders/FontLoader.js").then(
    ({ FontLoader }) => {
      const loader = new FontLoader();
      return loader.loadAsync(
        "https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json"
      );
    }
  ).then((font) => {
    _cachedFont = font;
    return font;
  });

  return _fontLoadPromise;
};

// ── Canvas-based text label (10-50x faster than ShapeGeometry) ──
const createTextCanvas = (text, fontSize = 64) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padding = fontSize * 0.3;
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = Math.ceil(fontSize * 1.3 + padding * 2);

  // Redraw with correct canvas size
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111111";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return canvas;
};

// ── Plot lookup for mesh->plot mapping ──
const normalizePlotToken = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^mg[_-]?plot[_-]?/i, "")
    .replace(/^plot[_\-\s]?/i, "")
    .replace(/[^a-z0-9]+/g, "");
};

const buildPlotLookup = (plots = []) => {
  const lookup = new Map();
  plots.forEach((plot) => {
    [
      plot?.plotNo,
      plot?._id,
      plot?.id,
      plot?.name,
      plot?.meshName,
      plot?.modelMeshName,
      plot?.modelId,
      plot?.label,
    ].forEach((value) => {
      const token = normalizePlotToken(value);
      if (token && !lookup.has(token)) {
        lookup.set(token, plot);
      }
    });

    if (plot?.plotNo) {
      const p = plot.plotNo;
      [`plot_${p}`, `plot-${p}`, `mg_plot_${p}`].forEach((v) => {
        const token = normalizePlotToken(v);
        if (token && !lookup.has(token)) lookup.set(token, plot);
      });
    }
  });
  return lookup;
};

const resolvePlotForObject = (object, lookup) => {
  let current = object;
  while (current) {
    const name =
      current.name || current.userData?.name || current.userData?.plotNo;
    const directToken = normalizePlotToken(name);
    if (directToken && lookup.has(directToken)) return lookup.get(directToken);

    const userDataValues = [
      current.userData?.plotNo,
      current.userData?.plotId,
      current.userData?.plot,
      current.userData?.id,
    ];
    for (const value of userDataValues) {
      const token = normalizePlotToken(value);
      if (token && lookup.has(token)) return lookup.get(token);
    }
    current = current.parent;
  }
  return null;
};

export default function HighPerfGltfLayoutScene({
  layout,
  theme,
  selectedPlot = null,
  showStatus = false,
  statusRevealProgress = 0,
  onPlotClick,
  onLoadStatusChange,
  renderProfile = {},
}) {
  const { camera, controls, invalidate, scene, gl } = useThree();
  const rootRef = useRef(null);

  const [modelRoots, setModelRoots] = useState([]);
  const [labelSprites, setLabelSprites] = useState([]);
  const [plotMeshEntries, setPlotMeshEntries] = useState([]);

  const selectedPlotId = selectedPlot?._id || selectedPlot?.id || null;

  useEffect(() => {
    let isCancelled = false;

    const loadScene = async () => {
      try {
        onLoadStatusChange("loading", "Loading 3D Models...");

        const baseModelUrl = layout?.modelAssets?.baseModelUrl;
        const propModelUrls = layout?.modelAssets?.propModelUrls || [];
        const allUrls = [baseModelUrl, ...propModelUrls]
          .filter(Boolean)
          .map((url) => resolveServerUrl(url));

        if (allUrls.length === 0) {
          onLoadStatusChange(
            "error",
            "No 3D models assigned to this layout."
          );
          return;
        }

        // Load GLB models and font IN PARALLEL (big speed win)
        const loader = new GLTFLoader();
        const [loadedGltfs] = await Promise.all([
          Promise.all(allUrls.map((url) => loader.loadAsync(url))),
          loadFontCached(), // pre-warm font cache in parallel
        ]);

        if (isCancelled) return;

        onLoadStatusChange("loading", "Building scene...");

        // Generate text labels using fast canvas textures
        const plots = layout?.plots || [];
        const sprites = [];

        plots.forEach((plot) => {
          if (!plot.plotNo || plot.isPlot === false) return;

          const text = String(plot.plotNo);
          const center = getPlotCenter(plot);
          const bounds = getPlotBounds(plot);

          const labelW = bounds.width * SCALE3D * 0.45;
          const labelH = bounds.height * SCALE3D * 0.45;
          const labelSize = Math.max(0.2, Math.min(labelW, labelH, 2.0));

          // Create canvas texture (instant, no geometry computation)
          const canvas = createTextCanvas(text, 64);
          const texture = new THREE.CanvasTexture(canvas);
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;

          const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: true,
          });

          const sprite = new THREE.Sprite(spriteMat);
          sprite.position.set(
            center.x * SCALE3D,
            PLOT_LABEL_LIFT,
            center.y * SCALE3D
          );

          // Scale sprite to match label size while maintaining aspect ratio
          const aspect = canvas.width / canvas.height;
          sprite.scale.set(labelSize * aspect, labelSize, 1);
          sprite.renderOrder = 4;

          // Rotate sprite to face down (flat on ground)
          sprite.center.set(0.5, 0.5);

          sprites.push(sprite);
        });

        if (isCancelled) return;

        // Prepare meshes
        const lookup = buildPlotLookup(plots);
        const entries = [];
        const roots = loadedGltfs.map((gltf) => gltf.scene);

        roots.forEach((root) => {
          root.traverse((object) => {
            if (!object.isMesh) return;

            // Clone material for dynamic coloring later
            if (object.material) {
              object.material = Array.isArray(object.material)
                ? object.material.map((m) => m.clone())
                : object.material.clone();

              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              object.userData.layoutModelOriginalColors = materials.map((m) =>
                m.color ? m.color.clone() : null
              );
            }

            const plot = resolvePlotForObject(object, lookup);
            if (plot && plot.isPlot !== false) {
              object.userData.layoutPlot = plot;
              entries.push({ mesh: object, plot });
            }
          });
        });

        // GPU compile models only (sprites don't need it)
        gl.compile(scene, camera);

        if (isCancelled) return;

        setModelRoots(roots);
        setLabelSprites(sprites);
        setPlotMeshEntries(entries);

        onLoadStatusChange("ready", "");
        invalidate();
      } catch (err) {
        console.error("Layout 3D Load Error:", err);
        if (!isCancelled)
          onLoadStatusChange("error", "Failed to load layout 3D models.");
      }
    };

    loadScene();

    return () => {
      isCancelled = true;
      // Cleanup
      modelRoots.forEach((r) => {
        r.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material)
              ? obj.material
              : [obj.material];
            mats.forEach((m) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          }
        });
      });
      labelSprites.forEach((sprite) => {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      });
    };
  }, [layout, gl, scene, camera]);

  // Update materials on plot selection or status reveal
  useEffect(() => {
    plotMeshEntries.forEach(({ mesh, plot }) => {
      const isSelected =
        selectedPlotId === plot._id || selectedPlotId === plot.id;
      const isDimmed = selectedPlotId && !isSelected;
      const statusColor = LAYOUT_STATUS_COLORS[plot.status] || theme.plot;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const originalColors = mesh.userData.layoutModelOriginalColors || [];

      materials.forEach((material, index) => {
        if (!material) return;
        const originalColor = originalColors[index];
        const hasColor = Boolean(material.color);

        if (hasColor && isSelected) {
          material.color.set(theme.selectedPlot || theme.plot);
        } else if (hasColor && showStatus) {
          if (originalColor) material.color.copy(originalColor);
          else material.color.set(theme.plot);
          material.color.lerp(
            new THREE.Color(statusColor),
            statusRevealProgress
          );
        } else if (hasColor && originalColor) {
          material.color.copy(originalColor);
        }

        material.transparent = Boolean(isDimmed) || material.transparent;
        material.opacity = isDimmed ? 0.38 : 1;
        material.depthWrite = !isDimmed;
        material.needsUpdate = true;
      });
    });

    // Update label opacity
    labelSprites.forEach((sprite) => {
      sprite.material.opacity = selectedPlotId ? 0.38 : 1;
      sprite.material.needsUpdate = true;
    });

    invalidate();
  }, [
    plotMeshEntries,
    selectedPlotId,
    showStatus,
    statusRevealProgress,
    theme,
    labelSprites,
    invalidate,
  ]);

  const handleClick = React.useCallback(
    (event) => {
      let current = event.object;
      while (current) {
        const plot = current.userData?.layoutPlot;
        if (plot) {
          event.stopPropagation();
          onPlotClick?.(plot);
          return;
        }
        current = current.parent;
      }
    },
    [onPlotClick]
  );

  return (
    <group ref={rootRef} onClick={handleClick}>
      {modelRoots.map((root, index) => (
        <primitive key={index} object={root} />
      ))}
      {labelSprites.map((sprite, index) => (
        <primitive key={`label-${index}`} object={sprite} />
      ))}
    </group>
  );
}
