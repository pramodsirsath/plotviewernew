import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import { RenderProp } from "../shared/Props3D";
import CompassIndicator from "../shared/CompassIndicator";
import { FloatingUI } from "../shared/FloatingUI";
import CameraAngleController from "../shared/CameraAngleController";
import FitToLayoutController from "../shared/FitToLayoutController";
import MapReadOnlyView from "../shared/MapReadOnlyView";
import PlotSelection3D from "../shared/PlotSelection3D";
import GroundTextLabel3D from "../shared/GroundTextLabel3D";
import useIsCoarsePointer from "../shared/useIsCoarsePointer";
import { getPlotCenter, getPlotBounds } from "../../utils/plotGeometry";
import {
  blendHexColors,
  getLayoutStatusStyle as getStatusStyle,
  LAYOUT_MAP_COLORS,
  LAYOUT_STATUS_COLORS,
} from "../../theme/layoutMapTheme";
import "./BuilderLayoutView.css";

const STATUS_OPTIONS = ["Available", "Reserved", "Sold"];
const CAMERA_ANIMATION_DURATION = 1000;
const STATUS_WAVE_DURATION = 1800;
const STATUS_DESCRIPTIONS = {
  Available: "Ready for the next buyer conversation.",
  Reserved: "Temporarily on hold while follow-up continues.",
  Sold: "Closed and no longer available in inventory.",
};
const getViewport = () => ({
  width: typeof window !== "undefined" ? window.innerWidth : 1280,
  height: typeof window !== "undefined" ? window.innerHeight : 720,
});
const rotatePoint = (point, center, angle) => {
  const radians = (angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;

  return {
    x: center.x + offsetX * cosine - offsetY * sine,
    y: center.y + offsetX * sine + offsetY * cosine,
  };
};
const getRotatedSize = (width, height, angle) => {
  const radians = (angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));

  return {
    width: width * cosine + height * sine,
    height: width * sine + height * cosine,
  };
};
const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
const getZoomLabel = (value) => {
  const percent = value * 100;

  if (percent >= 1000) {
    return `${Math.round(percent).toLocaleString()}%`;
  }

  if (percent >= 10) {
    return `${Math.round(percent)}%`;
  }

  if (percent >= 1) {
    return `${percent.toFixed(1)}%`;
  }

  return `${percent.toFixed(2)}%`;
};
const formatMetricValue = (value, unit = "") => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  const formatted = Math.abs(parsed - Math.round(parsed)) < 0.01
    ? String(Math.round(parsed))
    : parsed.toFixed(Math.abs(parsed) >= 10 ? 1 : 2).replace(/0+$/, "").replace(/\.$/, "");

  return unit ? `${formatted} ${unit}` : formatted;
};
const getFittedViewport = ({ img, angle, canvasWidth, canvasHeight }) => {
  if (!img) {
    return null;
  }

  const padding = canvasWidth <= 640 ? 72 : 120;
  const availableWidth = Math.max(canvasWidth - padding, 180);
  const availableHeight = Math.max(canvasHeight - padding, 180);
  const rotatedSize = getRotatedSize(img.width, img.height, angle);
  const nextScale = clampScale(
    Math.min(availableWidth / rotatedSize.width, availableHeight / rotatedSize.height)
  );

  return {
    scale: nextScale,
    position: {
      x: canvasWidth / 2 - (img.width / 2) * nextScale,
      y: canvasHeight / 2 - (img.height / 2) * nextScale,
    },
  };
};

// --- 3D Components ---
const SCALE3D = 0.05;
const TOP_DOWN_POLAR_EPS = 0.0001;
const DEFAULT_TOUCH_CONTROLS = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const MOBILE_TOUCH_CONTROLS = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

