import React, { startTransition, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text,
  Group,
  Circle,
} from "react-konva";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import PlotShape from "../shared/PlotShape";
import { detectPlotsFromImage } from "../../utils/autoDetectPlots";
import {
  getPlotBounds,
  getPlotCenter,
  getPlotPoints,
  hasPolygonPoints,
} from "../../utils/plotGeometry";
import {
  getTouchAngle,
  getTouchCenter,
  getTouchDistance,
  normalizeAngle,
  normalizeAngleDelta,
} from "../../utils/gestureUtils";
import {
  getLayoutStatusFill,
  LAYOUT_MAP_COLORS,
  LAYOUT_MAP_FONT_FAMILY,
} from "../../theme/layoutMapTheme";

const MIN_SCALE = 0.45;
const MAX_SCALE = 4;
const POPUP_MARGIN = 12;
const POPUP_ESTIMATED_HEIGHT = 420;
const MIN_HANDLE_RADIUS = 6;
const MAX_HANDLE_RADIUS = 18;

const getAnalysisErrorMessage = (error, fallbackMessage = "Automatic plot analysis failed.") => (
  error?.response?.data?.message
  || error?.message
  || fallbackMessage
);

const getShapeCounts = (plots, meta) => {
  const polygonPlots = Number.isFinite(meta?.polygonPlots)
    ? meta.polygonPlots
    : plots.filter((plot) => hasPolygonPoints(plot)).length;
  const rectanglePlots = Number.isFinite(meta?.rectanglePlots)
    ? meta.rectanglePlots
    : Math.max(plots.length - polygonPlots, 0);

  return { rectanglePlots, polygonPlots };
};

const formatAnalysisMessage = (plots, meta, usedFallback = false, serverMessage = "") => {
  const { rectanglePlots, polygonPlots } = getShapeCounts(plots, meta);

  if (usedFallback) {
    const prefix = serverMessage
      ? `${serverMessage} Browser fallback found`
      : "Browser fallback found";

    return `${prefix} ${plots.length} plots. ${rectanglePlots} rectangles and ${polygonPlots} polygons need review.`;
  }

  return `${plots.length} plots detected. ${rectanglePlots} rectangles and ${polygonPlots} polygons were classified automatically.`;
};

const getPlotShapeLabel = (plot) => {
  if (!hasPolygonPoints(plot)) {
    return "Rectangle";
  }

  const vertexCount = getPlotPoints(plot).length / 2;

  if (vertexCount === 4) {
    return "Quadrilateral";
  }

  return `${vertexCount}-point polygon`;
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
const roundCoordinate = (value) => Number(value.toFixed(2));

const getRectangleVertices = (plot) => {
  const bounds = getPlotBounds(plot);

  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
};

const getShapeVertices = (plot) => {
  if (!hasPolygonPoints(plot)) {
    return getRectangleVertices(plot);
  }

  const points = getPlotPoints(plot);
  const vertices = [];

  for (let index = 0; index < points.length; index += 2) {
    vertices.push({
      x: points[index],
      y: points[index + 1],
    });
  }

  return vertices;
};

const flattenVertices = (vertices) =>
  vertices.flatMap((vertex) => [roundCoordinate(vertex.x), roundCoordinate(vertex.y)]);

const getVerticesBounds = (vertices) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  vertices.forEach((vertex) => {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
  });

  return {
    x: roundCoordinate(minX),
    y: roundCoordinate(minY),
    width: roundCoordinate(maxX - minX),
    height: roundCoordinate(maxY - minY),
  };
};

const buildPolygonPlotFromVertices = (plot, vertices) => {
  const bounds = getVerticesBounds(vertices);
  const points = flattenVertices(vertices);
  const center = getPlotCenter({ points });

  return {
    ...plot,
    ...bounds,
    points,
    centerX: roundCoordinate(center.x),
    centerY: roundCoordinate(center.y),
  };
};

const buildRectanglePlotFromVertices = (plot, vertices) => {
  const bounds = getVerticesBounds(vertices);

  return {
    ...plot,
    ...bounds,
    points: [],
    centerX: roundCoordinate(bounds.x + bounds.width / 2),
    centerY: roundCoordinate(bounds.y + bounds.height / 2),
  };
};

const resizeRectangleFromHandle = (plot, handleIndex, nextVertex) => {
  const vertices = getRectangleVertices(plot);
  const oppositeIndex = (handleIndex + 2) % 4;
  const oppositeVertex = vertices[oppositeIndex];

  return buildRectanglePlotFromVertices(plot, [
    oppositeVertex,
    nextVertex,
  ]);
};

const getUpdatedPlotForVertexDrag = (plot, vertexIndex, nextVertex) => {
  if (hasPolygonPoints(plot)) {
    const nextVertices = getShapeVertices(plot).map((vertex, index) => (
      index === vertexIndex ? nextVertex : vertex
    ));

    return buildPolygonPlotFromVertices(plot, nextVertices);
  }

  return resizeRectangleFromHandle(plot, vertexIndex, nextVertex);
};

const convertPlotToQuadrilateral = (plot) => buildPolygonPlotFromVertices(plot, getRectangleVertices(plot));

const convertPlotToRectangle = (plot) => buildRectanglePlotFromVertices(plot, getRectangleVertices(plot));

