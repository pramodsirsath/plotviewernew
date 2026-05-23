import React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import helvetikerBold from "three/examples/fonts/helvetiker_bold.typeface.json";
import { resolveServerUrl } from "../../config/runtime";
import { LAYOUT_STATUS_COLORS } from "../../theme/layoutMapTheme";
import { getLayoutRenderProfile } from "../../theme/layoutAppearance";
import {
  getPlotBounds,
  getPlotCenter,
  getPlotRenderPoints,
} from "../../utils/plotGeometry";
import "./FastLayoutViewer.css";

const SCALE3D = 0.05;
const TOP_DOWN_POLAR_EPS = 0.0001;
const PLOT_SURFACE_LIFT = 0.002;
const LABEL_LIFT = 0.028;
const EDITOR_BOUNDARY_LIFT = -0.05;
const EDITOR_PLOT_SURFACE_LIFT = EDITOR_BOUNDARY_LIFT + 0.0025;
const EDITOR_MODEL_LABEL_LIFT = EDITOR_PLOT_SURFACE_LIFT + 0.022;
const BORDER_LIFT = 0.006;
const SELECTION_LIFT = 0.012;
const STATUS_DURATION = 420;
const CAMERA_DURATION = 650;
const CAMERA_FOV = 45;

const FONT = new FontLoader().parse(helvetikerBold);
const DEFAULT_TRANSFORM = Object.freeze({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
const MODEL_URL_KEYS = ["baseModelUrl", "baseUrl", "base", "modelUrl", "glbUrl", "url"];
const MODEL_LIST_KEYS = ["propModelUrls", "objectModelUrls", "objectUrls", "props", "models"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

const getModelAssetSource = (layout) => (
  layout?.modelAssets ||
  layout?.glbAssets ||
  layout?.assets?.modelAssets ||
  layout?.assets?.glb ||
  {}
);

const getLayoutModelAssetConfig = (layout) => {
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

  return {
    urls: [...new Set(urls.filter(Boolean))],
    transform: normalizeTransform(source?.transform || rootLevel?.modelTransform || {}),
  };
};

const easeInOutCubic = (value) => (
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
);

const getPlotId = (plot) => plot?._id || plot?.id || null;

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
      [`plot_${plot.plotNo}`, `plot-${plot.plotNo}`, `mg_plot_${plot.plotNo}`].forEach((value) => {
        const token = normalizePlotToken(value);
        if (token && !lookup.has(token)) {
          lookup.set(token, plot);
        }
      });
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

const getOriginalMaterialState = (material) => ({
  color: material?.color?.clone?.() || null,
  opacity: Number.isFinite(material?.opacity) ? material.opacity : 1,
  transparent: Boolean(material?.transparent),
  depthWrite: material?.depthWrite !== false,
  polygonOffset: Boolean(material?.polygonOffset),
  polygonOffsetFactor: Number.isFinite(material?.polygonOffsetFactor) ? material.polygonOffsetFactor : 0,
  polygonOffsetUnits: Number.isFinite(material?.polygonOffsetUnits) ? material.polygonOffsetUnits : 0,
});

const restoreMaterialState = (material, originalState) => {
  if (!material || !originalState) return;

  if (material.color && originalState.color) {
    material.color.copy(originalState.color);
  }

  material.opacity = originalState.opacity;
  material.transparent = originalState.transparent;
  material.depthWrite = originalState.depthWrite;
  material.polygonOffset = originalState.polygonOffset;
  material.polygonOffsetFactor = originalState.polygonOffsetFactor;
  material.polygonOffsetUnits = originalState.polygonOffsetUnits;
};

const applyImportedPlotMaterialQuality = (material) => {
  if (!material) return;

  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -4;
  material.needsUpdate = true;
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

const createPlotShapeGeometry = (plot) => {
  const shape = new THREE.Shape();
  const renderPoints = getPlotRenderPoints(plot);

  if (renderPoints.length < 6) {
    return null;
  }

  shape.moveTo(renderPoints[0] * SCALE3D, -renderPoints[1] * SCALE3D);
  for (let index = 2; index < renderPoints.length; index += 2) {
    shape.lineTo(renderPoints[index] * SCALE3D, -renderPoints[index + 1] * SCALE3D);
  }
  shape.lineTo(renderPoints[0] * SCALE3D, -renderPoints[1] * SCALE3D);

  return new THREE.ShapeGeometry(shape);
};

const createBoundaryGeometry = (layout, image) => {
  const meta = layout?.meta || {};
  const analysisWidth = meta.analysisWidth || image?.width || 1;
  const analysisHeight = meta.analysisHeight || image?.height || 1;
  const boundary = Array.isArray(layout?.boundary) ? layout.boundary : [];
  const shape = new THREE.Shape();

  if (boundary.length >= 6) {
    shape.moveTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
    for (let index = 2; index < boundary.length; index += 2) {
      shape.lineTo(boundary[index] * SCALE3D, -boundary[index + 1] * SCALE3D);
    }
    shape.lineTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(analysisWidth * SCALE3D, 0);
    shape.lineTo(analysisWidth * SCALE3D, -analysisHeight * SCALE3D);
    shape.lineTo(0, -analysisHeight * SCALE3D);
    shape.lineTo(0, 0);
  }

  return new THREE.ShapeGeometry(shape);
};

const createLineGeometryFromPlots = (plots = []) => {
  const positions = [];

  plots.forEach((plot) => {
    const points = getPlotRenderPoints(plot);
    if (points.length < 6 || plot.isPlot === false) return;

    for (let index = 0; index < points.length; index += 2) {
      const nextIndex = (index + 2) % points.length;
      positions.push(points[index] * SCALE3D, BORDER_LIFT, points[index + 1] * SCALE3D);
      positions.push(points[nextIndex] * SCALE3D, BORDER_LIFT, points[nextIndex + 1] * SCALE3D);
    }
  });

  if (!positions.length) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
};

const createLineGeometryFromBoundary = (layout) => {
  const boundary = Array.isArray(layout?.boundary) ? layout.boundary : [];
  const positions = [];

  if (boundary.length < 6) {
    return null;
  }

  for (let index = 0; index < boundary.length; index += 2) {
    const nextIndex = (index + 2) % boundary.length;
    positions.push(boundary[index] * SCALE3D, BORDER_LIFT + 0.002, boundary[index + 1] * SCALE3D);
    positions.push(boundary[nextIndex] * SCALE3D, BORDER_LIFT + 0.002, boundary[nextIndex + 1] * SCALE3D);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
};

const createMergedLabelMesh = ({
  plots = [],
  color,
  selectedPlotId,
  modelCoordinates = false,
  analysisWidth = 0,
  analysisHeight = 0,
}) => {
  const geometries = [];
  const layoutOffsetX = -(analysisWidth * SCALE3D) / 2;
  const layoutOffsetZ = -(analysisHeight * SCALE3D) / 2;
  const labelLift = modelCoordinates ? EDITOR_MODEL_LABEL_LIFT : LABEL_LIFT;

  plots.forEach((plot) => {
    if (!plot?.plotNo || plot.isPlot === false || getPlotId(plot) === selectedPlotId) {
      return;
    }

    const bounds = getPlotBounds(plot);
    const center = getPlotCenter(plot);
    const labelSize = clamp(Math.min(bounds.width, bounds.height) * SCALE3D * 0.45, 0.4, 2.5);
    const shapes = FONT.generateShapes(String(plot.plotNo), labelSize);
    const geometry = new THREE.ShapeGeometry(shapes);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      const textWidth = box.max.x - box.min.x;
      const textHeight = box.max.y - box.min.y;
      geometry.translate(-box.min.x - textWidth / 2, -box.min.y - textHeight / 2, 0);
    }

    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
    const position = new THREE.Vector3(
      center.x * SCALE3D + layoutOffsetX,
      labelLift,
      center.y * SCALE3D + layoutOffsetZ
    );

    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    geometries.push(geometry);
  });

  if (!geometries.length) {
    return null;
  }

  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());

  if (!merged) {
    return null;
  }

  const material = new THREE.MeshBasicMaterial({
    color,
    depthWrite: false,
    depthTest: false,
    transparent: true,
    opacity: 1,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.renderOrder = 5;
  mesh.raycast = () => null;
  return mesh;
};

const getRendererPixelRatio = () => {
  const nativeDpr = window.devicePixelRatio || 1;
  const isMobile = window.matchMedia?.("(pointer: coarse)")?.matches || window.innerWidth <= 768;

  return isMobile ? clamp(nativeDpr, 1, 2) : clamp(nativeDpr, 1.5, 3);
};

const getSceneSize = (layout, image) => {
  const analysisWidth = layout?.meta?.analysisWidth || image?.width || 1;
  const analysisHeight = layout?.meta?.analysisHeight || image?.height || 1;

  return {
    analysisWidth,
    analysisHeight,
    worldWidth: analysisWidth * SCALE3D,
    worldHeight: analysisHeight * SCALE3D,
  };
};

const getWorldPlotCenter = (plot, context) => {
  const center = getPlotCenter(plot);
  const offsetX = context?.modelCoordinates ? 0 : -(context?.worldWidth || 0) / 2;
  const offsetZ = context?.modelCoordinates ? 0 : -(context?.worldHeight || 0) / 2;

  return new THREE.Vector3(
    center.x * SCALE3D + offsetX,
    0,
    center.y * SCALE3D + offsetZ
  );
};

const getCurrentAzimuthDegrees = (controls) => {
  if (!controls?.getAzimuthalAngle) return 0;
  const degrees = THREE.MathUtils.radToDeg(controls.getAzimuthalAngle());
  return ((degrees % 360) + 360) % 360;
};

const getPlotBaseColor = (plot, theme, originalColor) => {
  if (plot?.isPlot === false) {
    return plot.blockColor || theme.nonPlotBlock || theme.grass || "#687E35";
  }

  return originalColor || theme.plot || "#cfc4ab";
};

const getStatusTargetColor = (plot, theme) => (
  LAYOUT_STATUS_COLORS[plot?.status] || theme.plot || "#cfc4ab"
);

const applyMaterialState = (context) => {
  const selectedId = getPlotId(context.selectedPlot);
  const selectedColor = new THREE.Color(
    context.theme.selectedPlotpopup ||
    context.theme.selectedPlot ||
    "#3b82f6"
  );

  context.plotEntries.forEach((entry) => {
    const plotId = getPlotId(entry.plot);
    const isSelected = selectedId && selectedId === plotId;
    const isDimmed = selectedId && !isSelected && entry.plot?.isPlot !== false;
    const statusColor = new THREE.Color(getStatusTargetColor(entry.plot, context.theme));

    getMaterialList(entry.mesh.material).forEach((material, index) => {
      if (!material) return;
      const originalState = entry.originalMaterialStates?.[index];

      if (context.modelCoordinates) {
        restoreMaterialState(material, originalState);

        if (material.color && entry.plot?.isPlot !== false && context.statusProgress > 0.001) {
          material.color.lerp(statusColor, context.statusProgress);
        }

        material.needsUpdate = true;
        return;
      }

      if (!material.color) return;

      const baseColor = entry.originalColors?.[index]?.clone?.()
        || new THREE.Color(getPlotBaseColor(entry.plot, context.theme));

      if (isSelected) {
        material.color.copy(selectedColor);
      } else if (entry.plot?.isPlot !== false) {
        material.color.copy(baseColor).lerp(statusColor, context.statusProgress);
      } else {
        material.color.copy(baseColor);
      }

      material.transparent = Boolean(isDimmed) || material.transparent;
      material.opacity = isDimmed ? 0.42 : 1;
      material.depthWrite = !isDimmed;
      material.needsUpdate = true;
    });
  });
};

const removeSelectionOverlay = (context) => {
  if (!context.selectionOverlay) return;

  context.selectionOverlay.parent?.remove(context.selectionOverlay);
  disposeObject(context.selectionOverlay);
  context.selectionOverlay = null;
};

const getModelPlotBox = (context, plot) => {
  const plotId = getPlotId(plot);
  if (!plotId) return null;

  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  const matchedEntries = context.plotEntries.filter((entry) => getPlotId(entry.plot) === plotId);

  context.contentRoot?.updateWorldMatrix(true, true);

  matchedEntries.forEach((entry) => {
    entry.mesh.updateWorldMatrix(true, false);
    meshBox.setFromObject(entry.mesh);
    if (!meshBox.isEmpty()) {
      box.union(meshBox);
    }
  });

  return box.isEmpty() ? null : box;
};

const createModelSelectionOverlay = (context, plot) => {
  const box = getModelPlotBox(context, plot);
  if (!box) return;

  const size = box.getSize(new THREE.Vector3());
  const expansion = Math.max(size.x, size.y, size.z, 0.1) * 0.015;
  const helperBox = box.clone().expandByScalar(expansion);

  if (size.y < 0.02) {
    helperBox.min.y -= 0.02;
    helperBox.max.y += 0.08;
  }

  const helper = new THREE.Box3Helper(
    helperBox,
    context.theme.selectedPlotpopup || context.theme.selectedPlot || "#3b82f6"
  );

  helper.material.depthTest = false;
  helper.material.depthWrite = false;
  helper.material.transparent = true;
  helper.material.opacity = 0.9;
  helper.renderOrder = 20;
  helper.raycast = () => null;

  context.scene.add(helper);
  context.selectionOverlay = helper;
};

const createSelectionOverlay = (context, plot) => {
  removeSelectionOverlay(context);

  if (!plot || plot.isPlot === false) {
    return;
  }

  if (context.modelCoordinates) {
    createModelSelectionOverlay(context, plot);
    return;
  }

  const geometry = createPlotShapeGeometry(plot);
  if (!geometry) return;

  const material = new THREE.MeshBasicMaterial({
    color: context.theme.selectedPlotpopup || "#3b82f6",
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;

  if (context.modelCoordinates) {
    const { worldWidth, worldHeight } = context;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(-worldWidth / 2, SELECTION_LIFT, -worldHeight / 2);
    context.scene.add(mesh);
  } else {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = SELECTION_LIFT;
    context.contentRoot.add(mesh);
  }

  context.selectionOverlay = mesh;
};

const isViewerActive = (context) => (
  Boolean(context) &&
  !context.isSuspended &&
  context.isTabVisible &&
  context.isCanvasVisible
);

const cancelQueuedRender = (context) => {
  if (!context?.renderFrame) return;

  cancelAnimationFrame(context.renderFrame);
  context.renderFrame = null;
  context.renderQueued = false;
};

const requestRender = (context) => {
  if (!isViewerActive(context) || context.renderQueued) return;

  context.renderQueued = true;
  context.renderFrame = requestAnimationFrame(() => {
    context.renderQueued = false;
    context.renderFrame = null;
    if (!isViewerActive(context)) {
      return;
    }
    context.renderer.render(context.scene, context.camera);
  });
};

const suspendViewer = (context) => {
  if (!context || context.isSuspended) return;

  context.isSuspended = true;
  cancelQueuedRender(context);

  if (context.cameraAnimation) {
    cancelAnimationFrame(context.cameraAnimation);
    context.cameraAnimation = null;
  }

  if (context.statusAnimation) {
    cancelAnimationFrame(context.statusAnimation);
    context.statusAnimation = null;
    context.statusProgress = context.statusTarget ?? context.statusProgress;
    applyMaterialState(context);
  }

  if (context.controls) {
    context.controls.enabled = false;
  }
};

const resumeViewer = (context) => {
  if (!context) return;

  context.isSuspended = false;

  if (context.controls) {
    context.controls.enabled = true;
    context.controls.update();
  }

  updateCameraClipFromContent(context);
  requestRender(context);
};

const applyThemeToContext = (context, theme) => {
  if (!context || !theme) return;

  context.theme = theme;
  context.scene.background = new THREE.Color(theme.background || "#222222");

  const renderProfile = getLayoutRenderProfile(theme, {
    isCoarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches,
    isMobileDevice: window.innerWidth <= 768,
  });

  context.renderer.outputColorSpace = THREE.SRGBColorSpace;
  context.renderer.toneMapping = renderProfile.toneMapping;
  context.renderer.toneMappingExposure = renderProfile.exposure;
  context.ambientLight.intensity = renderProfile.ambientIntensity;
  context.hemisphereLight.intensity = renderProfile.hemisphereIntensity;
  context.directionalLight.intensity = renderProfile.directionalIntensity;

  if (context.labelMesh?.material?.color) {
    context.labelMesh.material.color.set(theme.plotNumber || "#292929");
    context.labelMesh.material.needsUpdate = true;
  }

  applyMaterialState(context);
  requestRender(context);
};

const updateControlsMode = (context) => {
  const { controls, isTopDown } = context;
  if (!controls) return;

  controls.minPolarAngle = isTopDown ? TOP_DOWN_POLAR_EPS : Math.PI / 5;
  controls.maxPolarAngle = isTopDown ? TOP_DOWN_POLAR_EPS : Math.PI / 2.15;
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.update();
};

const getFitFromBox = (context, box) => {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.z, size.y, 1);
  const fov = THREE.MathUtils.degToRad(context.camera.fov || CAMERA_FOV);
  const aspect = context.renderer.domElement.clientWidth / Math.max(1, context.renderer.domElement.clientHeight);
  const fitHeightDistance = maxDim / (2 * Math.tan(fov / 2));
  const fitWidthDistance = fitHeightDistance / Math.max(aspect, 0.001);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * (context.isTopDown ? 1.1 : 1.35);

  if (context.isTopDown) {
    return {
      target: center,
      position: new THREE.Vector3(center.x, center.y + distance, center.z + 0.001),
    };
  }

  const direction = new THREE.Vector3(0.72, 0.66, 0.88).normalize();
  return {
    target: center,
    position: center.clone().add(direction.multiplyScalar(distance)),
  };
};

const updateCameraClipFromBox = (context, box, distance) => {
  if (!context?.camera || !box || box.isEmpty()) return;

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const viewDistance = Number.isFinite(distance)
    ? distance
    : context.camera.position.distanceTo(sphere.center);
  const radius = Math.max(sphere.radius, 1);
  const nearByDistance = Math.max(0.05, viewDistance - radius * 1.8);

  context.camera.near = clamp(nearByDistance, 0.05, Math.max(0.05, viewDistance * 0.35));
  context.camera.far = Math.max(50, viewDistance + radius * 3);
  context.camera.updateProjectionMatrix();
};

const updateCameraClipFromContent = (context) => {
  if (!context?.contentBounds || context.contentBounds.isEmpty()) return;
  updateCameraClipFromBox(context, context.contentBounds);
};

const refreshContentBounds = (context) => {
  if (!context?.contentRoot) return;

  context.contentRoot.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(context.contentRoot);
  context.contentBounds = box.isEmpty() ? null : box;
  updateCameraClipFromContent(context);
};

const animateCameraTo = (context, position, target, duration = CAMERA_DURATION) => {
  if (!context.controls) return;
  if (context.cameraAnimation) {
    cancelAnimationFrame(context.cameraAnimation);
  }

  if (!isViewerActive(context)) {
    context.camera.position.copy(position);
    context.controls.target.copy(target);
    context.controls.update();
    context.cameraAnimation = null;
    return;
  }

  const startPosition = context.camera.position.clone();
  const startTarget = context.controls.target.clone();
  const startTime = performance.now();

  const tick = (now) => {
    if (!isViewerActive(context)) {
      context.cameraAnimation = null;
      return;
    }

    const progress = clamp((now - startTime) / duration, 0, 1);
    const eased = easeInOutCubic(progress);

    context.camera.position.lerpVectors(startPosition, position, eased);
    context.controls.target.lerpVectors(startTarget, target, eased);
    context.controls.update();
    requestRender(context);

    if (progress < 1) {
      context.cameraAnimation = requestAnimationFrame(tick);
    } else {
      context.cameraAnimation = null;
    }
  };

  context.cameraAnimation = requestAnimationFrame(tick);
};

const fitToContent = (context, animate = true) => {
  if (!context.contentRoot && !context.modelRoots?.length) return;

  const root = context.contentRoot || context.scene;
  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const fit = getFitFromBox(context, box);
  const distance = fit.position.distanceTo(fit.target);
  updateCameraClipFromBox(context, box, distance);

  if (animate) {
    animateCameraTo(context, fit.position, fit.target, CAMERA_DURATION);
  } else {
    context.camera.position.copy(fit.position);
    context.controls.target.copy(fit.target);
    context.controls.update();
    requestRender(context);
  }
};

const focusPlot = (context, plot, animate = true) => {
  if (!plot) {
    fitToContent(context, animate);
    return;
  }

  if (context.modelCoordinates) {
    const box = getModelPlotBox(context, plot);
    if (box) {
      const fit = getFitFromBox(context, box);
      const distance = fit.position.distanceTo(fit.target);
      updateCameraClipFromBox(context, box, distance);
      if (animate) {
        animateCameraTo(context, fit.position, fit.target, CAMERA_DURATION);
      } else {
        context.camera.position.copy(fit.position);
        context.controls.target.copy(fit.target);
        context.controls.update();
        requestRender(context);
      }
      return;
    }
  }

  const center = getWorldPlotCenter(plot, context);
  const bounds = getPlotBounds(plot);
  const fov = THREE.MathUtils.degToRad(context.camera.fov || CAMERA_FOV);
  const aspect = context.renderer.domElement.clientWidth / Math.max(1, context.renderer.domElement.clientHeight);
  const worldWidth = Math.max(bounds.width * SCALE3D, 0.001);
  const worldHeight = Math.max(bounds.height * SCALE3D, 0.001);
  const distY = worldHeight / (2 * Math.tan(fov / 2) * 0.62);
  const distX = worldWidth / (2 * Math.tan(fov / 2) * aspect * 0.62);
  const distance = clamp(Math.max(distX, distY), 7, 600);
  let position;
  const fitBox = new THREE.Box3().setFromCenterAndSize(
    center,
    new THREE.Vector3(worldWidth, 0.5, worldHeight)
  );

  if (context.isTopDown) {
    position = new THREE.Vector3(center.x, distance, center.z + 0.001);
  } else {
    const offset = context.camera.position.clone().sub(context.controls.target);
    if (offset.lengthSq() < 0.001) {
      offset.set(0.72, 0.66, 0.88);
    }
    position = center.clone().add(offset.normalize().multiplyScalar(distance * 1.45));
  }

  updateCameraClipFromBox(context, fitBox, position.distanceTo(center));

  if (animate) {
    animateCameraTo(context, position, center, CAMERA_DURATION);
  } else {
    context.camera.position.copy(position);
    context.controls.target.copy(center);
    context.controls.update();
    requestRender(context);
  }
};

const animateStatus = (context, target) => {
  context.statusTarget = target;

  if (context.statusAnimation) {
    cancelAnimationFrame(context.statusAnimation);
  }

  if (!isViewerActive(context)) {
    context.statusProgress = target;
    applyMaterialState(context);
    context.statusAnimation = null;
    return;
  }

  const start = context.statusProgress;
  const startTime = performance.now();

  const tick = (now) => {
    if (!isViewerActive(context)) {
      context.statusAnimation = null;
      return;
    }

    const progress = clamp((now - startTime) / STATUS_DURATION, 0, 1);
    context.statusProgress = start + (target - start) * easeInOutCubic(progress);
    applyMaterialState(context);
    requestRender(context);

    if (progress < 1) {
      context.statusAnimation = requestAnimationFrame(tick);
    } else {
      context.statusAnimation = null;
      context.statusProgress = target;
    }
  };

  context.statusAnimation = requestAnimationFrame(tick);
};

const clearContent = (context) => {
  removeSelectionOverlay(context);

  if (context.labelMesh) {
    context.labelMesh.parent?.remove(context.labelMesh);
    disposeObject(context.labelMesh);
    context.labelMesh = null;
  }

  if (context.contentRoot) {
    context.scene.remove(context.contentRoot);
    disposeObject(context.contentRoot);
  }

  context.modelRoots?.forEach((root) => {
    context.scene.remove(root);
    disposeObject(root);
  });

  context.contentRoot = null;
  context.modelRoots = [];
  context.plotEntries = [];
  context.clickTargets = [];
  context.contentBounds = null;
};

const buildJsonScene = (context, layout, image) => {
  const { analysisWidth, analysisHeight, worldWidth, worldHeight } = getSceneSize(layout, image);
  const root = new THREE.Group();
  root.position.set(-worldWidth / 2, 0, -worldHeight / 2);
  context.scene.add(root);
  context.contentRoot = root;
  context.modelCoordinates = false;
  context.analysisWidth = analysisWidth;
  context.analysisHeight = analysisHeight;
  context.worldWidth = worldWidth;
  context.worldHeight = worldHeight;

  const boundaryGeometry = createBoundaryGeometry(layout, image);
  const boundaryMaterial = new THREE.MeshBasicMaterial({
    color: context.theme.road || "#4E4F55",
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const boundaryMesh = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
  boundaryMesh.rotation.x = -Math.PI / 2;
  boundaryMesh.position.y = -0.01;
  boundaryMesh.renderOrder = 0;
  root.add(boundaryMesh);

  const plots = layout?.plots || [];
  plots.forEach((plot) => {
    const geometry = createPlotShapeGeometry(plot);
    if (!geometry) return;

    const material = new THREE.MeshBasicMaterial({
      color: getPlotBaseColor(plot, context.theme),
      side: plot.isPlot === false ? THREE.DoubleSide : THREE.FrontSide,
      transparent: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = plot.isPlot === false ? PLOT_SURFACE_LIFT + 0.003 : PLOT_SURFACE_LIFT;
    mesh.renderOrder = plot.isPlot === false ? 1 : 2;
    mesh.userData.fastPlot = plot;
    root.add(mesh);

    context.plotEntries.push({
      mesh,
      plot,
      originalColors: [new THREE.Color(getPlotBaseColor(plot, context.theme))],
    });

    if (plot.isPlot !== false) {
      context.clickTargets.push(mesh);
    }
  });

  const borderGeometry = createLineGeometryFromPlots(plots);
  if (borderGeometry) {
    const border = new THREE.LineSegments(
      borderGeometry,
      new THREE.LineBasicMaterial({
        color: context.theme.plotBorder || "#000000",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
    );
    border.renderOrder = 3;
    border.raycast = () => null;
    root.add(border);
  }

  const boundaryLineGeometry = createLineGeometryFromBoundary(layout);
  if (boundaryLineGeometry) {
    const boundaryLine = new THREE.LineSegments(
      boundaryLineGeometry,
      new THREE.LineBasicMaterial({
        color: context.theme.compoundWall || "#676767",
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
    );
    boundaryLine.renderOrder = 4;
    boundaryLine.raycast = () => null;
    root.add(boundaryLine);
  }

  const labels = createMergedLabelMesh({
    plots,
    color: context.theme.plotNumber || "#292929",
    selectedPlotId: getPlotId(context.selectedPlot),
    modelCoordinates: false,
    analysisWidth,
    analysisHeight,
  });

  if (labels) {
    context.scene.add(labels);
    context.labelMesh = labels;
  }

  refreshContentBounds(context);
};

const buildGltfScene = async (context, layout, image, buildToken) => {
  const assetConfig = getLayoutModelAssetConfig(layout);
  const urls = assetConfig.urls.map((url) => resolveServerUrl(url));

  if (!urls.length) {
    buildJsonScene(context, layout, image);
    return;
  }

  const loader = new GLTFLoader();
  const gltfs = await Promise.all(urls.map((url) => loader.loadAsync(url)));

  if (context.buildToken !== buildToken) {
    gltfs.forEach((gltf) => disposeObject(gltf.scene));
    return;
  }

  const root = new THREE.Group();
  root.position.fromArray(assetConfig.transform.position);
  root.rotation.fromArray(assetConfig.transform.rotation);
  root.scale.fromArray(assetConfig.transform.scale);

  const lookup = buildPlotLookup(layout?.plots || []);
  const roots = gltfs.map((gltf) => gltf.scene);

  roots.forEach((modelRoot) => {
    modelRoot.traverse((object) => {
      if (!object.isMesh) return;

      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;

      const plot = resolvePlotForObject(object, lookup);
      if (!plot || plot.isPlot === false) return;

      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material?.clone();
      getMaterialList(object.material).forEach(applyImportedPlotMaterialQuality);
      object.userData.fastPlot = plot;

      context.plotEntries.push({
        mesh: object,
        plot,
        originalColors: getMaterialList(object.material).map((material) => (
          material.color ? material.color.clone() : new THREE.Color(context.theme.plot || "#cfc4ab")
        )),
        originalMaterialStates: getMaterialList(object.material).map(getOriginalMaterialState),
      });
      context.clickTargets.push(object);
    });
    root.add(modelRoot);
  });

  context.scene.add(root);
  context.contentRoot = root;
  context.modelRoots = [];
  context.modelCoordinates = true;

  const { analysisWidth, analysisHeight, worldWidth, worldHeight } = getSceneSize(layout, image);
  context.analysisWidth = analysisWidth;
  context.analysisHeight = analysisHeight;
  context.worldWidth = worldWidth;
  context.worldHeight = worldHeight;

  const labels = createMergedLabelMesh({
    plots: layout?.plots || [],
    color: context.theme.plotNumber || "#292929",
    selectedPlotId: getPlotId(context.selectedPlot),
    modelCoordinates: true,
    analysisWidth,
    analysisHeight,
  });

  if (labels) {
    root.add(labels);
    context.labelMesh = labels;
  }

  refreshContentBounds(context);
};

export default function FastLayoutViewer({
  layout,
  image,
  theme,
  selectedPlot = null,
  showStatus = false,
  isTopDown = false,
  fitSignal = 0,
  northSignal = 0,
  onPlotSelect,
  onCameraAzimuth,
  onReady,
  onError,
}) {
  const canvasRef = React.useRef(null);
  const engineRef = React.useRef(null);
  const latestCallbacksRef = React.useRef({ onPlotSelect, onCameraAzimuth, onReady, onError });
  const latestStateRef = React.useRef({ selectedPlot, showStatus, isTopDown, theme });

  React.useEffect(() => {
    latestCallbacksRef.current = { onPlotSelect, onCameraAzimuth, onReady, onError };
  }, [onPlotSelect, onCameraAzimuth, onReady, onError]);

  React.useEffect(() => {
    latestStateRef.current = { selectedPlot, showStatus, isTopDown, theme };
  }, [isTopDown, selectedPlot, showStatus, theme]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 5000);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      depth: true,
      logarithmicDepthBuffer: true,
      precision: "highp",
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const ambientLight = new THREE.AmbientLight("#ffffff", 1);
    const hemisphereLight = new THREE.HemisphereLight("#b5d8ff", "#5f4520", 0.55);
    const directionalLight = new THREE.DirectionalLight("#ffffff", 0.85);
    directionalLight.position.set(50, 150, 50);
    scene.add(ambientLight, hemisphereLight, directionalLight);

    const controls = new OrbitControls(camera, canvas);

    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    controls.zoomSpeed = 1.05;
    controls.panSpeed = 1.05;
    controls.rotateSpeed = 1.8;

    const context = {
      canvas,
      scene,
      camera,
      renderer,
      controls,
      ambientLight,
      hemisphereLight,
      directionalLight,
      theme: {},
      isTopDown: false,
      selectedPlot: null,
      statusProgress: 0,
      contentRoot: null,
      modelRoots: [],
      plotEntries: [],
      clickTargets: [],
      contentBounds: null,
      modelCoordinates: false,
      analysisWidth: 1,
      analysisHeight: 1,
      worldWidth: 1,
      worldHeight: 1,
      isTabVisible: document.visibilityState !== "hidden",
      isCanvasVisible: true,
      isSuspended: false,
      renderQueued: false,
      renderFrame: null,
      cameraAnimation: null,
      statusAnimation: null,
      statusTarget: 0,
      selectionOverlay: null,
      buildToken: 0,
      lastClickDown: null,
      lastAzimuthEmit: 0,
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
      const height = Math.max(1, Math.floor(rect.height || window.innerHeight));
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(getRendererPixelRatio());
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender(context);
    };

    const emitAzimuth = () => {
      const now = performance.now();
      if (now - context.lastAzimuthEmit < 80) return;
      context.lastAzimuthEmit = now;
      latestCallbacksRef.current.onCameraAzimuth?.(getCurrentAzimuthDegrees(controls));
    };

    const handleControlChange = () => {
      emitAzimuth();
      updateCameraClipFromContent(context);
      requestRender(context);
    };

    const handlePointerDown = (event) => {
      context.lastClickDown = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
    };

    const handlePointerUp = (event) => {
      if (!context.lastClickDown || context.clickTargets.length === 0) return;

      const moved = Math.hypot(event.clientX - context.lastClickDown.x, event.clientY - context.lastClickDown.y);
      const elapsed = performance.now() - context.lastClickDown.time;
      context.lastClickDown = null;
      if (moved > 8 || elapsed > 650) return;

      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(context.clickTargets, true);

      for (const hit of intersections) {
        let current = hit.object;
        while (current) {
          const plot = current.userData?.fastPlot;
          if (plot) {
            context.selectedPlot = plot;
            createSelectionOverlay(context, plot);
            applyMaterialState(context);
            focusPlot(context, plot, true);
            latestCallbacksRef.current.onPlotSelect?.(plot);
            requestRender(context);
            return;
          }
          current = current.parent;
        }
      }

      context.selectedPlot = null;
      removeSelectionOverlay(context);
      applyMaterialState(context);
      latestCallbacksRef.current.onPlotSelect?.(null);
      requestRender(context);
    };

    const handleVisibility = () => {
      context.isTabVisible = document.visibilityState !== "hidden";
      if (context.isTabVisible) {
        resumeViewer(context);
      } else {
        suspendViewer(context);
      }
    };

    const handlePageHide = () => {
      context.isTabVisible = false;
      suspendViewer(context);
    };

    const handlePageShow = () => {
      context.isTabVisible = document.visibilityState !== "hidden";
      if (context.isTabVisible && context.isCanvasVisible) {
        resumeViewer(context);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      context.isCanvasVisible = Boolean(entries[0]?.isIntersecting);
      if (context.isCanvasVisible) {
        if (context.isTabVisible) {
          resumeViewer(context);
        }
      } else {
        suspendViewer(context);
      }
    }, { threshold: 0 });

    controls.addEventListener("change", handleControlChange);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);
    observer.observe(canvas);

    engineRef.current = context;
    updateControlsMode(context);
    resize();

    return () => {
      controls.removeEventListener("change", handleControlChange);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
      observer.disconnect();

      if (context.cameraAnimation) cancelAnimationFrame(context.cameraAnimation);
      if (context.statusAnimation) cancelAnimationFrame(context.statusAnimation);
      if (context.renderFrame) cancelAnimationFrame(context.renderFrame);
      clearContent(context);
      controls.dispose();
      renderer.dispose();
      engineRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context || !layout || !image) return undefined;

    let cancelled = false;
    const buildToken = context.buildToken + 1;
    const latestState = latestStateRef.current;
    const activeTheme = latestState.theme || theme;
    context.buildToken = buildToken;
    context.selectedPlot = latestState.selectedPlot;
    context.isTopDown = latestState.isTopDown;
    context.statusProgress = latestState.showStatus ? 1 : 0;
    applyThemeToContext(context, activeTheme);

    clearContent(context);

    const build = async () => {
      try {
        const assetConfig = getLayoutModelAssetConfig(layout);
        if (assetConfig.urls.length) {
          await buildGltfScene(context, layout, image, buildToken);
        } else {
          buildJsonScene(context, layout, image);
        }

        if (cancelled || context.buildToken !== buildToken) return;

        updateControlsMode(context);
        applyMaterialState(context);
        if (latestState.selectedPlot) {
          createSelectionOverlay(context, latestState.selectedPlot);
          focusPlot(context, latestState.selectedPlot, false);
        } else {
          fitToContent(context, false);
        }
        requestRender(context);
        latestCallbacksRef.current.onReady?.();
      } catch (error) {
        console.error("Fast layout viewer failed:", error);
        latestCallbacksRef.current.onError?.(error);
      }
    };

    build();

    return () => {
      cancelled = true;
    };
  }, [layout, image]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context || !theme) return;

    applyThemeToContext(context, theme);
  }, [theme]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context) return;

    context.selectedPlot = selectedPlot;
    removeSelectionOverlay(context);

    if (selectedPlot) {
      createSelectionOverlay(context, selectedPlot);
      focusPlot(context, selectedPlot, true);
    }

    applyMaterialState(context);
    requestRender(context);
  }, [selectedPlot]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context) return;

    context.isTopDown = isTopDown;
    updateControlsMode(context);
    if (context.selectedPlot) {
      focusPlot(context, context.selectedPlot, true);
    } else {
      fitToContent(context, true);
    }
  }, [isTopDown]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context) return;

    animateStatus(context, showStatus ? 1 : 0);
  }, [showStatus]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context || fitSignal === 0) return;
    fitToContent(context, true);
  }, [fitSignal]);

  React.useEffect(() => {
    const context = engineRef.current;
    if (!context || northSignal === 0 || !context.controls) return;

    const targetAzimuth = THREE.MathUtils.degToRad(layout?.frontDirection || 0);
    const offset = context.camera.position.clone().sub(context.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta = targetAzimuth;

    const nextPosition = new THREE.Vector3().setFromSpherical(spherical).add(context.controls.target);
    animateCameraTo(context, nextPosition, context.controls.target.clone(), 450);
  }, [northSignal, layout?.frontDirection]);

  return <canvas ref={canvasRef} className="fast-layout-viewer__canvas" />;
}