// Time-based camera animation (max 1.5s)
function CameraAnimator({ cameraTargetPlot, image, layout, isTopDown, angleAnimating, fitLocked }) {
  const { camera, controls } = useThree();
  
  // Animate on plot selection (fit selected plot larger in view)
  React.useEffect(() => {
    if (angleAnimating || fitLocked) return; // don't animate camera while angle is animating or fit-locked
    if (cameraTargetPlot === undefined) return;
    if (!controls || !image || !layout) return;

    const analysisW = layout.meta?.analysisWidth || image.width;
    const analysisH = layout.meta?.analysisHeight || image.height;

    let frame;
    let cancelled = false;
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startTime = performance.now();

    const endTarget = new THREE.Vector3();
    const endPos = new THREE.Vector3();

    if (cameraTargetPlot) {
      const cx = getPlotCenter(cameraTargetPlot).x * SCALE3D - (analysisW * SCALE3D) / 2;
      const cz = getPlotCenter(cameraTargetPlot).y * SCALE3D - (analysisH * SCALE3D) / 2;
      endTarget.set(cx, 0, cz);

      const bounds = getPlotBounds(cameraTargetPlot);
      const width = Math.max(0.0001, bounds.width * SCALE3D);
      const height = Math.max(0.0001, bounds.height * SCALE3D);

      // Fill ~70% of viewport with the selected plot for a clear, large view
      const fillFraction = 0.82;
      const fov = ((camera.fov || 45) * Math.PI) / 180;
      const aspect = camera.aspect || (window.innerWidth / window.innerHeight);
      const tanFov2 = Math.tan(fov / 2);
      const halfH = height / 2;
      const halfW = width / 2;
      const distV = halfH / (tanFov2 * fillFraction);
      const distH = halfW / (tanFov2 * aspect * fillFraction);
      const dist = Math.max(4.5, Math.min(2000, Math.max(distV, distH)));

      if (isTopDown) {
        const azimuth = controls.getAzimuthalAngle ? controls.getAzimuthalAngle() : 0;
        endPos.set(
          endTarget.x + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(TOP_DOWN_POLAR_EPS),
          endTarget.z + dist * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        const polar = controls.getPolarAngle ? controls.getPolarAngle() : Math.PI / 4;
        const azimuth = controls.getAzimuthalAngle ? controls.getAzimuthalAngle() : 0;

        endPos.set(
          endTarget.x + dist * Math.sin(polar) * Math.sin(azimuth),
          endTarget.y + dist * Math.cos(polar),
          endTarget.z + dist * Math.sin(polar) * Math.cos(azimuth)
        );
      }
    } else {
      endTarget.set(0, 0, 0);
      const overviewH = Math.max(analysisH * SCALE3D * 1.5, 50);
      if (isTopDown) {
        const azimuth = controls.getAzimuthalAngle ? controls.getAzimuthalAngle() : 0;
        endPos.set(
          overviewH * Math.sin(TOP_DOWN_POLAR_EPS) * Math.sin(azimuth),
          overviewH * Math.cos(TOP_DOWN_POLAR_EPS),
          overviewH * Math.sin(TOP_DOWN_POLAR_EPS) * Math.cos(azimuth)
        );
      } else {
        endPos.set(0, overviewH * 0.6, (analysisH * SCALE3D) / 2 + 40);
      }
    }

    const cancelOnInteract = () => { cancelled = true; };
    controls.addEventListener('start', cancelOnInteract);

    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / CAMERA_ANIMATION_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.update();
      if (t < 1) {
        frame = requestAnimationFrame(animate);
      }
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      controls.removeEventListener('start', cancelOnInteract);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cameraTargetPlot, camera, controls, image, layout]);

  return null;
}

// Navigate to north: smoothly rotate camera azimuthal angle to 0
function NavigateToNorth({ trigger, onDone }) {
  const { controls, camera } = useThree();
  React.useEffect(() => {
    if (!trigger || !controls) return;
    let frame;
    let cancelled = false;
    const startTime = performance.now();
    const startAzimuth = controls.getAzimuthalAngle();
    // Find shortest path to 0
    let targetAzimuth = 0;
    const diff = targetAzimuth - startAzimuth;
    
    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / 800, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const currentAzimuth = startAzimuth + diff * ease;
      // Rotate camera around target
      const distance = camera.position.distanceTo(controls.target);
      const polar = controls.getPolarAngle();
      camera.position.x = controls.target.x + distance * Math.sin(polar) * Math.sin(currentAzimuth);
      camera.position.z = controls.target.z + distance * Math.sin(polar) * Math.cos(currentAzimuth);
      camera.position.y = controls.target.y + distance * Math.cos(polar);
      controls.update();
      if (t < 1) frame = requestAnimationFrame(animate);
      else onDone?.();
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame); };
  }, [trigger, controls, camera]);
  return null;
}

