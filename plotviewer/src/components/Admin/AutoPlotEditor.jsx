import React, { startTransition, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text,
  Group,
  Circle,
  Line,
} from "react-konva";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import PlotShape from "../shared/PlotShape";
import { detectPlotsFromImage } from "../../utils/autoDetectPlots";
import {
  getCurveEdgeIndexes,
  getCurveEdgeFactors,
  getPlotBounds,
  getPlotCenter,
  getPlotPoints,
  QUARTER_CIRCLE_CURVE_FACTOR,
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
const MIN_HANDLE_RADIUS = 4;
const MAX_HANDLE_RADIUS = 10;
const PLOT_DRAG_THRESHOLD = 6;
const FEET_TO_METERS = 0.3048;
const DEFAULT_PLOT_STATUS = "Available";
const DEFAULT_PLOT_CATEGORY = "Standard";
const DEFAULT_NON_PLOT_COLOR = LAYOUT_MAP_COLORS.nonPlotBlock || "#86efac";
const NON_PLOT_COLOR_SWATCHES = [
  "#dcfce7",
  "#bbf7d0",
  DEFAULT_NON_PLOT_COLOR,
  "#4ade80",
  "#22c55e",
  "#15803d",
  "#65a30d",
  "#4d7c0f",
  "#16a34a",
  "#2f855a",
  "#14532d",
  "#a7f3d0",
  "#2dd4bf",
  "#0f766e",
  "#38bdf8",
  "#60a5fa",
  "#facc15",
  "#fb923c",
  "#fda4af",
  "#c084fc",
  "#94a3b8",
];

const getAnalysisErrorMessage = (error, fallbackMessage = "Automatic plot analysis failed.") => (
  error?.response?.data?.message
  || error?.message
  || fallbackMessage
);

const getShapeCounts = (plots, meta) => {
  const hasShapeTypes = plots.some((plot) => typeof plot?.shapeType === "string");
  const polygonPlots = Number.isFinite(meta?.polygonPlots)
    ? meta.polygonPlots
    : hasShapeTypes
      ? plots.filter((plot) => plot?.shapeType !== "rectangle").length
      : plots.filter((plot) => hasPolygonPoints(plot)).length;
  const rectanglePlots = Number.isFinite(meta?.rectanglePlots)
    ? meta.rectanglePlots
    : hasShapeTypes
      ? plots.filter((plot) => plot?.shapeType === "rectangle").length
      : Math.max(plots.length - polygonPlots, 0);

  return { rectanglePlots, polygonPlots };
};

const createEditorPlotId = () => `plot_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const normalizeEditorPlot = (plot, index = 0) => ({
  ...plot,
  id: plot?.id || plot?._id || `${createEditorPlotId()}_${index}`,
  status: plot?.status || DEFAULT_PLOT_STATUS,
  category: plot?.category || DEFAULT_PLOT_CATEGORY,
  rate: Number.isFinite(Number(plot?.rate)) ? Number(plot.rate) : 0,
  area: Number.isFinite(Number(plot?.area)) ? Number(plot.area) : 0,
  curveEdges: Array.isArray(plot?.curveEdges) ? plot.curveEdges : [],
  curveFactors: plot?.curveFactors || {},
  edgeLengthsMeters: getPlotPoints(plot).length >= 6
    ? omitCurvedEdgeLengths(
      getSanitizedEdgeLengths(plot?.edgeLengthsMeters, getPlotPoints(plot).length / 2),
      getSanitizedCurveEdges(plot?.curveEdges, getPlotPoints(plot).length / 2)
    )
    : {},
  isCurved: Boolean(plot?.isCurved),
  isPlot: plot?.isPlot !== false,
  blockColor: typeof plot?.blockColor === "string" && plot.blockColor
    ? plot.blockColor
    : DEFAULT_NON_PLOT_COLOR,
});

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
  if (plot?.shapeType === "rectangle") {
    return "Rectangle";
  }

  if (plot?.shapeType === "quadrilateral") {
    return "Quadrilateral";
  }

  if (!hasPolygonPoints(plot)) {
    return "Rectangle";
  }

  const vertexCount = getPlotPoints(plot).length / 2;
  const curvedEdgeCount = getCurveEdgeIndexes(plot).length;
  const curvedEdgeLabel = curvedEdgeCount
    ? `, ${curvedEdgeCount} curved edge${curvedEdgeCount === 1 ? "" : "s"}`
    : "";

  if (vertexCount === 4) {
    return `Quadrilateral${curvedEdgeLabel}`;
  }

  return `${vertexCount}-point polygon${curvedEdgeLabel}`;
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));
const roundCoordinate = (value) => Number(value.toFixed(2));
const formatFeetValueAsMeters = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const meterValue = numericValue * FEET_TO_METERS;

  return Math.abs(meterValue - Math.round(meterValue)) < 0.01
    ? String(Math.round(meterValue))
    : meterValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const parseMeterInputToFeet = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const feetValue = numericValue / FEET_TO_METERS;

  return Math.abs(feetValue - Math.round(feetValue)) < 0.01
    ? String(Math.round(feetValue))
    : feetValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const getVertexLabel = (vertexIndex) => {
  let nextIndex = vertexIndex;
  let label = "";

  do {
    label = String.fromCharCode(65 + (nextIndex % 26)) + label;
    nextIndex = Math.floor(nextIndex / 26) - 1;
  } while (nextIndex >= 0);

  return label;
};

const getEdgeLabel = (edgeIndex, vertexCount) => (
  `${getVertexLabel(edgeIndex)}-${getVertexLabel((edgeIndex + 1) % vertexCount)}`
);

const getDistanceBetweenPoints = (firstPoint, secondPoint) => {
  if (!firstPoint || !secondPoint) {
    return 0;
  }

  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
};

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

const getSanitizedCurveEdges = (curveEdges, vertexCount) => [...new Set(
  (Array.isArray(curveEdges) ? curveEdges : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < vertexCount)
)].sort((firstValue, secondValue) => firstValue - secondValue);

const parseCurveEdgeInput = (value, vertexCount) => {
  if (!value?.trim()) {
    return [];
  }

  return getSanitizedCurveEdges(
    value
      .split(",")
      .map((token) => Number.parseInt(token.trim(), 10) - 1),
    vertexCount
  );
};

const formatCurveEdgeInput = (curveEdges) => (
  getSanitizedCurveEdges(curveEdges, Number.POSITIVE_INFINITY).map((value) => value + 1).join(", ")
);

const getSanitizedEdgeLengths = (edgeLengths, vertexCount) => {
  const lengthSource = edgeLengths instanceof Map
    ? Object.fromEntries(edgeLengths.entries())
    : edgeLengths && typeof edgeLengths === "object"
      ? edgeLengths
      : {};

  return Object.entries(lengthSource).reduce((nextLengths, [key, value]) => {
    const edgeIndex = Number(key);
    const numericValue = Number(value);

    if (
      !Number.isInteger(edgeIndex)
      || edgeIndex < 0
      || edgeIndex >= vertexCount
      || !Number.isFinite(numericValue)
      || numericValue <= 0
    ) {
      return nextLengths;
    }

    nextLengths[edgeIndex] = Number(numericValue.toFixed(2));
    return nextLengths;
  }, {});
};

const omitCurvedEdgeLengths = (edgeLengths, curveEdges) => {
  if (!edgeLengths || !Object.keys(edgeLengths).length) {
    return edgeLengths || {};
  }

  const curvedEdgeSet = new Set(curveEdges);

  return Object.entries(edgeLengths).reduce((nextLengths, [key, value]) => {
    const edgeIndex = Number(key);

    if (curvedEdgeSet.has(edgeIndex)) {
      return nextLengths;
    }

    nextLengths[edgeIndex] = value;
    return nextLengths;
  }, {});
};

const getSanitizedCurveFactors = (curveFactors, validCurveEdges) => {
  const factorSource = curveFactors instanceof Map
    ? Object.fromEntries(curveFactors.entries())
    : curveFactors && typeof curveFactors === "object"
      ? curveFactors
      : {};
  const validEdgeSet = new Set(validCurveEdges);

  return Object.entries(factorSource).reduce((nextFactors, [key, value]) => {
    const edgeIndex = Number(key);
    const numericValue = Number(value);

    if (!validEdgeSet.has(edgeIndex) || !Number.isFinite(numericValue) || numericValue <= 0) {
      return nextFactors;
    }

    nextFactors[edgeIndex] = numericValue;
    return nextFactors;
  }, {});
};

const createPolygonVertices = ({ pointCount, centerX, centerY, radius }) => {
  if (pointCount === 4) {
    return [
      { x: centerX - radius, y: centerY - radius * 0.7 },
      { x: centerX + radius, y: centerY - radius * 0.7 },
      { x: centerX + radius, y: centerY + radius * 0.7 },
      { x: centerX - radius, y: centerY + radius * 0.7 },
    ];
  }

  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index * 2 * Math.PI) / pointCount - Math.PI / 2;

    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
};

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
  const curveEdges = getSanitizedCurveEdges(plot?.curveEdges, vertices.length);
  const curveFactors = getSanitizedCurveFactors(plot?.curveFactors, curveEdges);
  const edgeLengthsMeters = omitCurvedEdgeLengths(
    getSanitizedEdgeLengths(plot?.edgeLengthsMeters, vertices.length),
    curveEdges
  );

  return {
    ...plot,
    ...bounds,
    points,
    curveEdges,
    curveFactors,
    edgeLengthsMeters,
    isCurved: curveEdges.length > 0,
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
    curveEdges: [],
    curveFactors: {},
    edgeLengthsMeters: {},
    isCurved: false,
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

const translatePlot = (plot, deltaX, deltaY) => {
  const nextPlot = { ...plot };

  if (hasPolygonPoints(plot)) {
    nextPlot.points = plot.points.map((value, index) => roundCoordinate(
      value + (index % 2 === 0 ? deltaX : deltaY)
    ));
  }

  nextPlot.x = roundCoordinate((plot.x || 0) + deltaX);
  nextPlot.y = roundCoordinate((plot.y || 0) + deltaY);
  nextPlot.centerX = roundCoordinate((plot.centerX || 0) + deltaX);
  nextPlot.centerY = roundCoordinate((plot.centerY || 0) + deltaY);

  return nextPlot;
};

const centerPlotAtPoint = (plot, targetPoint) => {
  if (!targetPoint) {
    return plot;
  }

  const plotCenter = getPlotCenter(plot);

  return translatePlot(
    plot,
    targetPoint.x - plotCenter.x,
    targetPoint.y - plotCenter.y
  );
};

const createClipboardPlotSnapshot = (plot) => {
  const vertexCount = hasPolygonPoints(plot) ? getShapeVertices(plot).length : 0;
  const curveEdges = getSanitizedCurveEdges(plot?.curveEdges, vertexCount);

  return {
    ...plot,
    points: Array.isArray(plot?.points) ? [...plot.points] : [],
    curveEdges,
    curveFactors: getSanitizedCurveFactors(plot?.curveFactors, curveEdges),
    edgeLengthsMeters: vertexCount >= 3
      ? getSanitizedEdgeLengths(plot?.edgeLengthsMeters, vertexCount)
      : {},
  };
};

const createPastedPlotFromClipboard = (clipboardPlot, index, targetCenter) => {
  const { _id, ...clipboardWithoutMongoId } = clipboardPlot || {};
  const duplicatedPlot = normalizeEditorPlot({
    ...clipboardWithoutMongoId,
    id: createEditorPlotId(),
    points: Array.isArray(clipboardWithoutMongoId?.points) ? [...clipboardWithoutMongoId.points] : [],
    curveEdges: Array.isArray(clipboardWithoutMongoId?.curveEdges) ? [...clipboardWithoutMongoId.curveEdges] : [],
    curveFactors: clipboardWithoutMongoId?.curveFactors ? { ...clipboardWithoutMongoId.curveFactors } : {},
    edgeLengthsMeters: clipboardWithoutMongoId?.edgeLengthsMeters ? { ...clipboardWithoutMongoId.edgeLengthsMeters } : {},
  }, index);

  return centerPlotAtPoint(duplicatedPlot, targetCenter);
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
  const plotDragSessionRef = useRef(null);
  const pointerCleanupRef = useRef(null);
  const clipboardRef = useRef(null);

  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 720,
  });
  const [selectedId, setSelectedId] = useState(null);
  const [layoutName, setLayoutName] = useState(initialLayoutName);
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [, setIsGestureActive] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rectangles, setRectangles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlotDragging, setIsPlotDragging] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [activeHandleIndex, setActiveHandleIndex] = useState(null);
  const [dragPreviewPlot, setDragPreviewPlot] = useState(null);
  const [analysisMode, setAnalysisMode] = useState("Server contour analysis");
  const [analysisMessage, setAnalysisMessage] = useState("Upload a layout image to start automatic mapping.");
  const [analysisError, setAnalysisError] = useState("");
  const [meta, setMeta] = useState(null);
  const isEditMode = !!layoutId;

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

    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
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
            const formattedPlots = layout.plots.map((plot, index) => normalizeEditorPlot(plot, index));
            
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
    setIsPlotDragging(false);
    dragPreviewRef.current = null;
    plotDragSessionRef.current = null;
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, [selectedId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName?.toLowerCase();
      const isTypingInField = ["input", "textarea", "select"].includes(activeTag)
        || activeElement?.isContentEditable;

      if (isTypingInField) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !isAnalyzing) {
        const shortcutKey = event.key.toLowerCase();
        const selectedPlotForShortcut = rectangles.find((plot) => plot.id === selectedId);

        if (shortcutKey === "x" || shortcutKey === "c") {
          event.preventDefault();

          if (!selectedPlotForShortcut || selectedPlotForShortcut.id === "boundary_plot") {
            setAnalysisError("");
            setAnalysisMessage("Select a plot or block before copying. The layout boundary cannot be copied.");
            return;
          }

          clipboardRef.current = createClipboardPlotSnapshot(selectedPlotForShortcut);
          setAnalysisError("");
          setAnalysisMessage("Shape copied. Press Ctrl+V to paste it into the center with the same side dimensions.");
          return;
        }

        if (shortcutKey === "v") {
          event.preventDefault();

          if (!clipboardRef.current) {
            setAnalysisError("");
            setAnalysisMessage("Copy a shape first, then press Ctrl+V to paste it.");
            return;
          }

          const pastedPlot = createPastedPlotFromClipboard(
            clipboardRef.current,
            rectangles.length,
            getCanvasCenterInPlotSpace()
          );

          setRectangles((previousPlots) => [...previousPlots, pastedPlot]);
          setSelectedId(pastedPlot.id);
          setAnalysisError("");
          setAnalysisMessage("Shape pasted into the center. Saved side dimensions were copied too.");
          return;
        }
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsSpacePanning(true);
        return;
      }

      if (!selectedId || isAnalyzing) {
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

    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    };

    const clearPanShortcut = () => {
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPanShortcut);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPanShortcut);
    };
  }, [selectedId, isAnalyzing, rectangles, image, canvasWidth, canvasHeight]);

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

          const normalizedPlots = result.plots.map((plot, index) => normalizeEditorPlot(plot, index));
          setRectangles([boundaryPlot, ...normalizedPlots]);
          setMeta(result.meta);
          setSelectedId(normalizedPlots[0]?.id || boundaryPlot.id);
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

  const applyScaleAtPoint = (nextScale, point) => {
    const safeScale = clampScale(nextScale);
    const anchor = point || { x: canvasWidth / 2, y: canvasHeight / 2 };
    const oldScale = scale;

    if (Math.abs(safeScale - oldScale) < 0.0001) {
      return;
    }

    const plotPoint = {
      x: (anchor.x - position.x) / oldScale,
      y: (anchor.y - position.y) / oldScale,
    };

    setScale(safeScale);
    setPosition({
      x: anchor.x - plotPoint.x * safeScale,
      y: anchor.y - plotPoint.y * safeScale,
    });
  };

  const zoomBy = (factor) => {
    applyScaleAtPoint(scale * factor);
  };

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

        const normalizedPlots = result.plots.map((plot, index) => normalizeEditorPlot(plot, index));
        setRectangles([boundaryPlot, ...normalizedPlots]);
        setMeta(result.meta);
        setSelectedId(normalizedPlots[0]?.id || boundaryPlot.id);
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
      const p = inverseTransform.point({ x: canvasWidth / 2, y: canvasHeight / 2 });
      cx = p.x;
      cy = p.y;
    }

    const radius = 100;
    const vertices = createPolygonVertices({
      pointCount: numPoints,
      centerX: cx,
      centerY: cy,
      radius,
    });
    const points = flattenVertices(vertices);

    const newPlot = normalizeEditorPlot({
        id: createEditorPlotId(),
        plotNo: `${rectangles.length}`,
        points,
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
        centerX: cx,
        centerY: cy,
        status: DEFAULT_PLOT_STATUS,
        category: DEFAULT_PLOT_CATEGORY,
        area: 0,
        curveEdges: [],
        curveFactors: {},
        isCurved: false,
        isPlot: true,
        blockColor: DEFAULT_NON_PLOT_COLOR,
    });

    setRectangles(prev => [...prev, newPlot]);
    setSelectedId(newPlot.id);
  };

  const handleAddCurvedPolygon = () => {
    const pointsStr = window.prompt(
      "Enter number of polygon points. Use 3 for a quarter-circle starter, or 4+ when you want more straight edges around the curve:",
      "3"
    );
    const numPoints = parseInt(pointsStr, 10);

    if (isNaN(numPoints) || numPoints < 3) {
      return;
    }

    const curveEdgeInput = window.prompt(
      "Enter curved edge numbers separated by commas. Edge 1 means the side from point 1 to point 2:",
      "1"
    );

    if (curveEdgeInput === null) {
      return;
    }

    const inverseTransform = groupRef.current?.getAbsoluteTransform().copy().invert();
    let cx = image ? image.width / 2 : 0;
    let cy = image ? image.height / 2 : 0;

    if (inverseTransform) {
      const nextPoint = inverseTransform.point({ x: canvasWidth / 2, y: canvasHeight / 2 });
      cx = nextPoint.x;
      cy = nextPoint.y;
    }

    const radius = 100;
    const vertices = createPolygonVertices({
      pointCount: numPoints,
      centerX: cx,
      centerY: cy,
      radius,
    });
    const curveEdges = parseCurveEdgeInput(curveEdgeInput, vertices.length);
    const draftPlot = buildPolygonPlotFromVertices({
      id: createEditorPlotId(),
      plotNo: `${rectangles.length}`,
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
      centerX: cx,
      centerY: cy,
      status: DEFAULT_PLOT_STATUS,
      category: DEFAULT_PLOT_CATEGORY,
      area: 0,
      curveEdges,
      curveFactors: {},
      isCurved: curveEdges.length > 0,
      isPlot: true,
      blockColor: DEFAULT_NON_PLOT_COLOR,
    }, vertices);
    const curveFactors = curveEdges.reduce((nextFactors, edgeIndex) => {
      nextFactors[edgeIndex] = QUARTER_CIRCLE_CURVE_FACTOR;
      return nextFactors;
    }, {});
    const newPlot = normalizeEditorPlot({
      ...draftPlot,
      curveFactors,
    });

    setRectangles((prev) => [...prev, newPlot]);
    setSelectedId(newPlot.id);
    setAnalysisMessage(
      curveEdges.length
        ? `Curved polygon added with quarter-circle edges. Active curved edge${curveEdges.length === 1 ? "" : "s"}: ${formatCurveEdgeInput(curveEdges)}.`
        : "Polygon added. Select it and turn on curved edges in the inspector when you are ready."
    );
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

  const getCanvasCenterInPlotSpace = () => {
    const group = groupRef.current;

    if (!group) {
      return {
        x: roundCoordinate(image ? image.width / 2 : 0),
        y: roundCoordinate(image ? image.height / 2 : 0),
      };
    }

    const inverseTransform = group.getAbsoluteTransform().copy().invert();
    const localPoint = inverseTransform.point({ x: canvasWidth / 2, y: canvasHeight / 2 });

    return {
      x: roundCoordinate(localPoint.x),
      y: roundCoordinate(localPoint.y),
    };
  };

  const syncStagePointerPosition = (nativeEvent) => {
    const stage = stageRef.current;

    if (!stage || !nativeEvent) {
      return;
    }

    stage.setPointersPositions(nativeEvent);
  };

  const removeGlobalPointerListeners = () => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
  };

  const attachGlobalPointerListeners = () => {
    removeGlobalPointerListeners();
    const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

    const handleWindowPointerMove = (nativeEvent) => {
      syncStagePointerPosition(nativeEvent);
      handleStagePointerMove({ evt: nativeEvent });
    };

    const handleWindowPointerUp = (nativeEvent) => {
      syncStagePointerPosition(nativeEvent);
      handleStagePointerUp();
    };

    const handleWindowBlur = () => {
      handleStagePointerUp();
    };

    if (supportsPointerEvents) {
      window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
      window.addEventListener("pointerup", handleWindowPointerUp, { passive: false });
      window.addEventListener("pointercancel", handleWindowPointerUp, { passive: false });
    } else {
      window.addEventListener("mousemove", handleWindowPointerMove, { passive: false });
      window.addEventListener("mouseup", handleWindowPointerUp, { passive: false });
      window.addEventListener("touchmove", handleWindowPointerMove, { passive: false });
      window.addEventListener("touchend", handleWindowPointerUp, { passive: false });
      window.addEventListener("touchcancel", handleWindowPointerUp, { passive: false });
    }

    window.addEventListener("blur", handleWindowBlur);

    pointerCleanupRef.current = () => {
      if (supportsPointerEvents) {
        window.removeEventListener("pointermove", handleWindowPointerMove);
        window.removeEventListener("pointerup", handleWindowPointerUp);
        window.removeEventListener("pointercancel", handleWindowPointerUp);
      } else {
        window.removeEventListener("mousemove", handleWindowPointerMove);
        window.removeEventListener("mouseup", handleWindowPointerUp);
        window.removeEventListener("touchmove", handleWindowPointerMove);
        window.removeEventListener("touchend", handleWindowPointerUp);
        window.removeEventListener("touchcancel", handleWindowPointerUp);
      }

      window.removeEventListener("blur", handleWindowBlur);
    };
  };

  const handleWheel = (e) => {
    if (activeHandleIndex !== null || isPlotDragging) {
      return;
    }

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (!pointer) {
      return;
    }

    if (e.evt.altKey) {
      e.evt.preventDefault();
      setRotation((prev) => normalizeAngle(prev + (e.evt.deltaY > 0 ? 6 : -6)));
      return;
    }

    if (!(e.evt.ctrlKey || e.evt.metaKey)) {
      return;
    }

    e.evt.preventDefault();
    applyScaleAtPoint(scale * (e.evt.deltaY > 0 ? 1 / 1.08 : 1.08), pointer);
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

    if (plotDragSessionRef.current) {
      const touches = e.evt.touches;

      if (touches.length === 1) {
        handlePlotDragMove(e);
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
    if (activeHandleIndex !== null || plotDragSessionRef.current) {
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

        if (field === "isPlot" && value === false && !updatedRect.blockColor) {
          updatedRect.blockColor = DEFAULT_NON_PLOT_COLOR;
        }

        if (!hasPolygonPoints(updatedRect) && (field === "plotWidth" || field === "plotHeight")) {
          const widthValue = parseFloat(updatedRect.plotWidth);
          const heightValue = parseFloat(updatedRect.plotHeight);

          updatedRect.area = !Number.isNaN(widthValue) && !Number.isNaN(heightValue)
            ? Number((widthValue * heightValue).toFixed(2))
            : 0;
        }

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

  const handleToggleCurveEdge = (edgeIndex) => {
    if (!selectedRect || !hasPolygonPoints(selectedRect)) {
      return;
    }

    updateSelectedPlot((plot) => {
      const vertexCount = getShapeVertices(plot).length;
      const currentCurveEdges = getSanitizedCurveEdges(plot.curveEdges, vertexCount);
      const currentCurveFactors = getSanitizedCurveFactors(plot.curveFactors, currentCurveEdges);
      const nextCurveEdges = currentCurveEdges.includes(edgeIndex)
        ? currentCurveEdges.filter((value) => value !== edgeIndex)
        : [...currentCurveEdges, edgeIndex];
      const sanitizedCurveEdges = getSanitizedCurveEdges(nextCurveEdges, vertexCount);
      const nextCurveFactors = getSanitizedCurveFactors(currentCurveFactors, sanitizedCurveEdges);

      if (!currentCurveEdges.includes(edgeIndex)) {
        nextCurveFactors[edgeIndex] = QUARTER_CIRCLE_CURVE_FACTOR;
      }

      const nextEdgeLengths = omitCurvedEdgeLengths(
        getSanitizedEdgeLengths(plot.edgeLengthsMeters, vertexCount),
        sanitizedCurveEdges
      );

      return {
        ...plot,
        curveEdges: sanitizedCurveEdges,
        curveFactors: nextCurveFactors,
        edgeLengthsMeters: nextEdgeLengths,
        isCurved: sanitizedCurveEdges.length > 0,
      };
    });
  };

  const handleCurveFactorChange = (edgeIndex, nextFactor) => {
    if (!selectedRect || !hasPolygonPoints(selectedRect)) {
      return;
    }

    updateSelectedPlot((plot) => {
      const currentCurveEdges = getSanitizedCurveEdges(plot.curveEdges, getShapeVertices(plot).length);
      const currentCurveFactors = getSanitizedCurveFactors(plot.curveFactors, currentCurveEdges);
      const parsedFactor = Number(nextFactor);

      if (!currentCurveEdges.includes(edgeIndex) || !Number.isFinite(parsedFactor)) {
        return plot;
      }

      return {
        ...plot,
        curveFactors: {
          ...currentCurveFactors,
          [edgeIndex]: parsedFactor,
        },
      };
    });
  };

  const handlePolygonEdgeLengthChange = (edgeIndex, nextValue) => {
    if (!selectedRect || !hasPolygonPoints(selectedRect)) {
      return;
    }

    updateSelectedPlot((plot) => {
      const vertexCount = getShapeVertices(plot).length;
      const nextEdgeLengths = getSanitizedEdgeLengths(plot.edgeLengthsMeters, vertexCount);

      if (nextValue === "") {
        delete nextEdgeLengths[edgeIndex];
      } else {
        const parsedLength = Number(nextValue);

        if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
          return plot;
        }

        nextEdgeLengths[edgeIndex] = Number(parsedLength.toFixed(2));
      }

      return {
        ...plot,
        edgeLengthsMeters: nextEdgeLengths,
      };
    });
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
    attachGlobalPointerListeners();
    setActiveHandleIndex(vertexIndex);
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
    removeGlobalPointerListeners();
  };

  const handlePlotDragMove = (event) => {
    const dragSession = plotDragSessionRef.current;

    if (!dragSession) {
      return;
    }

    event?.evt?.preventDefault?.();

    const nextPointer = getPointerInPlotSpace();

    if (!nextPointer) {
      return;
    }

    const dragDistance = getDistanceBetweenPoints(dragSession.pointerStart, nextPointer);
    const hasExceededThreshold = dragSession.hasExceededThreshold
      || dragDistance >= (PLOT_DRAG_THRESHOLD / Math.max(scale, 0.001));

    if (!hasExceededThreshold) {
      return;
    }

    if (!dragSession.hasExceededThreshold) {
      plotDragSessionRef.current = {
        ...dragSession,
        hasExceededThreshold: true,
      };
      dragPreviewRef.current = dragSession.basePlot;
      setDragPreviewPlot(dragSession.basePlot);
      setIsPlotDragging(true);
    }

    scheduleDragPreview(
      translatePlot(
        dragSession.basePlot,
        nextPointer.x - dragSession.pointerStart.x,
        nextPointer.y - dragSession.pointerStart.y
      )
    );
  };

  const handlePlotDragEnd = (nextPointer) => {
    const dragSession = plotDragSessionRef.current;

    if (!dragSession) {
      return;
    }

    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    const dragDistance = getDistanceBetweenPoints(dragSession.pointerStart, nextPointer);
    const hasExceededThreshold = dragSession.hasExceededThreshold
      || dragDistance >= (PLOT_DRAG_THRESHOLD / Math.max(scale, 0.001));

    if (hasExceededThreshold) {
      const committedPlot = nextPointer
        ? translatePlot(
            dragSession.basePlot,
            nextPointer.x - dragSession.pointerStart.x,
            nextPointer.y - dragSession.pointerStart.y
          )
        : dragPreviewRef.current?.id === dragSession.plotId
          ? dragPreviewRef.current
          : dragSession.basePlot;

      setRectangles((prev) => prev.map((plot) => (
        plot.id === dragSession.plotId ? committedPlot : plot
      )));
    }

    plotDragSessionRef.current = null;
    dragPreviewRef.current = null;
    setDragPreviewPlot(null);
    setIsPlotDragging(false);
    removeGlobalPointerListeners();
  };

  function handleStagePointerMove(event) {
    if (activeHandleIndex !== null) {
      event?.evt?.preventDefault?.();

      const nextPointer = getPointerInPlotSpace();

      if (nextPointer) {
        handleVertexDragMove(activeHandleIndex, nextPointer);
      }

      return;
    }

    if (plotDragSessionRef.current) {
      handlePlotDragMove(event);
    }
  }

  function handleStagePointerUp() {
    if (activeHandleIndex !== null) {
      handleVertexDragEnd(activeHandleIndex, getPointerInPlotSpace());
      return;
    }

    handlePlotDragEnd(getPointerInPlotSpace());
  }

  const handleShapePointerDown = (plot, event) => {
    if (
      !plot
      || plot.id === "boundary_plot"
      || activeHandleIndex !== null
      || isSpacePanning
      || isAnalyzing
      || plot.id !== selectedId
    ) {
      return;
    }

    const startPointer = getPointerInPlotSpace();

    if (!startPointer) {
      return;
    }

    event.cancelBubble = true;
    event.evt?.preventDefault?.();
    plotDragSessionRef.current = {
      plotId: plot.id,
      basePlot: plot,
      pointerStart: startPointer,
      hasExceededThreshold: false,
    };
    attachGlobalPointerListeners();
  };

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
        const { id: _id, isBoundary: _isBoundary, ...rest } = p;
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
        navigate("/admin-dashboard");
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
  const selectedRectBounds = selectedRect ? getPlotBounds(selectedRect) : null;
  const selectedShapeVertices = selectedRect ? getShapeVertices(selectedRect) : [];
  const selectedCurveEdges = selectedRect && hasPolygonPoints(selectedRect)
    ? getCurveEdgeIndexes(selectedRect)
    : [];
  const selectedCurveFactors = selectedRect && hasPolygonPoints(selectedRect)
    ? getCurveEdgeFactors(selectedRect)
    : {};
  const selectedEdgeLengthsMeters = selectedRect && hasPolygonPoints(selectedRect)
    ? getSanitizedEdgeLengths(selectedRect.edgeLengthsMeters, selectedShapeVertices.length)
    : {};
  const selectedStraightEdgeInputs = selectedRect && hasPolygonPoints(selectedRect)
    ? selectedShapeVertices.map((_, edgeIndex) => ({
        edgeIndex,
        label: getEdgeLabel(edgeIndex, selectedShapeVertices.length),
        isCurved: selectedCurveEdges.includes(edgeIndex),
      })).filter((edge) => !edge.isCurved)
    : [];
  const selectedCurvedEdgeLabels = selectedRect && hasPolygonPoints(selectedRect)
    ? selectedCurveEdges.map((edgeIndex) => getEdgeLabel(edgeIndex, selectedShapeVertices.length))
    : [];
  const selectedIsNonPlotBlock = selectedRect?.isPlot === false;
  const isHandleEditing = activeHandleIndex !== null;
  const canPanWorkspace = (
    !isHandleEditing
    && !isPlotDragging
  );
  const canDragSelectedPlot = !isHandleEditing && !isSpacePanning && !isAnalyzing;
  const zoomPercent = `${Math.round(scale * 100)}%`;
  const imageCenterX = image ? image.width / 2 : 0;
  const imageCenterY = image ? image.height / 2 : 0;

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
          <button
            style={styles.saveBtnTop}
            onClick={handleSubmit}
            disabled={isSaving || isAnalyzing || !rectangles.length}
          >
            {isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Save Layout"}
          </button>
        </div>
      </div>

      <div
        style={{
          ...styles.editorShell,
          gridTemplateColumns: viewport.width < 1180 ? "1fr" : "minmax(0, 1fr) 360px",
        }}
      >
        <section style={styles.workspaceSection}>
          <div style={styles.workspaceToolbar}>
            <button style={styles.controlBtn} onClick={() => fitToScreen()}>
              Fit
            </button>
            {!isEditMode && (
              <button
                style={styles.controlBtn}
                onClick={() => runAutoDetection()}
                disabled={!image || isAnalyzing}
              >
                {isAnalyzing ? "Analyzing..." : "Re-analyze"}
              </button>
            )}
            <button
              style={{ ...styles.controlBtn, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
              onClick={handleAddPolygon}
            >
              Add Polygon
            </button>
            <button
              style={{ ...styles.controlBtn, background: "#ecfeff", color: "#0f766e", border: "1px solid #99f6e4" }}
              onClick={handleAddCurvedPolygon}
            >
              Add Curved Polygon
            </button>
            <div style={styles.toolbarDivider} />
            <button style={styles.iconBtn} onClick={() => zoomBy(1 / 1.12)} aria-label="Zoom out">
              -
            </button>
            <div style={styles.zoomBadge}>{zoomPercent}</div>
            <button style={styles.iconBtn} onClick={() => zoomBy(1.12)} aria-label="Zoom in">
              +
            </button>
            <div style={styles.toolbarDivider} />
            <button style={styles.iconBtn} onClick={() => setRotation((prev) => normalizeAngle(prev - 6))} aria-label="Rotate left">
              ↺
            </button>
            <div style={styles.zoomBadge}>{Math.round(rotation)}°</div>
            <button style={styles.iconBtn} onClick={() => setRotation((prev) => normalizeAngle(prev + 6))} aria-label="Rotate right">
              ↻
            </button>
            {selectedRect && selectedRect.id !== "boundary_plot" && (
              <>
                <div style={styles.toolbarDivider} />
                <label style={styles.toolbarToggleLabel}>
                  <input
                    type="checkbox"
                    checked={selectedIsNonPlotBlock}
                    onChange={(event) => handleInputChange("isPlot", !event.target.checked)}
                    style={styles.toolbarCheckbox}
                  />
                  <span style={styles.toolbarToggleText}>Non-plot</span>
                </label>
                {selectedIsNonPlotBlock && (
                  <>
                    <div style={styles.toolbarSwatchRow}>
                      {NON_PLOT_COLOR_SWATCHES.map((color) => (
                        <button
                          key={`toolbar-block-color-${color}`}
                          type="button"
                          aria-label={`Set block color ${color}`}
                          onClick={() => handleInputChange("blockColor", color)}
                          style={{
                            ...styles.toolbarSwatchButton,
                            background: color,
                            boxShadow: selectedRect.blockColor === color
                              ? "0 0 0 2px rgba(255,255,255,0.85)"
                              : "0 0 0 1px rgba(255,255,255,0.08)",
                          }}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={selectedRect.blockColor || DEFAULT_NON_PLOT_COLOR}
                      onChange={(event) => handleInputChange("blockColor", event.target.value)}
                      title="Choose block color"
                      style={styles.toolbarColorInput}
                    />
                  </>
                )}
              </>
            )}
          </div>

          <div
            style={{
              ...styles.canvasWrapper,
              cursor: isHandleEditing
                ? "crosshair"
                : isPlotDragging
                  ? "grabbing"
                  : isSpacePanning
                    ? "grab"
                    : selectedId && canDragSelectedPlot
                      ? "move"
                      : "default",
            }}
          >
            {!image ? (
              <div style={styles.placeholderState}>
                <h2 style={styles.placeholderTitle}>Preparing layout</h2>
                <p style={styles.placeholderCopy}>The uploaded image is loading so PlotViewer can analyze it.</p>
              </div>
            ) : (
              <>
                <div style={styles.canvasHud}>
                  <span style={styles.canvasHudBadge}>{rectangles.length} overlays</span>
                  <span style={styles.canvasHudBadge}>{analysisMode}</span>
                  <span style={styles.canvasHudHint}>
                    Drag the selected plot to move it. Drag empty area to move the full image. Zoom with Ctrl/Cmd + wheel. Copy with Ctrl/Cmd + C and paste with Ctrl/Cmd + V.
                  </span>
                </div>

                <Stage
                  width={canvasWidth}
                  height={canvasHeight}
                  scaleX={scale}
                  scaleY={scale}
                  x={position.x}
                  y={position.y}
                  draggable={canPanWorkspace}
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
                    if (
                      e.target === e.target.getStage()
                      && !isSpacePanning
                      && !isPlotDragging
                      && activeHandleIndex === null
                    ) {
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
                          isSpacePanning={isSpacePanning}
                          onSelect={() => setSelectedId(rect.id)}
                          onShapePointerDown={handleShapePointerDown}
                        />
                      ))}

                      {selectedRect && !isAnalyzing && !isPlotDragging && (
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
              </>
            )}
          </div>

          <div style={styles.workspaceFooter}>
            <span style={styles.workspaceFooterItem}>Move plot: drag the selected overlay</span>
            <span style={styles.workspaceFooterItem}>Pan image: drag empty area or hold Space and drag</span>
            <span style={styles.workspaceFooterItem}>Zoom: Ctrl/Cmd + wheel or toolbar buttons</span>
            <span style={styles.workspaceFooterItem}>Copy/paste: Ctrl/Cmd + C, then Ctrl/Cmd + V</span>
            <span style={styles.workspaceFooterItem}>Rotate: Alt + wheel or ↺ ↻</span>
          </div>
        </section>

        <aside
          style={{
            ...styles.inspectorRail,
            position: viewport.width < 1180 ? "static" : "sticky",
          }}
        >
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Session</h2>
            <div style={styles.metricGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Detected</span>
                <strong style={styles.metricValue}>{rectangles.length}</strong>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Mode</span>
                <strong style={styles.metricValueSmall}>{isAnalyzing ? `Running ${analysisMode}` : analysisMode}</strong>
              </div>
            </div>
            <div style={analysisError ? styles.messageCardError : styles.messageCard}>
              <strong style={analysisError ? styles.errorText : styles.messageText}>
                {analysisError || analysisMessage}
              </strong>
            </div>
          </section>

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Selected Shape</h2>
            {!selectedRect ? (
              <p style={styles.panelText}>
                Click any detected shape to review details, mark it as a plot or non-plot block, and refine its outline.
              </p>
            ) : (
              <div style={styles.formStack}>
                <div style={styles.plotTag}>
                  {selectedRect.id === "boundary_plot"
                    ? "Layout Boundary"
                    : selectedIsNonPlotBlock
                      ? `Block ${selectedRect.plotNo || "-"}`
                      : `Plot #${selectedRect.plotNo || "-"}`}
                </div>
                <p style={styles.panelTextCompact}>
                  {selectedRect.id === "boundary_plot"
                    ? "Drag the boundary handles on the canvas to trace the outside edge of the layout."
                    : selectedIsNonPlotBlock
                      ? "This shape is excluded from plot inventory and will render as a colored block in 3D."
                      : "Drag the selected plot to reposition it, then use the canvas handles and fields here to fine-tune its shape."}
                </p>
                <div style={styles.metaRow}>
                  <span style={styles.metaBadge}>Area: {selectedRect.area || 0} sq.ft</span>
                  <span style={styles.metaBadge}>Shape: {getPlotShapeLabel(selectedRect)}</span>
                  {selectedRectBounds && (
                    <span style={styles.metaBadge}>
                      Bounds: {Math.round(selectedRectBounds.width)} x {Math.round(selectedRectBounds.height)} px
                    </span>
                  )}
                </div>

                {selectedRect.id !== "boundary_plot" && (
                  <>
                    <div style={styles.fieldRow}>
                      <label style={styles.fieldLabel}>
                        {selectedIsNonPlotBlock ? "Label" : "Plot No"}
                        <input
                          value={selectedRect.plotNo || ""}
                          onChange={(e) => handleInputChange("plotNo", e.target.value)}
                          style={styles.input}
                        />
                      </label>
                      <label style={styles.fieldLabel}>
                        Area
                        <input
                          type="number"
                          value={selectedRect.area || ""}
                          onChange={(e) => handleInputChange("area", e.target.value ? Number(e.target.value) : 0)}
                          style={styles.input}
                        />
                      </label>
                    </div>

                    {!hasPolygonPoints(selectedRect) ? (
                      <div style={styles.fieldRow}>
                        <label style={styles.fieldLabel}>
                          Plot Width (m)
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={formatFeetValueAsMeters(selectedRect.plotWidth)}
                            onChange={(e) => handleInputChange("plotWidth", parseMeterInputToFeet(e.target.value))}
                            style={styles.input}
                          />
                        </label>
                        <label style={styles.fieldLabel}>
                          Plot Height (m)
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={formatFeetValueAsMeters(selectedRect.plotHeight)}
                            onChange={(e) => handleInputChange("plotHeight", parseMeterInputToFeet(e.target.value))}
                            style={styles.input}
                          />
                        </label>
                      </div>
                    ) : (
                      <div style={styles.edgeDimensionCard}>
                        <div style={styles.edgeDimensionHeader}>
                          <span style={styles.edgeDimensionTitle}>Polygon Side Dimensions (m)</span>
                          <span style={styles.edgeDimensionHint}>
                            Use the vertex labels shown on the canvas. Curved edges are skipped automatically.
                          </span>
                        </div>

                        {selectedStraightEdgeInputs.length ? (
                          <div style={styles.edgeDimensionGrid}>
                            {selectedStraightEdgeInputs.map((edge) => (
                              <label key={`${selectedRect.id}-edge-length-${edge.edgeIndex}`} style={styles.fieldLabel}>
                                Side {edge.label}
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={selectedEdgeLengthsMeters[edge.edgeIndex] ?? ""}
                                  onChange={(event) => handlePolygonEdgeLengthChange(edge.edgeIndex, event.target.value)}
                                  placeholder="Meters"
                                  style={styles.input}
                                />
                              </label>
                            ))}
                          </div>
                        ) : (
                          <span style={styles.helperText}>
                            All edges are marked as curved right now, so there are no straight sides to fill in.
                          </span>
                        )}

                        {selectedCurvedEdgeLabels.length ? (
                          <span style={styles.helperText}>
                            Curved edges skipped: {selectedCurvedEdgeLabels.join(", ")}.
                          </span>
                        ) : null}
                      </div>
                    )}

                    <label style={styles.checkboxField}>
                      <span style={styles.checkboxFieldText}>Exclude from plots</span>
                      <span style={styles.checkboxFieldHint}>Checked means this shape is a non-plot block.</span>
                      <span style={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={selectedIsNonPlotBlock}
                          onChange={(event) => handleInputChange("isPlot", !event.target.checked)}
                        />
                        <span>Non-plot block</span>
                      </span>
                    </label>

                    {selectedIsNonPlotBlock ? (
                      <div style={styles.blockColorCard}>
                        <div style={styles.blockColorHeader}>
                          <span style={styles.blockColorTitle}>Block color</span>
                          <input
                            type="color"
                            value={selectedRect.blockColor || DEFAULT_NON_PLOT_COLOR}
                            onChange={(event) => handleInputChange("blockColor", event.target.value)}
                            style={styles.blockColorInput}
                          />
                        </div>
                        <div style={styles.blockColorSwatches}>
                          {NON_PLOT_COLOR_SWATCHES.map((color) => (
                            <button
                              key={`inspector-block-color-${color}`}
                              type="button"
                              onClick={() => handleInputChange("blockColor", color)}
                              aria-label={`Set block color ${color}`}
                              style={{
                                ...styles.blockColorSwatch,
                                background: color,
                                boxShadow: selectedRect.blockColor === color
                                  ? "0 0 0 2px rgba(15, 23, 42, 0.9)"
                                  : "0 0 0 1px rgba(15, 23, 42, 0.12)",
                              }}
                            />
                          ))}
                        </div>
                        <span style={styles.helperText}>
                          Non-plot blocks keep their custom color in the 3D editor and stay out of customer plot counts.
                        </span>
                      </div>
                    ) : (
                      <>
                        <label style={styles.fieldLabel}>
                          Status
                          <select
                            value={selectedRect.status}
                            onChange={(e) => handleInputChange("status", e.target.value)}
                            style={styles.input}
                          >
                            <option value="Available">Available</option>
                            <option value="Reserved">Reserved</option>
                            <option value="Sold">Sold</option>
                          </select>
                        </label>

                        <label style={styles.fieldLabel}>
                          Category
                          <select
                            value={selectedRect.category || "Standard"}
                            onChange={(e) => handleInputChange("category", e.target.value)}
                            style={styles.input}
                          >
                            <option value="Standard">Standard</option>
                            <option value="Premium">Premium</option>
                            <option value="Diamond">Diamond</option>
                          </select>
                        </label>

                        <label style={styles.fieldLabel}>
                          Rate (INR)
                          <input
                            type="number"
                            value={selectedRect.rate || ""}
                            onChange={(e) => handleInputChange("rate", e.target.value ? Number(e.target.value) : 0)}
                            style={styles.input}
                          />
                        </label>
                      </>
                    )}

                    {hasPolygonPoints(selectedRect) && selectedShapeVertices.length >= 3 && (
                      <div style={styles.fieldLabel}>
                        Curved Edges
                        <div style={styles.edgeToggleWrap}>
                          {selectedShapeVertices.map((_, edgeIndex) => {
                            const isActive = selectedCurveEdges.includes(edgeIndex);

                            return (
                              <button
                                key={`${selectedRect.id}-curve-edge-${edgeIndex}`}
                                type="button"
                                style={isActive ? styles.edgeToggleBtnActive : styles.edgeToggleBtn}
                                onClick={() => handleToggleCurveEdge(edgeIndex)}
                              >
                                Edge {edgeIndex + 1}
                              </button>
                            );
                          })}
                        </div>
                        <span style={styles.helperText}>
                          Active: {selectedCurveEdges.length ? formatCurveEdgeInput(selectedCurveEdges) : "None"}.
                          Edge 1 runs from point 1 to point 2. Side dimensions above use the canvas vertex labels, such as A-B and B-C.
                        </span>
                        {selectedCurveEdges.map((edgeIndex) => {
                          const curvePercent = Math.round((selectedCurveFactors[edgeIndex] || 0) * 100);

                          return (
                            <label key={`${selectedRect.id}-curve-factor-${edgeIndex}`} style={styles.curveFactorRow}>
                              <span style={styles.curveFactorLabel}>Edge {edgeIndex + 1} curve size: {curvePercent}%</span>
                              <input
                                type="range"
                                min="5"
                                max="50"
                                step="1"
                                value={curvePercent}
                                onChange={(event) => handleCurveFactorChange(edgeIndex, Number(event.target.value) / 100)}
                                style={styles.curveFactorSlider}
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}

                    <p style={styles.panelTextCompact}>
                      Drag the plot to reposition it, drag the corner handles on the canvas to shape it, and toggle curved edges here for quarter-circle corners or other rounded sides.
                    </p>
                  </>
                )}

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

          
        </aside>
      </div>
    </div>
  );
};

const PlotAnnotation = ({
  plot,
  isSelected,
  isSpacePanning,
  onSelect,
  onShapePointerDown,
}) => {
  const isBoundary = plot.id === "boundary_plot";
  const isNonPlotBlock = plot.isPlot === false;
  const bounds = getPlotBounds(plot);
  const center = getPlotCenter(plot);
  const labelWidth = Math.max(bounds.width, 48);
  const labelText = isBoundary
    ? "Boundary"
    : isNonPlotBlock
      ? plot.plotNo || "Block"
      : `#${plot.plotNo || "-"}`;
  const shouldShowLabel = !isNonPlotBlock || isBoundary || isSelected;

  const handlePointerDown = (event) => {
    event.cancelBubble = true;
    onShapePointerDown?.(plot, event);
  };

  return (
    <React.Fragment>
      <PlotShape
        plot={plot}
        fill={isBoundary
          ? (isSelected ? "rgba(103, 103, 103, 0.18)" : "rgba(103, 103, 103, 0.08)")
          : (isNonPlotBlock ? (plot.blockColor || DEFAULT_NON_PLOT_COLOR) : getPlotFill(plot.status))}
        stroke={isBoundary
          ? LAYOUT_MAP_COLORS.compoundWall
          : (isSelected
            ? LAYOUT_MAP_COLORS.selectedPlot
            : (isNonPlotBlock ? "transparent" : LAYOUT_MAP_COLORS.plotNumber))}
        strokeWidth={isBoundary ? 1.4 : (isNonPlotBlock ? (isSelected ? 1.4 : 0) : (isSelected ? 1.4 : 0.9))}
        dash={isBoundary && !isSelected ? [15, 15] : []}
        cornerRadius={isNonPlotBlock || isBoundary ? 0 : 4}
        listening={!isSpacePanning}
        draggable={false}
        onPointerDown={handlePointerDown}
        onClick={onSelect}
        onTap={onSelect}
      />

      {shouldShowLabel ? (
        <Text
          x={center.x - labelWidth / 2}
          y={center.y - 8}
          width={labelWidth}
          align="center"
          text={labelText}
          fontSize={12}
          fontStyle="bold"
          fontFamily={LAYOUT_MAP_FONT_FAMILY}
          fill={LAYOUT_MAP_COLORS.plotNumber}
          listening={false}
        />
      ) : null}
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
  const handleRadius = clampValue(7 / Math.max(scale, 0.001), MIN_HANDLE_RADIUS, MAX_HANDLE_RADIUS);
  const haloRadius = handleRadius * 1.35;
  const strokeWidth = Math.max(0.8, 1.2 / Math.max(scale, 0.001));
  const labelFontSize = clampValue(12 / Math.max(scale, 0.001), 8, 14);
  const rawPoints = getPlotPoints(plot);
  const curvedEdges = getCurveEdgeIndexes(plot);
  const hasCurvedEdges = curvedEdges.length > 0;
  const curvedVertexIndexes = new Set(
    curvedEdges.flatMap((edgeIndex) => [edgeIndex, (edgeIndex + 1) % vertices.length])
  );

  return (
    <React.Fragment>
      <PlotShape
        plot={plot}
        fill="rgba(14, 165, 233, 0.08)"
        stroke="#0f766e"
        strokeWidth={hasCurvedEdges ? 1.6 : 1.05}
        dash={hasCurvedEdges ? [] : [10, 6]}
        listening={false}
      />

      {hasCurvedEdges && rawPoints.length >= 6 && (
          <Line
          points={rawPoints}
          closed
          fill="transparent"
          stroke="rgba(37, 99, 235, 0.65)"
          strokeWidth={Math.max(0.75, 1.1 / Math.max(scale, 0.001))}
          dash={[6, 6]}
          lineJoin="round"
          lineCap="round"
          listening={false}
        />
      )}

      {vertices.map((vertex, index) => {
        const isActive = activeHandleIndex === index;
        const isCurveAnchor = curvedVertexIndexes.has(index);

        return (
          <React.Fragment key={`${plot.id}-handle-${index}`}>
            <Circle
              x={vertex.x}
              y={vertex.y}
              radius={haloRadius}
              fill={isActive ? "rgba(20, 184, 166, 0.24)" : isCurveAnchor ? "rgba(20, 184, 166, 0.2)" : "rgba(191, 219, 254, 0.26)"}
              stroke="transparent"
              onMouseDown={(event) => onVertexDragStart(index, event)}
              onTouchStart={(event) => onVertexDragStart(index, event)}
            />
            <Circle
              x={vertex.x}
              y={vertex.y}
              radius={handleRadius}
              fill={isCurveAnchor ? "#ecfeff" : "#ffffff"}
              stroke={isActive ? "#0f766e" : isCurveAnchor ? "#0f766e" : "#2563eb"}
              strokeWidth={strokeWidth}
              listening={false}
            />
            <Text
              x={vertex.x + handleRadius + 3}
              y={vertex.y - handleRadius - labelFontSize}
              text={getVertexLabel(index)}
              fontSize={labelFontSize}
              fontStyle="bold"
              fontFamily={LAYOUT_MAP_FONT_FAMILY}
              fill="#0f172a"
              stroke="rgba(255, 255, 255, 0.96)"
              strokeWidth={Math.max(0.45, strokeWidth * 0.45)}
              listening={false}
            />
          </React.Fragment>
        );
      })}
    </React.Fragment>
  );
};

const getPlotFill = (status) => getLayoutStatusFill(status, 0.5);

export default AutoPlotEditor;

const styles = {
  container: {
    background: "linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%)",
    minHeight: "100vh",
    padding: "24px 24px 48px 24px",
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
    fontSize: "30px",
    fontWeight: "800",
    margin: 0,
    color: "#0f172a",
  },
  subtitle: {
    fontSize: "14px",
    color: "#475569",
    marginTop: "8px",
    maxWidth: "820px",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    alignItems: "center",
  },
  layoutNameInput: {
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    minWidth: "280px",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  controlBtn: {
    background: "#e2e8f0",
    color: "#0f172a",
    padding: "10px 14px",
    border: "1px solid transparent",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "700",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
  },
  saveBtnTop: {
    background: "linear-gradient(135deg, #2563eb 0%, #0f766e 100%)",
    color: "#fff",
    padding: "12px 18px",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "700",
    boxShadow: "0 16px 30px rgba(37, 99, 235, 0.22)",
  },
  editorShell: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 360px",
    gap: "20px",
    alignItems: "start",
    marginTop: "20px",
  },
  workspaceSection: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  workspaceToolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    padding: "14px 16px",
    background: "rgba(15, 23, 42, 0.94)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "18px",
    boxShadow: "0 20px 36px rgba(15, 23, 42, 0.18)",
  },
  toolbarDivider: {
    width: "1px",
    alignSelf: "stretch",
    background: "rgba(148, 163, 184, 0.22)",
  },
  iconBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: "18px",
    fontWeight: "700",
  },
  zoomBadge: {
    minWidth: "64px",
    height: "38px",
    borderRadius: "12px",
    padding: "0 12px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    background: "rgba(148, 163, 184, 0.12)",
    color: "#e2e8f0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
  },
  toolbarToggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "38px",
    padding: "0 12px",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    background: "rgba(148, 163, 184, 0.12)",
    color: "#e2e8f0",
    fontWeight: "700",
    cursor: "pointer",
  },
  toolbarCheckbox: {
    margin: 0,
    accentColor: "#22c55e",
    cursor: "pointer",
  },
  toolbarToggleText: {
    fontSize: "13px",
    letterSpacing: "0.02em",
  },
  toolbarSwatchRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  toolbarSwatchButton: {
    width: "20px",
    height: "20px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
  },
  toolbarColorInput: {
    width: "38px",
    height: "38px",
    padding: "4px",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    background: "rgba(148, 163, 184, 0.12)",
    cursor: "pointer",
  },
  canvasWrapper: {
    borderRadius: "24px",
    overflow: "hidden",
    background: "radial-gradient(circle at top, rgba(30, 41, 59, 0.92), #020617 72%)",
    boxShadow: "0 24px 48px rgba(15, 23, 42, 0.24)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    position: "relative",
    minHeight: "420px",
  },
  canvasHud: {
    position: "absolute",
    top: "16px",
    left: "16px",
    right: "16px",
    zIndex: 2,
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    pointerEvents: "none",
  },
  canvasHudBadge: {
    background: "rgba(15, 23, 42, 0.78)",
    color: "#f8fafc",
    border: "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.03em",
  },
  canvasHudHint: {
    background: "rgba(255, 255, 255, 0.9)",
    color: "#0f172a",
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: "600",
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
    color: "#f8fafc",
  },
  placeholderCopy: {
    marginTop: "10px",
    color: "#cbd5e1",
    maxWidth: "420px",
  },
  analysisOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(2, 6, 23, 0.58)",
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  },
  analysisOverlayCard: {
    background: "rgba(255, 255, 255, 0.96)",
    borderRadius: "20px",
    border: "1px solid rgba(191, 219, 254, 0.9)",
    boxShadow: "0 30px 60px rgba(15, 23, 42, 0.26)",
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
  workspaceFooter: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  workspaceFooterItem: {
    background: "#ffffff",
    border: "1px solid #dbe2ec",
    color: "#475569",
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: "600",
  },
  inspectorRail: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    position: "sticky",
    top: "20px",
  },
  panel: {
    background: "#ffffff",
    borderRadius: "20px",
    border: "1px solid #dbe2ec",
    padding: "20px",
    boxShadow: "0 18px 32px rgba(15, 23, 42, 0.08)",
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
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "14px",
  },
  metricCard: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  metricLabel: {
    fontSize: "11px",
    color: "#64748b",
    fontWeight: "800",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: "28px",
    color: "#0f172a",
    fontWeight: "800",
  },
  metricValueSmall: {
    fontSize: "15px",
    color: "#0f172a",
    fontWeight: "700",
    lineHeight: 1.4,
  },
  messageCard: {
    marginTop: "14px",
    background: "linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)",
    borderRadius: "16px",
    padding: "14px 16px",
    border: "1px solid #a7f3d0",
  },
  messageCardError: {
    marginTop: "14px",
    background: "#fff1f2",
    borderRadius: "16px",
    padding: "14px 16px",
    border: "1px solid #fecdd3",
  },
  messageText: {
    color: "#0f766e",
    lineHeight: 1.6,
  },
  errorText: {
    color: "#b91c1c",
    lineHeight: 1.6,
  },
  formStack: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginTop: "14px",
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
  checkboxField: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px 14px",
    borderRadius: "16px",
    border: "1px solid #dbe2ec",
    background: "#f8fafc",
  },
  checkboxFieldText: {
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: "700",
  },
  checkboxFieldHint: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    fontWeight: "500",
  },
  checkboxRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "700",
  },
  input: {
    padding: "11px 12px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    color: "#0f172a",
    background: "#f8fafc",
  },
  helperText: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    fontWeight: "500",
  },
  blockColorCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #bbf7d0",
    background: "linear-gradient(135deg, #f0fdf4 0%, #ecfccb 100%)",
  },
  blockColorHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  blockColorTitle: {
    color: "#166534",
    fontSize: "13px",
    fontWeight: "800",
  },
  blockColorInput: {
    width: "44px",
    height: "32px",
    border: "1px solid rgba(22, 101, 52, 0.12)",
    borderRadius: "10px",
    background: "#ffffff",
    cursor: "pointer",
  },
  blockColorSwatches: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  blockColorSwatch: {
    width: "26px",
    height: "26px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
  },
  edgeDimensionCard: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: "16px",
    border: "1px solid #dbe2ec",
    background: "#f8fafc",
  },
  edgeDimensionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  edgeDimensionTitle: {
    color: "#0f172a",
    fontSize: "13px",
    fontWeight: "800",
  },
  edgeDimensionHint: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: 1.5,
    fontWeight: "500",
  },
  edgeDimensionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
  },
  curveFactorRow: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "4px",
  },
  curveFactorLabel: {
    color: "#334155",
    fontSize: "12px",
    fontWeight: "600",
  },
  curveFactorSlider: {
    width: "100%",
    accentColor: "#0f766e",
    cursor: "pointer",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  edgeToggleWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  edgeToggleBtn: {
    borderRadius: "999px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#475569",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  edgeToggleBtnActive: {
    borderRadius: "999px",
    border: "1px solid #99f6e4",
    background: "#ccfbf1",
    color: "#0f766e",
    padding: "7px 12px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  inlineActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
  },
  shapeBtn: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    padding: "10px 14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  deleteBtn: {
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "10px 14px",
    fontWeight: "700",
    cursor: "pointer",
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
