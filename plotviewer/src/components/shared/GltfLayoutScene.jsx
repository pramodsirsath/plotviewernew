import React from "react";
import { useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { resolveServerUrl } from "../../config/runtime";
import { LAYOUT_STATUS_COLORS } from "../../theme/layoutMapTheme";
import BatchedPlotLabels3D from "./BatchedPlotLabels3D";

const DEFAULT_TRANSFORM = Object.freeze({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

const MODEL_URL_KEYS = [
  "baseModelUrl",
  "baseUrl",
  "base",
  "modelUrl",
  "glbUrl",
  "url",
];

const MODEL_LIST_KEYS = [
  "propModelUrls",
  "objectModelUrls",
  "objectUrls",
  "props",
  "models",
];

const normalizeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
};

const normalizeVector = (value, fallback) => {
  if (typeof value === "number") {
    return [value, value, value];
  }

  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    Number.isFinite(Number(value[0])) ? Number(value[0]) : fallback[0],
    Number.isFinite(Number(value[1])) ? Number(value[1]) : fallback[1],
    Number.isFinite(Number(value[2])) ? Number(value[2]) : fallback[2],
  ];
};

const normalizeTransform = (transform = {}) => ({
  position: normalizeVector(transform.position, DEFAULT_TRANSFORM.position),
  rotation: normalizeVector(transform.rotation, DEFAULT_TRANSFORM.rotation),
  scale: normalizeVector(transform.scale, DEFAULT_TRANSFORM.scale),
});

const normalizePlotToken = (value) => {
  if (value === null || value === undefined) return "";

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^mg[_-]?plot[_-]?/i, "")
    .replace(/^plot[_\-\s]?/i, "")
    .replace(/[^a-z0-9]+/g, "");
};

const addPlotLookupEntry = (lookup, value, plot) => {
  const token = normalizePlotToken(value);
  if (token && !lookup.has(token)) {
    lookup.set(token, plot);
  }
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
    ].forEach((value) => addPlotLookupEntry(lookup, value, plot));

    if (plot?.plotNo) {
      addPlotLookupEntry(lookup, `plot_${plot.plotNo}`, plot);
      addPlotLookupEntry(lookup, `plot-${plot.plotNo}`, plot);
      addPlotLookupEntry(lookup, `mg_plot_${plot.plotNo}`, plot);
    }
  });

  return lookup;
};

const resolvePlotForObject = (object, lookup) => {
  let current = object;

  while (current) {
    const name = current.name || current.userData?.name || current.userData?.plotNo;
    const directToken = normalizePlotToken(name);

    if (directToken && lookup.has(directToken)) {
      return lookup.get(directToken);
    }

    const userDataValues = [
      current.userData?.plotNo,
      current.userData?.plotId,
      current.userData?.plot,
      current.userData?.id,
    ];

    for (const value of userDataValues) {
      const token = normalizePlotToken(value);
      if (token && lookup.has(token)) {
        return lookup.get(token);
      }
    }

    current = current.parent;
  }

  return null;
};

const getMaterialList = (material) => (
  Array.isArray(material) ? material.filter(Boolean) : [material].filter(Boolean)
);

const cloneMeshMaterial = (mesh) => {
  if (!mesh.material) return;
  if (mesh.userData.layoutModelMaterialCloned) return;

  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map((material) => material.clone())
    : mesh.material.clone();

  mesh.userData.layoutModelOriginalColors = getMaterialList(mesh.material).map((material) => (
    material.color ? material.color.clone() : null
  ));
  mesh.userData.layoutModelMaterialCloned = true;
};

const disposeMaterial = (material) => {
  getMaterialList(material).forEach((entry) => {
    Object.values(entry).forEach((value) => {
      if (value?.isTexture) {
        value.dispose();
      }
    });
    entry.dispose?.();
  });
};

const disposeObject = (object) => {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      disposeMaterial(child.material);
    }
  });
};