// Removed createPlotLabelTexture as we use Vector Text

const PlotMesh = React.memo(function PlotMesh({ plot, isSelected, isDimmed, onClick, showStatus, statusRevealProgress, meta }) {
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape();
    if (plot.points && plot.points.length >= 6) {
      if (plot.isCurved) {
        const shapeVectors = [];
        for (let i = 0; i < plot.points.length; i += 2) {
          shapeVectors.push(new THREE.Vector2(plot.points[i] * SCALE3D, -plot.points[i + 1] * SCALE3D));
        }
        shape.moveTo(shapeVectors[0].x, shapeVectors[0].y);
        shape.splineThru(shapeVectors);
      } else {
        shape.moveTo(plot.points[0] * SCALE3D, -plot.points[1] * SCALE3D);
        for (let i = 2; i < plot.points.length; i += 2) {
          shape.lineTo(plot.points[i] * SCALE3D, -plot.points[i+1] * SCALE3D);
        }
        shape.lineTo(plot.points[0] * SCALE3D, -plot.points[1] * SCALE3D);
      }
    } else {
      shape.moveTo(plot.x * SCALE3D, -plot.y * SCALE3D);
      shape.lineTo((plot.x + plot.width) * SCALE3D, -plot.y * SCALE3D);
      shape.lineTo((plot.x + plot.width) * SCALE3D, -(plot.y + plot.height) * SCALE3D);
      shape.lineTo(plot.x * SCALE3D, -(plot.y + plot.height) * SCALE3D);
      shape.lineTo(plot.x * SCALE3D, -plot.y * SCALE3D);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: isSelected ? 0.1 : 0.05, bevelEnabled: false });
  }, [plot, isSelected]);

  const plotColor = React.useMemo(() => {
    if (isSelected) return LAYOUT_MAP_COLORS.selectedPlot;
    const statusColor = LAYOUT_STATUS_COLORS[plot.status] || LAYOUT_MAP_COLORS.plot;

    if (statusRevealProgress <= 0) return LAYOUT_MAP_COLORS.plot;
    if (statusRevealProgress >= 1) return statusColor;

    return blendHexColors(LAYOUT_MAP_COLORS.plot, statusColor, statusRevealProgress);
  }, [isSelected, plot.status, showStatus, statusRevealProgress]);

  const center = getPlotCenter(plot);
  const bounds = getPlotBounds(plot);
  const labelW = bounds.width * SCALE3D * 0.45;
  const labelH = bounds.height * SCALE3D * 0.45;
  const labelSize = Math.max(0.4, Math.min(labelW, labelH, 2.5));

  return (
    <group>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick(plot); }}
      >
        <meshStandardMaterial color={plotColor} roughness={1} metalness={0} transparent={isDimmed} opacity={isDimmed ? 0.25 : 1} />
        <lineSegments raycast={() => null} transparent={isDimmed} opacity={isDimmed ? 0.25 : 1}>
          <edgesGeometry attach="geometry" args={[geometry]} />
          <lineBasicMaterial attach="material" color={LAYOUT_MAP_COLORS.plotNumber} linewidth={1} />
        </lineSegments>
      </mesh>
      {plot.plotNo && (
        <GroundTextLabel3D
          text={plot.plotNo}
          position={[center.x * SCALE3D, isSelected ? 0.12 : 0.06, center.y * SCALE3D]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={labelSize}
          color={isSelected ? LAYOUT_MAP_COLORS.white : LAYOUT_MAP_COLORS.plotNumber}
          opacity={isDimmed ? 0.25 : 1}
          depthWrite={false}
          renderOrder={1}
          raycast={() => null}
        />
      )}
    </group>
  );
});