const rotatePoint = (point, center, angle) => {
  if (!angle) {
    return point;
  }

  const radians = (angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = point.x - center.x;
  const deltaY = point.y - center.y;

  return {
    x: center.x + deltaX * cosine - deltaY * sine,
    y: center.y + deltaX * sine + deltaY * cosine,
  };
};

const getPlotScreenBounds = ({
  plot,
  image,
  scale,
  rotation,
  position,
}) => {
  const imageCenter = {
    x: image.width / 2,
    y: image.height / 2,
  };
  const vertices = getShapeVertices(plot);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  vertices.forEach((vertex) => {
    const rotatedVertex = rotatePoint(vertex, imageCenter, rotation);
    const screenX = position.x + rotatedVertex.x * scale;
    const screenY = position.y + rotatedVertex.y * scale;

    minX = Math.min(minX, screenX);
    minY = Math.min(minY, screenY);
    maxX = Math.max(maxX, screenX);
    maxY = Math.max(maxY, screenY);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
};

const getPopupPosition = ({
  plot,
  image,
  scale,
  rotation,
  position,
  canvasWidth,
  canvasHeight,
}) => {
  if (!plot || !image) {
    return null;
  }

  const popupWidth = Math.min(
    canvasWidth - POPUP_MARGIN * 2,
    canvasWidth < 560 ? 182 : 196
  );
  const plotScreenBounds = getPlotScreenBounds({
    plot,
    image,
    scale,
    rotation,
    position,
  });
  const shouldDockLeft = plotScreenBounds.centerX > canvasWidth / 2;

  let left = shouldDockLeft
    ? POPUP_MARGIN
    : canvasWidth - popupWidth - POPUP_MARGIN;
  let top = plotScreenBounds.centerY - POPUP_ESTIMATED_HEIGHT / 2;

  left = clampValue(
    left,
    POPUP_MARGIN,
    Math.max(POPUP_MARGIN, canvasWidth - popupWidth - POPUP_MARGIN)
  );

  // If the popup would go below the canvas, flip it above the plot center
  if (top + POPUP_ESTIMATED_HEIGHT > canvasHeight - POPUP_MARGIN) {
    top = plotScreenBounds.centerY - POPUP_ESTIMATED_HEIGHT - 20;
  }

  top = clampValue(
    top,
    POPUP_MARGIN,
    Math.max(POPUP_MARGIN, canvasHeight - POPUP_ESTIMATED_HEIGHT - POPUP_MARGIN)
  );

  return {
    left,
    top,
    width: popupWidth,
  };
};

const detectPlotsForEditor = async ({ imageUrl, image }) => {
  try {
    const response = await API.post("/analyze-layout", { imageUrl });

    return {
      plots: Array.isArray(response.data?.plots) ? response.data.plots : [],
      meta: response.data?.meta || null,
      boundary: response.data?.boundary || null,
      usedFallback: false,
      serverMessage: "",
    };
  } catch (serverError) {
    const serverMessage = getAnalysisErrorMessage(serverError, "Server contour analysis failed.");

    try {
      const fallbackResult = await detectPlotsFromImage(image);

      return {
        plots: Array.isArray(fallbackResult?.plots) ? fallbackResult.plots : [],
        meta: null,
        boundary: null,
        usedFallback: true,
        serverMessage,
      };
    } catch (fallbackError) {
      const fallbackMessage = getAnalysisErrorMessage(fallbackError, "Browser fallback failed.");
      throw new Error(`${serverMessage} ${fallbackMessage}`.trim());
    }
  }
};

const AutoPlotEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: layoutId } = useParams();
  const imageUrl = location.state?.imageUrl;
  const initialLayoutName = location.state?.layoutName || "";

  const stageRef = useRef(null);
  const groupRef = useRef(null);
  const gestureRef = useRef(null);
  const analysisRef = useRef(0);
  const dragFrameRef = useRef(null);
  const dragPreviewRef = useRef(null);
  const finishHandleEditRef = useRef(null);

  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [layoutName, setLayoutName] = useState(initialLayoutName);
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rectangles, setRectangles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeHandleIndex, setActiveHandleIndex] = useState(null);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  const [dragPreviewPlot, setDragPreviewPlot] = useState(null);
  const [analysisMode, setAnalysisMode] = useState("Server contour analysis");
  const [analysisMessage, setAnalysisMessage] = useState("Upload a layout image to start automatic mapping.");
  const [analysisError, setAnalysisError] = useState("");
  const [meta, setMeta] = useState(null);
  const [boundary, setBoundary] = useState(null);
  const [isEditMode, setIsEditMode] = useState(!!layoutId);

  const canvasWidth = Math.max(320, viewport.width - 48);
  const canvasHeight = Math.max(420, viewport.height - 260);

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (layoutId) {
      // Edit mode: fetch existing layout
      const fetchLayout = async () => {
        try {
          setIsAnalyzing(true);
          setAnalysisMessage("Loading existing layout...");
          const res = await API.get(`/layout/${layoutId}`);
          const layout = res.data;
          setLayoutName(layout.name || "");
          
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            setImage(img);
            
            // Format plots for editor
            const formattedPlots = layout.plots.map(p => ({
              ...p,
              id: p._id || p.id,
            }));
            
            // Add boundary as a plot
            const boundaryPoints = layout.boundary || [0, 0, img.width, 0, img.width, img.height, 0, img.height];
            const boundCenter = getPlotCenter({ points: boundaryPoints });
            const boundaryPlot = {
              id: "boundary_plot",
              isBoundary: true,
              plotNo: "Boundary",
              points: boundaryPoints,
              x: 0, y: 0,
              width: img.width, height: img.height,
              centerX: boundCenter.x, centerY: boundCenter.y,
              status: "Available"
            };
            
            setRectangles([boundaryPlot, ...formattedPlots]);
            setMeta(layout.meta || { analysisWidth: img.width, analysisHeight: img.height });
            setAnalysisMessage(`Loaded ${formattedPlots.length} plots for editing.`);
            setIsAnalyzing(false);
          };
          img.onerror = () => {
            setAnalysisError("Failed to load layout image.");
            setIsAnalyzing(false);
          };
          img.src = resolveServerUrl(layout.imageUrl);
        } catch (err) {
          setAnalysisError("Failed to fetch layout: " + (err.response?.data?.message || err.message));
          setIsAnalyzing(false);
        }
      };
      fetchLayout();
      return;
    }

    if (!imageUrl) {
      navigate("/uploadimage");
      return;
    }

    setImage(null);
    setRectangles([]);
    setSelectedId(null);
    setAnalysisError("");
    setAnalysisMode("Server contour analysis");
    setAnalysisMessage("Loading the layout image...");

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setAnalysisMessage("Layout image loaded. Starting precise contour analysis...");
    };
    img.onerror = () => {
      setAnalysisError("The uploaded image could not be loaded for automatic analysis.");
      setAnalysisMessage("");
    };
    img.src = resolveServerUrl(imageUrl);
  }, [imageUrl, layoutId, navigate]);

  useEffect(() => {
    setActiveHandleIndex(null);
    setDragPreviewPlot(null);
    dragPreviewRef.current = null;

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, [selectedId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedId || isAnalyzing) {
        return;
      }

      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName?.toLowerCase();
      const isTypingInField = ["input", "textarea", "select"].includes(activeTag)
        || activeElement?.isContentEditable;

      if (isTypingInField) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setRectangles((previousPlots) => {
          const activeIndex = previousPlots.findIndex((plot) => plot.id === selectedId);

          if (activeIndex === -1 || selectedId === "boundary_plot") {
            return previousPlots;
          }

          const nextPlots = previousPlots.filter((plot) => plot.id !== selectedId);
          const nextSelectedPlot = nextPlots[Math.min(activeIndex, nextPlots.length - 1)] || null;

          setSelectedId(nextSelectedPlot?.id || null);
          setAnalysisError("");
          setAnalysisMessage(
            nextPlots.length
              ? `${nextPlots.length} plots remain after removing the selected detection.`
              : "All detected plots were removed. Re-analyze the layout to detect plots again."
          );

          return nextPlots;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedId, isAnalyzing]);

  useEffect(() => {
    if (activeHandleIndex === null) {
      return undefined;
    }

    const finishPointerEdit = () => {
      finishHandleEditRef.current?.();
    };

    window.addEventListener("mouseup", finishPointerEdit);
    window.addEventListener("touchend", finishPointerEdit, { passive: false });
    window.addEventListener("touchcancel", finishPointerEdit, { passive: false });

    return () => {
      window.removeEventListener("mouseup", finishPointerEdit);
      window.removeEventListener("touchend", finishPointerEdit);
      window.removeEventListener("touchcancel", finishPointerEdit);
    };
  }, [activeHandleIndex]);

  useEffect(() => {
    if (!image) {
      return;
    }

    const padding = 120;
    const nextScale = clampScale(
      Math.min((canvasWidth - padding) / image.width, (canvasHeight - padding) / image.height)
    );

    setScale(nextScale);
    setPosition({
      x: (canvasWidth - image.width * nextScale) / 2,
      y: (canvasHeight - image.height * nextScale) / 2,
    });
  }, [image, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!image || isEditMode) {
      return;
    }

    const currentRun = analysisRef.current + 1;
    analysisRef.current = currentRun;
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisMode("Server contour analysis");
    setAnalysisMessage("Running precise server-side contour analysis...");
    setSelectedId(null);

    const analyzeLayout = async () => {
      try {
        const result = await detectPlotsForEditor({ imageUrl, image });

        if (analysisRef.current !== currentRun) {
          return;
        }

        setAnalysisMode(result.usedFallback ? "Browser fallback" : "Server contour analysis");

        startTransition(() => {
          const fallbackBounds = [0, 0, image.width, 0, image.width, image.height, 0, image.height];
          const initialBoundary = result.boundary && result.boundary.length > 0 ? result.boundary : fallbackBounds;
          const boundCenter = getPlotCenter({ points: initialBoundary });
          const boundaryPlot = {
            id: "boundary_plot",
            isBoundary: true,
            plotNo: "Boundary",
            points: initialBoundary,
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
            centerX: boundCenter.x,
            centerY: boundCenter.y,
            status: "Available"
          };

          setRectangles([boundaryPlot, ...result.plots]);
          setMeta(result.meta);
          setSelectedId(result.plots[0]?.id || boundaryPlot.id);
        });

        if (result.plots.length) {
          setAnalysisMessage(
            `${formatAnalysisMessage(
              result.plots,
              result.meta,
              result.usedFallback,
              result.serverMessage
            )} Click any plot to review details.`
          );
        } else {
          setAnalysisMessage("");
          setAnalysisError(
            result.usedFallback
              ? "Neither the server analyzer nor the browser fallback could find any plots in this image."
              : "No plots were detected by the server analyzer. Try re-analyzing or upload a cleaner layout image."
          );
        }
      } catch (error) {
        console.error(error);
        if (analysisRef.current === currentRun) {
          setAnalysisMessage("");
          setAnalysisMode("Server contour analysis");
          setAnalysisError(getAnalysisErrorMessage(error));
        }
      } finally {
        if (analysisRef.current === currentRun) {
          setIsAnalyzing(false);
        }
      }
    };

    analyzeLayout();
  }, [image, imageUrl, isEditMode]);

  const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const fitToScreen = (img = image) => {
    if (!img) {
      return;
    }

    const padding = 120;
    const nextScale = clampScale(
      Math.min((canvasWidth - padding) / img.width, (canvasHeight - padding) / img.height)
    );

    setScale(nextScale);
    setPosition({
      x: (canvasWidth - img.width * nextScale) / 2,
      y: (canvasHeight - img.height * nextScale) / 2,
    });
  };

  const runAutoDetection = async (sourceImage = image) => {
    if (!sourceImage || !imageUrl) {
      return;
    }

    const currentRun = analysisRef.current + 1;
    analysisRef.current = currentRun;
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisMode("Server contour analysis");
    setAnalysisMessage("Running precise server-side contour analysis...");
    setSelectedId(null);

    try {
      const result = await detectPlotsForEditor({ imageUrl, image: sourceImage });

      if (analysisRef.current !== currentRun) {
        return;
      }

      setAnalysisMode(result.usedFallback ? "Browser fallback" : "Server contour analysis");

      startTransition(() => {
        const fallbackBounds = [0, 0, image.width, 0, image.width, image.height, 0, image.height];
        const initialBoundary = result.boundary && result.boundary.length > 0 ? result.boundary : fallbackBounds;
        const boundCenter = getPlotCenter({ points: initialBoundary });
        const boundaryPlot = {
          id: "boundary_plot",
          isBoundary: true,
          plotNo: "Boundary",
          points: initialBoundary,
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
          centerX: boundCenter.x,
          centerY: boundCenter.y,
          status: "Available"
        };

        setRectangles([boundaryPlot, ...result.plots]);
        setMeta(result.meta);
        setSelectedId(result.plots[0]?.id || boundaryPlot.id);
      });

      if (result.plots.length) {
        setAnalysisMessage(
          `${formatAnalysisMessage(
            result.plots,
            result.meta,
            result.usedFallback,
            result.serverMessage
          )} Click any plot to review details.`
        );
      } else {
        setAnalysisMessage("");
        setAnalysisError(
          result.usedFallback
            ? "Neither the server analyzer nor the browser fallback could find any plots in this image."
            : "No plots were detected by the server analyzer. Try re-analyzing or upload a cleaner layout image."
        );
      }
    } catch (error) {
      console.error(error);
      if (analysisRef.current === currentRun) {
        setAnalysisMessage("");
        setAnalysisMode("Server contour analysis");
        setAnalysisError(getAnalysisErrorMessage(error));
      }
    } finally {
      if (analysisRef.current === currentRun) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleAddPolygon = () => {
    const pointsStr = window.prompt("Enter number of polygon points (e.g. 5 for pentagon, 20 for custom curve edge):", "5");
    const numPoints = parseInt(pointsStr, 10);
    if (isNaN(numPoints) || numPoints < 3) return;

    // Viewport center relative to the image
    const inverseTransform = groupRef.current?.getAbsoluteTransform().copy().invert();
    let cx = image ? image.width / 2 : 0;
    let cy = image ? image.height / 2 : 0;
    
    if (inverseTransform) {
      const p = inverseTransform.point({ x: viewport.width / 2, y: viewport.height / 2 });
      cx = p.x;
      cy = p.y;
    }

    const radius = 100; // default radius
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        const angle = (i * 2 * Math.PI) / numPoints - Math.PI / 2;
        points.push(cx + radius * Math.cos(angle));
        points.push(cy + radius * Math.sin(angle));
    }

    const newPlot = {
        id: `plot_${Date.now()}`,
        plotNo: `${rectangles.length}`,
        points,
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
        centerX: cx,
        centerY: cy,
        status: "Available",
        category: "Standard",
        area: 0,
    };

    setRectangles(prev => [...prev, newPlot]);
    setSelectedId(newPlot.id);
  };

  const getPointerInPlotSpace = () => {
    const stage = stageRef.current;
    const group = groupRef.current;
    const pointer = stage?.getPointerPosition();

    if (!stage || !group || !pointer) {
      return null;
    }

    const inverseTransform = group.getAbsoluteTransform().copy().invert();
    const localPoint = inverseTransform.point(pointer);

    return {
      x: roundCoordinate(localPoint.x),
      y: roundCoordinate(localPoint.y),
    };
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();

    if (activeHandleIndex !== null || isCanvasLocked) {
      return;
    }

    const stage = stageRef.current;
    const oldScale = stage?.scaleX() || scale;
    const pointer = stage?.getPointerPosition();

    if (!pointer) {
      return;
    }

    if (e.evt.altKey) {
      setRotation((prev) => normalizeAngle(prev + (e.evt.deltaY > 0 ? 6 : -6)));
      return;
    }

    const scaleBy = 1.08;
    const nextScale = clampScale(e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy);
    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };

    setScale(nextScale);
    setPosition({
      x: pointer.x - mousePointTo.x * nextScale,
      y: pointer.y - mousePointTo.y * nextScale,
    });
  };

  const handleStageDragEnd = (event) => {
    setPosition({ x: event.target.x(), y: event.target.y() });
  };

  const handleStageDragMove = (event) => {
    setPosition({ x: event.target.x(), y: event.target.y() });
  };

  const handleTouchStart = (e) => {
    if (activeHandleIndex !== null) {
      e.evt.preventDefault();
      return;
    }

    const touches = e.evt.touches;

    if (touches.length !== 2) {
      gestureRef.current = null;
      setIsGestureActive(false);
      return;
    }

    e.evt.preventDefault();
    setIsGestureActive(true);
    gestureRef.current = {
      startDistance: getTouchDistance(touches[0], touches[1]),
      startCenter: getTouchCenter(touches[0], touches[1]),
      startScale: scale,
      startRotation: rotation,
      startPosition: position,
      lastAngle: getTouchAngle(touches[0], touches[1]),
      accumulatedRotation: 0,
    };
  };

  const handleTouchMove = (e) => {
    if (activeHandleIndex !== null) {
      e.evt.preventDefault();
      const nextPointer = getPointerInPlotSpace();

      if (nextPointer) {
        handleVertexDragMove(activeHandleIndex, nextPointer);
      }

      return;
    }

    const touches = e.evt.touches;
    const gesture = gestureRef.current;

    if (!gesture || touches.length !== 2) {
      return;
    }

    e.evt.preventDefault();

    const nextDistance = getTouchDistance(touches[0], touches[1]);
    const nextAngle = getTouchAngle(touches[0], touches[1]);
    const nextCenter = getTouchCenter(touches[0], touches[1]);
    const nextScale = clampScale(
      gesture.startScale * (nextDistance / gesture.startDistance)
    );
    const angleDelta = normalizeAngleDelta(nextAngle - gesture.lastAngle);

    gesture.lastAngle = nextAngle;
    gesture.accumulatedRotation += angleDelta;

    setScale(nextScale);
    setRotation(normalizeAngle(gesture.startRotation + gesture.accumulatedRotation));
    setPosition({
      x: gesture.startPosition.x + (nextCenter.x - gesture.startCenter.x),
      y: gesture.startPosition.y + (nextCenter.y - gesture.startCenter.y),
    });
  };

  const handleTouchEnd = () => {
    if (activeHandleIndex !== null) {
      handleStagePointerUp();
      return;
    }

    gestureRef.current = null;
    setIsGestureActive(false);
  };

  const handleInputChange = (field, value) => {
    setRectangles((prev) =>
      prev.map((rect) => {
        if (rect.id !== selectedId) {
          return rect;
        }

        const updatedRect = { ...rect, [field]: value };
        const widthValue = parseFloat(updatedRect.plotWidth);
        const heightValue = parseFloat(updatedRect.plotHeight);

        updatedRect.area = !Number.isNaN(widthValue) && !Number.isNaN(heightValue)
          ? Number((widthValue * heightValue).toFixed(2))
          : 0;

        return updatedRect;
      })
    );
  };

  const updateSelectedPlot = (updater) => {
    if (!selectedId) {
      return;
    }

    setRectangles((prev) =>
      prev.map((plot) => (plot.id === selectedId ? updater(plot) : plot))
    );
  };

  const scheduleDragPreview = (nextPlot) => {
    dragPreviewRef.current = nextPlot;

    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDragPreviewPlot(dragPreviewRef.current);
    });
  };

  const handleConvertSelectedToQuadrilateral = () => {
    if (!selectedRect || hasPolygonPoints(selectedRect)) {
      return;
    }

    updateSelectedPlot((plot) => convertPlotToQuadrilateral(plot));
  };

  const handleConvertSelectedToRectangle = () => {
    if (!selectedRect || !hasPolygonPoints(selectedRect)) {
      return;
    }

    updateSelectedPlot((plot) => convertPlotToRectangle(plot));
  };

  const handleVertexDragMove = (vertexIndex, nextVertex) => {
    if (!nextVertex) {
      return;
    }

    const basePlot = dragPreviewRef.current?.id === selectedId
      ? dragPreviewRef.current
      : selectedRect;

    if (!basePlot) {
      return;
    }

    scheduleDragPreview(getUpdatedPlotForVertexDrag(basePlot, vertexIndex, nextVertex));
  };

  const handleVertexDragStart = (vertexIndex, event) => {
    if (event) {
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
    }
    setActiveHandleIndex(vertexIndex);
    setIsCanvasLocked(true); // Auto-lock canvas while dragging vertex
    dragPreviewRef.current = selectedRect || null;
    setDragPreviewPlot(selectedRect || null);
  };

  const handleVertexDragEnd = (vertexIndex, nextVertex) => {
    const basePlot = dragPreviewRef.current?.id === selectedId
      ? dragPreviewRef.current
      : selectedRect;

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    if (basePlot) {
      const committedPlot = getUpdatedPlotForVertexDrag(
        basePlot,
        vertexIndex,
        nextVertex || getPointerInPlotSpace() || getShapeVertices(basePlot)[vertexIndex]
      );

      updateSelectedPlot(() => committedPlot);
    }

    dragPreviewRef.current = null;
    setDragPreviewPlot(null);
    setActiveHandleIndex(null);
  };

  function handleStagePointerMove(event) {
    if (activeHandleIndex === null) {
      return;
    }

    event?.evt?.preventDefault?.();

    const nextPointer = getPointerInPlotSpace();

    if (nextPointer) {
      handleVertexDragMove(activeHandleIndex, nextPointer);
    }
  }

  function handleStagePointerUp() {
    if (activeHandleIndex === null) {
      return;
    }

    handleVertexDragEnd(activeHandleIndex, getPointerInPlotSpace());
  }

  const handleShapeDragEnd = (plotId, deltaX, deltaY) => {
    setRectangles(prev => prev.map(plot => {
      if (plot.id !== plotId) return plot;
      
      const newPlot = { ...plot };
      if (hasPolygonPoints(plot)) {
        newPlot.points = plot.points.map((val, idx) => val + (idx % 2 === 0 ? deltaX : deltaY));
      }
      
      newPlot.x += deltaX;
      newPlot.y += deltaY;
      newPlot.centerX += deltaX;
      newPlot.centerY += deltaY;
      
      return newPlot;
    }));
  };

  finishHandleEditRef.current = handleStagePointerUp;

  const handleDeleteSelectedPlot = () => {
    if (!selectedRect || selectedRect.id === "boundary_plot") {
      return;
    }

    const activeIndex = rectangles.findIndex((rect) => rect.id === selectedRect.id);
    const nextPlots = rectangles.filter((rect) => rect.id !== selectedRect.id);
    const nextSelectedPlot = nextPlots[Math.min(activeIndex, nextPlots.length - 1)] || null;

    setRectangles(nextPlots);
    setSelectedId(nextSelectedPlot?.id || null);
    setAnalysisError("");
    setAnalysisMessage(
      nextPlots.length
        ? `${nextPlots.length} plots remain after removing the mistaken detection.`
        : "All detected plots were removed. Re-analyze the layout to detect plots again."
    );
  };

  const handleSubmit = async () => {
    if (!layoutName.trim()) {
      alert("Enter a layout name");
      return;
    }

    if (!imageUrl && !image) {
      alert("Upload a layout image first");
      return;
    }

    if (!rectangles.length) {
      alert("No plots were detected yet. Re-run the analyzer or upload a clearer image.");
      return;
    }

    try {
      setIsSaving(true);
      const finalMeta = meta || { analysisWidth: image.width, analysisHeight: image.height };
      
      const boundaryRect = rectangles.find(r => r.id === "boundary_plot");
      const boundaryToSave = boundaryRect ? boundaryRect.points : [];
      const plotsToSave = rectangles.filter(r => r.id !== "boundary_plot").map(p => {
        const { id, isBoundary, ...rest } = p;
        return rest;
      });

      const payload = {
        name: layoutName.trim(),
        imageUrl: imageUrl || image.src,
        plots: plotsToSave,
        boundary: boundaryToSave,
        meta: finalMeta,
      };

      if (isEditMode) {
        await API.put(`/layouts/${layoutId}`, payload);
        alert("Layout updated successfully");
        navigate(`/builder`);
      } else {
        const res = await API.post("/upload-layout", payload);
        navigate(`/layout/${res.data.layoutId}/3d-editor`);
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to finalize layout");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const persistedSelectedRect = rectangles.find((rect) => rect.id === selectedId);
  const selectedRect = dragPreviewPlot?.id === selectedId
    ? dragPreviewPlot
    : persistedSelectedRect;
  const selectedShapeVertices = selectedRect ? getShapeVertices(selectedRect) : [];
  const imageCenterX = image ? image.width / 2 : 0;
  const imageCenterY = image ? image.height / 2 : 0;
  const popupPosition = selectedRect
    ? getPopupPosition({
        plot: selectedRect,
        image,
        scale,
        rotation,
        position,
        canvasWidth,
        canvasHeight,
      })
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Auto Plot Analyzer</h1>
          <p style={styles.subtitle}>
            PlotViewer now scans the uploaded layout automatically, turns enclosed regions into plots,
            and lets you review each detected result before saving.
          </p>
        </div>

        <div style={styles.actions}>
          <input
            type="text"
            placeholder="Layout name"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            style={styles.layoutNameInput}
          />
          <button style={styles.controlBtn} onClick={() => fitToScreen()}>
            Fit to Screen
          </button>
          {!isEditMode && (
          <button
            style={styles.controlBtn}
            onClick={() => runAutoDetection()}
            disabled={!image || isAnalyzing}
          >
            {isAnalyzing ? "Analyzing..." : "Re-analyze Layout"}
          </button>
          )}
          <button 
            style={{...styles.controlBtn, background: isCanvasLocked ? '#fee2e2' : '#f1f5f9', color: isCanvasLocked ? '#b91c1c' : '#475569', border: isCanvasLocked ? '1px solid #fca5a5' : '1px solid #cbd5e1'}} 
            onClick={() => setIsCanvasLocked(!isCanvasLocked)}
          >
             {isCanvasLocked ? '🔓 Canvas Locked' : '🔒 Lock Canvas (For Editing)'}
          </button>
          <button 
            style={{...styles.controlBtn, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'}} 
            onClick={handleAddPolygon}
          >
             + Add Custom Polygon
          </button>
          <button
            style={styles.saveBtnTop}
            onClick={handleSubmit}
            disabled={isSaving || isAnalyzing || !rectangles.length}
          >
            {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Save Layout"}
          </button>
        </div>
      </div>

      <div style={styles.statusRow}>
        <div style={styles.statusCard}>
          <span style={styles.statusLabel}>Detected Plots</span>
          <strong style={styles.statusValue}>{rectangles.length}</strong>
        </div>
        <div style={styles.statusCard}>
          <span style={styles.statusLabel}>Mode</span>
          <strong style={styles.statusValue}>{isAnalyzing ? `Running ${analysisMode}` : analysisMode}</strong>
        </div>
        <div style={styles.messageCard}>
          <strong style={analysisError ? styles.errorText : styles.messageText}>
            {analysisError || analysisMessage}
          </strong>
        </div>
      </div>

      <div style={styles.canvasWrapper}>
        {!image ? (
          <div style={styles.placeholderState}>
            <h2 style={styles.placeholderTitle}>Preparing layout</h2>
            <p style={styles.placeholderCopy}>The uploaded image is loading so PlotViewer can analyze it.</p>
          </div>
        ) : (
          <>
            <Stage
              width={canvasWidth}
              height={canvasHeight}
              scaleX={scale}
              scaleY={scale}
              x={position.x}
              y={position.y}
              draggable={activeHandleIndex === null && !isCanvasLocked && selectedId === null}
              onDragMove={handleStageDragMove}
              onDragEnd={handleStageDragEnd}
              onWheel={handleWheel}
              onMouseMove={handleStagePointerMove}
              onMouseUp={handleStagePointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              ref={stageRef}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) {
                  setSelectedId(null);
                }
              }}
            >
              <Layer>
                <Group
                  ref={groupRef}
                  x={imageCenterX}
                  y={imageCenterY}
                  offsetX={imageCenterX}
                  offsetY={imageCenterY}
                  rotation={rotation}
                >
                  <KonvaImage image={image} />

                  {rectangles.map((rect) => (
                    <PlotAnnotation
                      key={rect.id}
                      plot={rect.id === selectedId && selectedRect ? selectedRect : rect}
                      isSelected={selectedId === rect.id}
                      onSelect={() => setSelectedId(rect.id)}
                      onShapeDragEnd={(deltaX, deltaY) => handleShapeDragEnd(rect.id, deltaX, deltaY)}
                    />
                  ))}

                  {selectedRect && !isAnalyzing && (
                    <ShapeEditHandles
                      plot={selectedRect}
                      vertices={selectedShapeVertices}
                      scale={scale}
                      activeHandleIndex={activeHandleIndex}
                      onVertexDragStart={handleVertexDragStart}
                    />
                  )}
                </Group>
              </Layer>
            </Stage>

            {isAnalyzing && (
              <div style={styles.analysisOverlay}>
                <div style={styles.analysisOverlayCard}>
                  <strong style={styles.overlayTitle}>Scanning layout image</strong>
                  <span style={styles.overlayCopy}>Finding enclosed plot boundaries and generating the overlays automatically.</span>
                </div>
              </div>
            )}

            {selectedRect && popupPosition && !isAnalyzing && (
              <PlotEditPopup
                plot={selectedRect}
                popupPosition={popupPosition}
                onInputChange={handleInputChange}
                onDelete={handleDeleteSelectedPlot}
                onConvertToQuadrilateral={handleConvertSelectedToQuadrilateral}
                onConvertToRectangle={handleConvertSelectedToRectangle}
                onClose={() => setSelectedId(null)}
              />
            )}
          </>
        )}
      </div>

      <div style={styles.detailsGrid}>
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>How it works</h2>
          <p style={styles.panelText}>
            The analyzer looks for enclosed regions in the uploaded layout, converts each match into a tappable plot shape,
            numbers them automatically, and keeps them ready for builder assignment and customer viewing.
          </p>
          <p style={styles.panelText}>
            Use two fingers on touch, or hold Alt while using the mouse wheel, to rotate the layout if you need to inspect it from a different angle.
          </p>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>Selected Plot</h2>
          {!selectedRect ? (
            <p style={styles.panelText}>
              Click any detected plot to open its editor popup near the block. You can update plot info there or delete a wrong detection.
            </p>
          ) : (
            <div style={styles.formStack}>
              <div style={styles.plotTag}>Detected plot #{selectedRect.plotNo}</div>
              <p style={styles.panelTextCompact}>
                The popup stays attached near this plot while you pan, zoom, or rotate the layout. Drag the visible handles directly on the block to correct the shape in real time.
              </p>
              <div style={styles.metaRow}>
                <span style={styles.metaBadge}>Area: {selectedRect.area} sq.ft</span>
                <span style={styles.metaBadge}>
                  Shape: {getPlotShapeLabel(selectedRect)}
                </span>
                <span style={styles.metaBadge}>
                  Box: {Math.round(selectedRect.width)} x {Math.round(selectedRect.height)} px
                </span>
              </div>
              <div style={styles.inlineActions}>
                {selectedRect.id !== "boundary_plot" && !hasPolygonPoints(selectedRect) ? (
                  <button
                    type="button"
                    style={styles.shapeBtn}
                    onClick={handleConvertSelectedToQuadrilateral}
                  >
                    Convert To Quadrilateral
                  </button>
                ) : selectedRect.id !== "boundary_plot" ? (
                  <button
                    type="button"
                    style={styles.shapeBtn}
                    onClick={handleConvertSelectedToRectangle}
                  >
                    Reset To Rectangle
                  </button>
                ) : null}
                {selectedRect.id !== "boundary_plot" && (
                  <button
                    type="button"
                    style={styles.deleteBtn}
                    onClick={handleDeleteSelectedPlot}
                  >
                    Delete Mistaken Plot
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const PlotAnnotation = ({ plot, isSelected, onSelect, onShapeDragEnd }) => {
  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);
  const labelWidth = Math.max(bounds.width, 48);

  const handleDragStart = (e) => {
    e.target.moveToTop();
  };

  const handleDragEnd = (e) => {
    const isPolygon = hasPolygonPoints(plot);
    const origX = isPolygon ? 0 : bounds.x;
    const origY = isPolygon ? 0 : bounds.y;
    
    const deltaX = e.target.x() - origX;
    const deltaY = e.target.y() - origY;
    
    // Reset Konva state immediately to prevent visual drift before React re-renders
    e.target.x(origX);
    e.target.y(origY);

    if (deltaX !== 0 || deltaY !== 0) {
      onShapeDragEnd(deltaX, deltaY);
    }
  };

  return (
    <React.Fragment>
      <PlotShape
        plot={plot}
        fill={plot.id === "boundary_plot" ? (isSelected ? "rgba(103, 103, 103, 0.18)" : "rgba(103, 103, 103, 0.08)") : getPlotFill(plot.status)}
        stroke={plot.id === "boundary_plot" ? LAYOUT_MAP_COLORS.compoundWall : (isSelected ? LAYOUT_MAP_COLORS.selectedPlot : LAYOUT_MAP_COLORS.plotNumber)}
        strokeWidth={isSelected || plot.id === "boundary_plot" ? 3 : 2}
        dash={plot.id === "boundary_plot" && !isSelected ? [15, 15] : []}
        draggable={isSelected && plot.id !== "boundary_plot"}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={onSelect}
        onTap={onSelect}
      />

      <Text
        x={center.x - labelWidth / 2}
        y={center.y - 8}
        width={labelWidth}
        align="center"
        text={`#${plot.plotNo || "-"}`}
        fontSize={12}
        fontStyle="bold"
        fontFamily={LAYOUT_MAP_FONT_FAMILY}
        fill={LAYOUT_MAP_COLORS.plotNumber}
        listening={false}
      />
    </React.Fragment>
  );
};

const ShapeEditHandles = ({
  plot,
  vertices,
  scale,
  activeHandleIndex,
  onVertexDragStart,
}) => {
  const handleRadius = clampValue(10 / Math.max(scale, 0.001), MIN_HANDLE_RADIUS, MAX_HANDLE_RADIUS);
  const haloRadius = handleRadius * 1.6;
  const strokeWidth = Math.max(1.2, 2.4 / Math.max(scale, 0.001));

  return (
    <React.Fragment>
      <PlotShape
        plot={plot}
        fill="rgba(14, 165, 233, 0.08)"
        stroke="#0f766e"
        strokeWidth={2.5}
        dash={[10, 6]}
        listening={false}
      />

      {vertices.map((vertex, index) => {
        const isActive = activeHandleIndex === index;

        return (
          <React.Fragment key={`${plot.id}-handle-${index}`}>
            <Circle
              x={vertex.x}
              y={vertex.y}
              radius={haloRadius}
              fill={isActive ? "rgba(20, 184, 166, 0.24)" : "rgba(191, 219, 254, 0.26)"}
              stroke="transparent"
              onMouseDown={(event) => onVertexDragStart(index, event)}
              onTouchStart={(event) => onVertexDragStart(index, event)}
            />
            <Circle
              x={vertex.x}
              y={vertex.y}
              radius={handleRadius}
              fill="#ffffff"
              stroke={isActive ? "#0f766e" : "#2563eb"}
              strokeWidth={strokeWidth}
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
};

const PlotEditPopup = ({
  plot,
  popupPosition,
  onInputChange,
  onDelete,
  onConvertToQuadrilateral,
  onConvertToRectangle,
  onClose,
}) => {
  // Smart positioning: if popup would overflow bottom, position it above
  const popupMaxH = 340;
  const effectiveTop = popupPosition.top;
  
  return (
  <div
    style={{
      ...styles.plotPopup,
      left: popupPosition.left,
      top: effectiveTop,
      width: popupPosition.width,
      maxHeight: popupMaxH,
      overflowY: 'auto',
    }}
  >
    <div style={styles.plotPopupHeader}>
        <div style={styles.plotPopupTag}>
           #{plot.id === "boundary_plot" ? "Boundary" : plot.plotNo || "Plot"}
        </div>
        <button type="button" style={styles.popupCloseBtn} onClick={onClose} aria-label="Close plot editor">
          x
        </button>
      </div>
  
      <div style={styles.formStackCompact}>
        {plot.id === "boundary_plot" ? (
          <div style={styles.popupHint}>
            Adjust the handles of this polygon to precisely trace the exterior boundary of the entire layout. This will define the edges of your 3D world.
          </div>
        ) : (
          <>
            <label style={styles.fieldLabelCompact}>
              No
              <input
                placeholder="Plot"
                value={plot.plotNo}
                onChange={(e) => onInputChange("plotNo", e.target.value)}
                style={styles.inputCompact}
              />
            </label>

      <div style={styles.fieldRowCompact}>
        <label style={styles.fieldLabelCompact}>
          W
          <input
            placeholder="Width"
            value={plot.plotWidth}
            onChange={(e) => onInputChange("plotWidth", e.target.value)}
            style={styles.inputCompact}
          />
        </label>
        <label style={styles.fieldLabelCompact}>
          H
          <input
            placeholder="Height"
            value={plot.plotHeight}
            onChange={(e) => onInputChange("plotHeight", e.target.value)}
            style={styles.inputCompact}
          />
        </label>
      </div>

      <label style={styles.fieldLabelCompact}>
        Status
        <select
          value={plot.status}
          onChange={(e) => onInputChange("status", e.target.value)}
          style={styles.inputCompact}
        >
          <option value="Available">Available</option>
          <option value="Reserved">Reserved</option>
          <option value="Sold">Sold</option>
        </select>
      </label>

      <label style={styles.fieldLabelCompact}>
        Category
        <select
          value={plot.category || "Standard"}
          onChange={(e) => onInputChange("category", e.target.value)}
          style={styles.inputCompact}
        >
          <option value="Standard">Standard</option>
          <option value="Premium">Premium</option>
          <option value="Diamond">Diamond</option>
        </select>
      </label>

      <label style={styles.fieldLabelCompact}>
        Rate (₹)
        <input
          type="number"
          placeholder="Rate"
          value={plot.rate || ""}
          onChange={(e) => onInputChange("rate", e.target.value ? Number(e.target.value) : 0)}
          style={styles.inputCompact}
        />
      </label>

      {hasPolygonPoints(plot) && (
        <label style={{...styles.fieldLabelCompact, flexDirection: 'row', alignItems: 'center', cursor: 'pointer', marginTop: '6px' }}>
          <input
            type="checkbox"
            checked={plot.isCurved || false}
            onChange={(e) => onInputChange("isCurved", e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Enable Smooth Curve
        </label>
      )}

        <div style={styles.popupHint}>
          {hasPolygonPoints(plot) ? "Drag blue handles" : "Drag corner handles"}
        </div>
  
        <div style={styles.popupActionsCompact}>
          {!hasPolygonPoints(plot) ? (
            <button type="button" style={styles.shapeBtnCompact} onClick={onConvertToQuadrilateral}>
              Quad
            </button>
          ) : (
            <button type="button" style={styles.shapeBtnCompact} onClick={onConvertToRectangle}>
              Rect
            </button>
          )}
          <button type="button" style={styles.deleteBtn} onClick={onDelete}>
            Delete
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

const getPlotFill = (status) => getLayoutStatusFill(status, 0.5);

export default AutoPlotEditor;

const styles = {
  container: {
    background: "#f8fafc",
    minHeight: "100vh",
    padding: "24px 24px 80px 24px", // More bottom padding to prevent cropping
    fontFamily: '"Segoe UI", sans-serif',
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    margin: 0,
    color: "#0f172a",
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    marginTop: "8px",
    maxWidth: "760px",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  layoutNameInput: {
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    minWidth: "240px",
  },
  controlBtn: {
    background: "#e0f2fe",
    color: "#075985",
    padding: "10px 14px",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
  },
  saveBtnTop: {
    background: "#2563eb",
    color: "#fff",
    padding: "10px 16px",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
  },
  statusRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "18px",
  },
  statusCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "16px 18px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  statusLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    fontWeight: "700",
  },
  statusValue: {
    fontSize: "20px",
    color: "#0f172a",
  },
  messageCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "16px 18px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    display: "flex",
    alignItems: "center",
  },
  messageText: {
    color: "#0f766e",
    lineHeight: 1.5,
  },
  errorText: {
    color: "#b91c1c",
    lineHeight: 1.5,
  },
  canvasWrapper: {
    marginTop: "20px",
    borderRadius: "20px",
    overflow: "visible",
    background: "#ffffff",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.08)",
    border: "1px solid #e5e7eb",
    position: "relative",
    minHeight: "420px",
  },
  placeholderState: {
    minHeight: "420px",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: "32px",
  },
  placeholderTitle: {
    margin: 0,
    color: "#0f172a",
  },
  placeholderCopy: {
    marginTop: "10px",
    color: "#64748b",
    maxWidth: "420px",
  },
  analysisOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(248, 250, 252, 0.76)",
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  analysisOverlayCard: {
    background: "#ffffff",
    borderRadius: "18px",
    border: "1px solid #dbeafe",
    boxShadow: "0 20px 40px rgba(37, 99, 235, 0.12)",
    padding: "18px 22px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "360px",
    textAlign: "center",
  },
  overlayTitle: {
    color: "#1d4ed8",
  },
  overlayCopy: {
    color: "#475569",
    lineHeight: 1.5,
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "18px",
    marginTop: "20px",
    marginBottom: "40px", // Extra bottom margin for the grid
  },
  panel: {
    background: "#ffffff",
    borderRadius: "18px",
    border: "1px solid #e2e8f0",
    padding: "20px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
  panelTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: "18px",
  },
  panelText: {
    margin: "12px 0 0",
    color: "#64748b",
    lineHeight: 1.6,
  },
  panelTextCompact: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.6,
  },
  formStack: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "14px",
  },
  formStackCompact: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "10px",
  },
  plotTag: {
    display: "inline-flex",
    alignSelf: "flex-start",
    background: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: "999px",
    padding: "6px 12px",
    fontWeight: "700",
    fontSize: "13px",
  },
  fieldRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "600",
  },
  fieldLabelCompact: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    color: "#475569",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    color: "#0f172a",
    background: "#ffffff",
  },
  inputCompact: {
    padding: "8px 10px",
    borderRadius: "9px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    color: "#0f172a",
    background: "#ffffff",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  inlineActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  popupActions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  popupActionsCompact: {
    display: "flex",
    gap: "8px",
    justifyContent: "space-between",
  },
  shapeBtn: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    padding: "10px 14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  shapeBtnCompact: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "9px",
    padding: "8px 10px",
    fontWeight: "700",
    cursor: "pointer",
    minWidth: "58px",
  },
  deleteBtn: {
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "9px",
    padding: "8px 10px",
    fontWeight: "700",
    cursor: "pointer",
  },
  plotPopup: {
    position: "absolute",
    zIndex: 3,
    background: "rgba(255, 255, 255, 0.97)",
    border: "1px solid #dbeafe",
    borderRadius: "14px",
    boxShadow: "0 18px 28px rgba(15, 23, 42, 0.16)",
    padding: "12px",
    backdropFilter: "blur(8px)",
    maxHeight: "calc(100% - 24px)",
    overflowY: "auto",
  },
  plotPopupHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "8px",
    alignItems: "center",
  },
  plotPopupTag: {
    display: "inline-flex",
    alignItems: "center",
    background: "#dbeafe",
    color: "#1d4ed8",
    borderRadius: "999px",
    padding: "4px 10px",
    fontWeight: "700",
    fontSize: "12px",
  },
  popupCloseBtn: {
    background: "#f8fafc",
    color: "#64748b",
    border: "1px solid #e2e8f0",
    borderRadius: "999px",
    width: "30px",
    height: "30px",
    fontWeight: "700",
    cursor: "pointer",
    padding: 0,
  },
  popupHint: {
    color: "#64748b",
    fontSize: "11px",
    lineHeight: 1.4,
  },
  fieldRowCompact: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },
  metaBadge: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "999px",
    padding: "7px 12px",
    fontSize: "13px",
    color: "#475569",
  },
};