const getModelAssetSource = (layout) => (
  layout?.modelAssets ||
  layout?.glbAssets ||
  layout?.assets?.modelAssets ||
  layout?.assets?.glb ||
  {}
);

export const getLayoutModelAssetConfig = (layout) => {
  const source = getModelAssetSource(layout);
  const rootLevel = layout || {};
  const urls = [];

  MODEL_URL_KEYS.forEach((key) => {
    const value = source?.[key] || rootLevel?.[key];
    if (value) urls.push(value);
  });

  MODEL_LIST_KEYS.forEach((key) => {
    normalizeArray(source?.[key] || rootLevel?.[key]).forEach((value) => urls.push(value));
  });

  const uniqueUrls = [...new Set(urls.filter(Boolean))];

  return {
    urls: uniqueUrls,
    transform: normalizeTransform(source?.transform || rootLevel?.modelTransform || {}),
    labelMode: source?.labelMode || "model",
  };
};

export const hasLayoutModelAssets = (layout) => getLayoutModelAssetConfig(layout).urls.length > 0;

const updatePlotMeshMaterial = ({
  mesh,
  plot,
  selectedPlotId,
  theme,
  showStatus,
  statusRevealProgress,
}) => {
  const plotId = plot?._id || plot?.id;
  const isSelected = selectedPlotId && plotId === selectedPlotId;
  const isDimmed = selectedPlotId && !isSelected;
  const statusColor = LAYOUT_STATUS_COLORS[plot?.status] || theme.plot;
  const materials = getMaterialList(mesh.material);
  const originalColors = mesh.userData.layoutModelOriginalColors || [];

  materials.forEach((material, index) => {
    if (!material) return;

    const originalColor = originalColors[index];
    const hasColor = Boolean(material.color);

    if (hasColor && isSelected) {
      material.color.set(theme.selectedPlot || theme.plot);
    } else if (hasColor && showStatus) {
      if (originalColor) {
        material.color.copy(originalColor);
      } else {
        material.color.set(theme.plot);
      }
      material.color.lerp(new THREE.Color(statusColor), statusRevealProgress);
    } else if (hasColor && originalColor) {
      material.color.copy(originalColor);
    }

    material.transparent = Boolean(isDimmed) || material.transparent;
    material.opacity = isDimmed ? 0.38 : 1;
    material.depthWrite = !isDimmed;
    material.needsUpdate = true;
  });
};

const fitCameraToObject = ({ root, camera, controls, size, isTopDown }) => {
  if (!root || !camera || !controls) return false;

  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return false;

  const center = box.getCenter(new THREE.Vector3());
  const dimensions = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(dimensions.x, dimensions.y, dimensions.z, 1);
  const fov = THREE.MathUtils.degToRad(camera.fov || 45);
  const aspect = size?.width && size?.height
    ? size.width / size.height
    : camera.aspect || 1;
  const fitHeightDistance = maxDim / (2 * Math.tan(fov / 2));
  const fitWidthDistance = fitHeightDistance / Math.max(aspect, 0.001);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.35;

  if (isTopDown) {
    camera.position.set(center.x, center.y + distance, center.z + 0.001);
  } else {
    const direction = new THREE.Vector3(0.78, 0.72, 0.92).normalize();
    camera.position.copy(center).add(direction.multiplyScalar(distance));
  }

  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance * 8 + maxDim * 4);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
  return true;
};