function BoundaryMesh({ boundary, meta }) {
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape();
    if (boundary && boundary.length > 0) {
      shape.moveTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
      for (let i = 2; i < boundary.length; i += 2) {
         shape.lineTo(boundary[i] * SCALE3D, -boundary[i+1] * SCALE3D);
      }
      shape.lineTo(boundary[0] * SCALE3D, -boundary[1] * SCALE3D);
    } else if (meta) {
      shape.moveTo(0, 0);
      shape.lineTo(meta.analysisWidth * SCALE3D, 0);
      shape.lineTo(meta.analysisWidth * SCALE3D, -meta.analysisHeight * SCALE3D);
      shape.lineTo(0, -meta.analysisHeight * SCALE3D);
    }
    return new THREE.ShapeGeometry(shape);
  }, [boundary, meta]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <meshStandardMaterial color={LAYOUT_MAP_COLORS.background} roughness={1} />
    </mesh>
  );
}

// Compound wall around boundary
function CompoundWall({ boundary, meta }) {
  const wallGeometry = React.useMemo(() => {
    const points = [];
    if (boundary && boundary.length >= 6) {
      for (let i = 0; i < boundary.length; i += 2) {
        points.push(new THREE.Vector3(boundary[i] * SCALE3D, 0, boundary[i+1] * SCALE3D));
      }
      points.push(points[0].clone()); // close loop
    } else if (meta) {
      const w = meta.analysisWidth * SCALE3D;
      const h = meta.analysisHeight * SCALE3D;
      points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, 0, 0), new THREE.Vector3(w, 0, h), new THREE.Vector3(0, 0, h), new THREE.Vector3(0, 0, 0));
    }
    if (points.length < 3) return null;
    
    const WALL_HEIGHT = 0.5;
    const positions = [];
    const indices = [];
    for (let i = 0; i < points.length - 1; i++) {
      const bi = positions.length / 3;
      const a = points[i], b = points[i + 1];
      positions.push(a.x, 0, a.z,  b.x, 0, b.z,  b.x, WALL_HEIGHT, b.z,  a.x, WALL_HEIGHT, a.z);
      indices.push(bi, bi+1, bi+2, bi, bi+2, bi+3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [boundary, meta]);

  if (!wallGeometry) return null;
  return (
    <mesh geometry={wallGeometry}>
      <meshStandardMaterial color={LAYOUT_MAP_COLORS.compoundWall} roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Track 3D camera azimuthal angle for compass
function CameraRotationTracker({ onAngleChange }) {
  const { controls } = useThree();
  React.useEffect(() => {
    if (!controls) return;
    const handler = () => onAngleChange(controls.getAzimuthalAngle() * (180 / Math.PI));
    controls.addEventListener('change', handler);
    return () => controls.removeEventListener('change', handler);
  }, [controls, onAngleChange]);
  return null;
}
// ---------------------

const BuilderLayoutView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [layout, setLayout] = useState(null);
  const [image, setImage] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadState, setLoadState] = useState("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [updateNotice, setUpdateNotice] = useState("");
  const [updateTone, setUpdateTone] = useState("muted");
  const [reloadKey, setReloadKey] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryImages, setGalleryImages] = useState([]);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [cameraAzimuth, setCameraAzimuth] = useState(0);
  const [cameraTargetPlot, setCameraTargetPlot] = useState(undefined);
  const [showStatus, setShowStatus] = useState(false);
  const [statusRevealProgress, setStatusRevealProgress] = useState(0);
  const [navigateNorthTrigger, setNavigateNorthTrigger] = useState(0);
  const statusAnimRef = useRef(null);
  const controlsRef = useRef();
  const [isTopDown, setIsTopDown] = useState(false);
  const [angleAnimating, setAngleAnimating] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [fitLocked, setFitLocked] = useState(false);
  const isCoarsePointer = useIsCoarsePointer();

  const [viewport, setViewport] = useState(getViewport());

  useEffect(() => {
    const handleResize = () => setViewport(getViewport());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Clear fit lock when user interacts with controls (so Home persists until user starts interacting)
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const onStart = () => setFitLocked(false);
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controlsRef]);

  // Status reveal animation
  useEffect(() => {
    if (statusAnimRef.current) cancelAnimationFrame(statusAnimRef.current);
    const startTime = performance.now();
    const startVal = statusRevealProgress;
    const endVal = showStatus ? 1 : 0;
    if (startVal === endVal) return;
    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / STATUS_WAVE_DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setStatusRevealProgress(startVal + (endVal - startVal) * ease);
      if (t < 1) statusAnimRef.current = requestAnimationFrame(animate);
    };
    statusAnimRef.current = requestAnimationFrame(animate);
    return () => { if (statusAnimRef.current) cancelAnimationFrame(statusAnimRef.current); };
  }, [showStatus]);

  const canvasWidth = viewport.width;
  const canvasHeight = viewport.height;

  useEffect(() => {
    let isCancelled = false;
    const img = new window.Image();

    const loadLayout = async () => {
      setLoadState("loading");
      setLoadMessage("");
      setLayout(null);
      setImage(null);
      setSelectedPlot(null);
      setIsUpdating(false);
      setUpdateNotice("");
      setUpdateTone("muted");

      try {
        const res = await API.get(`/builder/layouts/${id}`);

        if (isCancelled) {
          return;
        }

        setLayout(res.data);

        img.onload = () => {
          if (isCancelled) {
            return;
          }

          setImage(img);
          setLoadState("ready");
        };

        img.onerror = () => {
          if (isCancelled) {
            return;
          }

          setLoadState("error");
          setLoadMessage("The assigned layout image could not be loaded.");
        };

        img.src = resolveServerUrl(res.data.imageUrl);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error(error);
        setLoadState(error.response?.status === 404 ? "not-found" : "error");
        setLoadMessage(error.response?.data?.message || "Could not load this assigned layout.");
      }
    };

    loadLayout();

    return () => {
      isCancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [id, reloadKey]);

  const fitToScreen = () => {
    setSelectedPlot(null);
    setCameraTargetPlot(undefined);
    setFitLocked(false);
    setAngleAnimating(true);
    setFitKey((k) => k + 1);
  };

  const focusPlot = (plot) => {
    if (!image) {
      return;
    }
    setFitLocked(false);
    setSelectedPlot(plot);
    setCameraTargetPlot(plot); // Animate camera to this plot
  };

  // =============== SHARE ===============
  const handleShare = async () => {
    // Share the customer public link, not the builder URL
    let shareUrl = window.location.href;
    if (layout?.publicToken) {
      shareUrl = `${window.location.origin}/layout/view/${layout.publicToken}`;
    }
    const shareData = {
      title: layout?.name || "Plot Layout",
      text: `Check out the layout: ${layout?.name}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Customer link copied!");
        setTimeout(() => setShareMessage(""), 1000);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareMessage("Customer link copied!");
          setTimeout(() => setShareMessage(""), 1000);
        } catch {
          console.error(err);
        }
      }
    }
  };

  // =============== GALLERY ===============
  const fetchGallery = async () => {
    try {
      const res = await API.get(`/builder/layouts/${id}/gallery`);
      setGalleryImages(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("gallery", files[i]);
    }

    try {
      setGalleryUploading(true);
      const res = await API.post(`/builder/layouts/${id}/gallery`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setGalleryImages(res.data.galleryImages || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleGalleryDelete = async (index) => {
    try {
      const res = await API.delete(`/builder/layouts/${id}/gallery/${index}`);
      setGalleryImages(res.data.galleryImages || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (searchQuery && layout?.plots) {
      const match = layout.plots.find(p => p.plotNo?.toLowerCase() === searchQuery.toLowerCase() || p.id === searchQuery);
      if (match) {
        focusPlot(match);
      }
    }
  }, [searchQuery, layout]);

  useEffect(() => {
    if (showGallery && layout) {
      fetchGallery();
    }
  }, [showGallery]);

  // Compass click handler: navigate to north
  const handleNavigateNorth = React.useCallback(() => {
    setNavigateNorthTrigger((n) => n + 1);
  }, []);

  const updateStatus = async (plot, status) => {
    if (!layout || !plot || plot.status === status) {
      return;
    }

    try {
      setIsUpdating(true);
      setUpdateNotice("");
      const res = await API.patch("/builder/plot-status", {
        layoutId: layout._id,
        plotId: plot._id,
        status,
      });

      setLayout((previousLayout) => ({
        ...previousLayout,
        plots: previousLayout.plots.map((item) =>
          item._id === plot._id ? { ...item, status: res.data.plot.status } : item
        ),
      }));
      setSelectedPlot((previousPlot) =>
        previousPlot && previousPlot._id === plot._id
          ? { ...previousPlot, status: res.data.plot.status }
          : previousPlot
      );
      setUpdateTone("success");
      setUpdateNotice(`Plot ${plot.plotNo || "-"} is now marked as ${res.data.plot.status}.`);
    } catch (error) {
      console.error(error);
      setUpdateTone("error");
      setUpdateNotice(error.response?.data?.message || "Could not update plot status.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (loadState !== "ready" || !layout || !image) {
    const isLoading = loadState === "loading";
    const title = isLoading
      ? "Preparing your builder layout"
      : loadState === "not-found"
        ? "Layout not available"
        : "Could not open this layout";
    const message = isLoading
      ? "We are loading the assigned layout, image, and plot data for this workspace."
      : loadMessage;

    return (
      <div className="builder-layout-view builder-layout-view--state">
        <div className="builder-layout-view__ambient builder-layout-view__ambient--one" />
        <div className="builder-layout-view__ambient builder-layout-view__ambient--two" />
        <div className="builder-layout-view__ambient builder-layout-view__ambient--three" />
        <div className="builder-layout-view__grid" />
        <div className="builder-layout-view__state-card">
          <div className="builder-layout-view__eyebrow">Builder Workspace</div>
          <h1 className="builder-layout-view__state-title">{title}</h1>
          <p className="builder-layout-view__state-copy">{message}</p>

          {!isLoading && (
            <div className="builder-layout-view__state-actions">
              <button
                type="button"
                className="builder-layout-view__action builder-layout-view__action--ghost"
                onClick={() => navigate("/builder-dashboard")}
              >
                Back to Dashboard
              </button>
              <button
                type="button"
                className="builder-layout-view__action builder-layout-view__action--primary"
                onClick={() => setReloadKey((previousKey) => previousKey + 1)}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const imageCenterX = image.width / 2;
  const imageCenterY = image.height / 2;
  const plotCounts = { Available: 0, Reserved: 0, Sold: 0 };

  layout.plots.forEach((plot) => {
    plotCounts[plot.status] = (plotCounts[plot.status] || 0) + 1;
  });

  const totalPlots = layout.plots.length;
  const selectedDimensions = selectedPlot
    ? `${formatMetricValue(selectedPlot.plotWidth, "ft")} x ${formatMetricValue(selectedPlot.plotHeight, "ft")}`
    : null;
  const workspaceHint = selectedPlot
    ? `Plot ${selectedPlot.plotNo || "-"} selected. Update its status below.`
    : "Tap a plot. Drag to pan, scroll to zoom, Alt+scroll to rotate.";

  return (
    <div className="builder-layout-view">
      <div className="builder-layout-view__ambient builder-layout-view__ambient--one" />
      <div className="builder-layout-view__ambient builder-layout-view__ambient--two" />
      <div className="builder-layout-view__ambient builder-layout-view__ambient--three" />
      <div className="builder-layout-view__grid" />

      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate("/builder-dashboard")}
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(20, 20, 20, 0.8)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        title="Back to Dashboard"
      >←</button>

      {/* Project Title — like spacer.land "NAKSHATRA" */}
      <div style={{
        position: 'absolute', top: 16, left: 68, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(20, 20, 20, 0.8)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12, padding: '8px 18px 8px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #d97706, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>▲</div>
        <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Outfit','Inter',sans-serif" }}>{layout.name}</span>
      </div>

      {shareMessage && (
        <div style={{ position: 'absolute', top: 66, left: 68, zIndex: 20, padding: '6px 14px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: '#16a34a', fontSize: '0.78rem', fontWeight: 700, backdropFilter: 'blur(12px)' }}>
          {shareMessage}
        </div>
      )}

      {/* Compass — below back button — click to face North */}
      <div style={{ position: 'absolute', top: 66, left: 16, zIndex: 20 }}>
        <CompassIndicator rotation={cameraAzimuth} frontDirection={layout?.frontDirection || 0} size={44} onClick={handleNavigateNorth} />
      </div>

      <FloatingUI
        isCanvasMode={true}
        setIsCanvasMode={() => {}}
        isTopDown={isTopDown}
        onToggleTopDown={() => setIsTopDown((s) => !s)}
        onFit={() => { fitToScreen(); }}
        onShare={handleShare}
        onOpenGallery={() => setShowGallery(!showGallery)}
        onOpenInfo={null}
        onLocate={() => setShowMap(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showStatus={showStatus}
        setShowStatus={setShowStatus}
      />

      <div className={`builder-layout-view__canvas-shell is-active`}>
        <div className="builder-layout-view__canvas-frame" />
        
        {layout && image && (
          <>
          <Canvas 
            dpr={[1, 1.5]}
            performance={{ min: 0.5 }}
            shadows={false}
            camera={{ position: [0, Math.max((layout?.meta?.analysisHeight || image.height) * SCALE3D * 1.5, 50), ((layout?.meta?.analysisHeight || image.height) * SCALE3D) / 2 + 40], fov: 45 }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'default', touchAction: 'none' }}
            onPointerMissed={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); }}
          >
            <color attach="background" args={[LAYOUT_MAP_COLORS.background]} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
            <directionalLight position={[50, 150, 50]} intensity={1.0} />
            <CameraAnimator cameraTargetPlot={cameraTargetPlot} image={image} layout={layout} isTopDown={isTopDown} angleAnimating={angleAnimating} fitLocked={fitLocked} />
            <CameraAngleController isTopDown={isTopDown} controlsRef={controlsRef} duration={360} onStart={() => setAngleAnimating(true)} onComplete={() => setAngleAnimating(false)} />
            <FitToLayoutController fitKey={fitKey} isTopDown={isTopDown} image={image} layout={layout} scale={SCALE3D} duration={1600} onStart={() => setAngleAnimating(true)} onComplete={() => { setAngleAnimating(false); setFitLocked(true); }} />
            <CameraRotationTracker onAngleChange={setCameraAzimuth} />
            <NavigateToNorth trigger={navigateNorthTrigger} onDone={() => {}} />
            <group position={[-((layout?.meta?.analysisWidth || image.width) * SCALE3D) / 2, 0, -((layout?.meta?.analysisHeight || image.height) * SCALE3D) / 2]}>
              <BoundaryMesh boundary={layout.boundary} meta={layout.meta || { analysisWidth: image.width, analysisHeight: image.height }} />

              <CompoundWall boundary={layout.boundary} meta={layout.meta || { analysisWidth: image.width, analysisHeight: image.height }} />

              {layout.plots.map((plot) => {
                // Wave: compute per-plot reveal based on x position
                const plotCenter = getPlotCenter(plot);
                const analysisW = layout.meta?.analysisWidth || image.width;
                const normalizedX = plotCenter.x / analysisW;
                // Each plot reveals when the wave reaches its x position
                const plotReveal = Math.min(1, Math.max(0, (statusRevealProgress * 1.6) - normalizedX * 0.6));
                return (
                  <PlotMesh 
                    key={plot._id || plot.id} 
                    plot={plot} 
                    isSelected={selectedPlot?._id === plot._id}
                    isDimmed={!!selectedPlot && selectedPlot._id !== plot._id}
                    onClick={focusPlot}
                    showStatus={showStatus}
                    statusRevealProgress={plotReveal}
                  />
                );
              })}

              {selectedPlot && <PlotSelection3D plot={selectedPlot} scale={SCALE3D} />}
            </group>
            {(layout.props3D || []).map((item) => (
               <RenderProp 
                 key={item.id} 
                 item={item} 
                 onClick={(i, e) => { e.stopPropagation(); }} 
                 isSelected={false}
                 transformMode={"translate"}
                 onTransformEnd={() => {}}
               />
            ))}


            <OrbitControls 
              ref={controlsRef}
              makeDefault 
              touches={isCoarsePointer ? MOBILE_TOUCH_CONTROLS : DEFAULT_TOUCH_CONTROLS}
              minPolarAngle={0} 
              maxPolarAngle={Math.PI / 2 - 0.05} 
              enableRotate={true}
              enablePan={true}
              enableDamping={true}
              dampingFactor={0.08}
            />
          </Canvas>
          </>
        )}
        {angleAnimating && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'auto', background: 'transparent' }} />
        )}
      </div>

      {/* Inline status popup near selected plot */}
      {selectedPlot && (() => {
        const spBounds = getPlotBounds(selectedPlot);
        const spArea = formatMetricValue(selectedPlot.area || (spBounds.width * spBounds.height * (layout?.meta?.pixelToFt || 1) ** 2), "sq.ft");
        const spDims = `${formatMetricValue(spBounds.width * (layout?.meta?.pixelToFt || 1))}×${formatMetricValue(spBounds.height * (layout?.meta?.pixelToFt || 1))} ft`;
        return (
        <div style={{
          position: 'absolute',
          top: 80, right: 20,
          zIndex: 20,
          background: 'rgba(20, 20, 20, 0.88)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: '16px 18px',
          width: 220,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          animation: 'fadeInScale 0.3s ease-out',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', fontFamily: "'Outfit','Inter',sans-serif" }}>Plot {selectedPlot.plotNo || "-"}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 2 }}>{spArea} • {spDims}</div>
            </div>
            <button onClick={() => setSelectedPlot(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATUS_OPTIONS.map((status) => {
              const isActive = selectedPlot.status === status;
              const palette = getStatusStyle(status);
              return (
                <button
                  key={status}
                  onClick={() => updateStatus(selectedPlot, status)}
                  disabled={isUpdating || isActive}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10,
                    border: `1.5px solid ${palette.text}`,
                    background: isActive ? palette.text : 'transparent',
                    color: isActive ? '#fff' : palette.text,
                    fontSize: '0.72rem', fontWeight: 700, cursor: isActive ? 'default' : 'pointer',
                    opacity: isUpdating && !isActive ? 0.5 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
          {isUpdating && <div style={{ color: '#2dd4bf', fontSize: '0.75rem', marginTop: 8, fontWeight: 600 }}>Saving...</div>}
          {!isUpdating && updateNotice && (
            <div style={{ color: updateTone === 'error' ? '#fb7185' : '#4ade80', fontSize: '0.75rem', marginTop: 8, fontWeight: 600 }}>{updateNotice}</div>
          )}
        </div>
        );
      })()}

      {/* Gallery Modal */}
      {showGallery && (
        <div className="builder-layout-view__gallery-overlay" onClick={() => setShowGallery(false)}>
          <div className="builder-layout-view__gallery-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: 'var(--text)', fontSize: '1.4rem' }}>Gallery</h2>
              <button onClick={() => setShowGallery(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)' }}>&times;</button>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginBottom: 16 }}>
              {galleryUploading ? 'Uploading...' : '+ Upload Images'}
              <input type="file" multiple accept="image/*" onChange={handleGalleryUpload} style={{ display: 'none' }} disabled={galleryUploading} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
              {(galleryImages || []).map((img, index) => (
                <div key={index} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', aspectRatio: '1' }}>
                  <img src={resolveServerUrl(img)} alt={`Gallery ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={() => handleGalleryDelete(index)}
                    style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: '50%', background: 'rgba(220,38,38,0.9)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    &times;
                  </button>
                </div>
              ))}
              {(!galleryImages || galleryImages.length === 0) && (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>No images yet. Upload some!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map View Modal */}
      {showMap && layout && (
        <MapReadOnlyView layout={layout} onClose={() => setShowMap(false)} />
      )}
    </div>
  );
};



export default BuilderLayoutView;