export default function GltfLayoutScene({
  layout,
  theme,
  selectedPlot = null,
  showStatus = false,
  statusRevealProgress = 0,
  onPlotClick,
  fitKey = 0,
  isTopDown = false,
  onFitStart,
  onFitComplete,
  scale = 0.05,
  labelElevation = 0.02,
  renderProfile = {},
}) {
  const { camera, controls, invalidate, size } = useThree();
  const rootRef = React.useRef(null);
  const assetConfig = React.useMemo(() => getLayoutModelAssetConfig(layout), [layout]);
  const [roots, setRoots] = React.useState([]);
  const [plotMeshEntries, setPlotMeshEntries] = React.useState([]);
  const selectedPlotId = selectedPlot?._id || selectedPlot?.id || null;
  const analysisWidth = layout?.meta?.analysisWidth || 0;
  const analysisHeight = layout?.meta?.analysisHeight || 0;

  React.useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    const resolvedUrls = assetConfig.urls.map((url) => resolveServerUrl(url));

    setRoots([]);
    setPlotMeshEntries([]);

    Promise.all(resolvedUrls.map((url) => loader.loadAsync(url)))
      .then((gltfs) => {
        if (cancelled) {
          gltfs.forEach((gltf) => disposeObject(gltf.scene));
          return;
        }

        const nextRoots = gltfs.map((gltf) => gltf.scene);
        setRoots(nextRoots);
      })
      .catch((error) => {
        console.error("GLB layout load failed:", error);
        if (!cancelled) {
          setRoots([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetConfig.urls.join("|")]);

  React.useEffect(() => {
    const lookup = buildPlotLookup(layout?.plots || []);
    const entries = [];

    roots.forEach((root) => {
      root.traverse((object) => {
        if (!object.isMesh) return;

        object.castShadow = false;
        object.receiveShadow = true;
        object.frustumCulled = true;

        cloneMeshMaterial(object);

        const plot = resolvePlotForObject(object, lookup);
        if (!plot || plot.isPlot === false) return;

        object.userData.layoutPlot = plot;
        object.renderOrder = 3;
        entries.push({ mesh: object, plot });
      });
    });

    setPlotMeshEntries(entries);
    invalidate();
  }, [invalidate, layout?.plots, roots]);

  React.useEffect(() => {
    plotMeshEntries.forEach(({ mesh, plot }) => {
      updatePlotMeshMaterial({
        mesh,
        plot,
        selectedPlotId,
        theme,
        showStatus,
        statusRevealProgress,
      });
    });
    invalidate();
  }, [invalidate, plotMeshEntries, selectedPlotId, showStatus, statusRevealProgress, theme]);

  React.useEffect(() => {
    if (!roots.length || !controls || !rootRef.current) return;

    onFitStart?.();
    requestAnimationFrame(() => {
      fitCameraToObject({
        root: rootRef.current,
        camera,
        controls,
        size,
        isTopDown,
      });
      invalidate();
      onFitComplete?.();
    });
  }, [camera, controls, fitKey, invalidate, isTopDown, onFitComplete, onFitStart, roots, size]);

  React.useEffect(() => () => {
    roots.forEach(disposeObject);
  }, [roots]);

  const handleClick = React.useCallback((event) => {
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
  }, [onPlotClick]);

  if (!assetConfig.urls.length) {
    return null;
  }

  const shouldRenderJsonLabels = assetConfig.labelMode === "json-overlay";

  return (
    <group
      ref={rootRef}
      position={assetConfig.transform.position}
      rotation={assetConfig.transform.rotation}
      scale={assetConfig.transform.scale}
      onClick={handleClick}
    >
      {roots.map((root, index) => (
        <primitive key={`${assetConfig.urls[index]}-${index}`} object={root} />
      ))}

      {shouldRenderJsonLabels && analysisWidth > 0 && analysisHeight > 0 ? (
        <BatchedPlotLabels3D
          plots={layout?.plots || []}
          analysisWidth={analysisWidth}
          analysisHeight={analysisHeight}
          scale={scale}
          elevation={labelElevation}
          color={renderProfile.plotLabelColor || "#050505"}
          fontWeight={renderProfile.plotLabelFontWeight || 600}
          opacity={selectedPlotId ? 0.65 : 1}
          selectedPlotId={selectedPlotId}
          renderOrder={4}
          sharpness={renderProfile.labelSharpness || 1}
        />
      ) : null}
    </group>
  );
}
