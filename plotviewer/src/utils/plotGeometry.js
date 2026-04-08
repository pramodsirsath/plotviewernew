import {
  LAYOUT_MAP_COLORS,
  LAYOUT_STATUS_COLORS,
} from "../theme/layoutMapTheme";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const TWO_PI = Math.PI * 2;
const ARC_SAMPLE_STEP = Math.PI / 18;
const CURVE_CENTER_EPSILON = 1e-6;
const CURVE_RADIUS_TOLERANCE = 2;
const MIN_CURVE_FACTOR = 0.05;
const MAX_CURVE_FACTOR = 0.5;
const FEET_TO_METERS = 0.3048;
const SQFT_TO_SQM = 0.092903;
export const QUARTER_CIRCLE_CURVE_FACTOR = Math.SQRT1_2 - 0.5;
const DEFAULT_CURVE_FACTOR = QUARTER_CIRCLE_CURVE_FACTOR;

export const getPlotPoints = (plot) => {
  if (!Array.isArray(plot?.points)) {
    return [];
  }

  return plot.points.filter(isFiniteNumber);
};

export const hasPolygonPoints = (plot) => getPlotPoints(plot).length >= 6;

const toPointObjects = (points) => {
  const vertices = [];

  for (let index = 0; index < points.length; index += 2) {
    vertices.push({
      x: points[index],
      y: points[index + 1],
    });
  }

  return vertices;
};

export const getVertexLabel = (vertexIndex) => {
  let nextIndex = vertexIndex;
  let label = "";

  do {
    label = String.fromCharCode(65 + (nextIndex % 26)) + label;
    nextIndex = Math.floor(nextIndex / 26) - 1;
  } while (nextIndex >= 0);

  return label;
};

export const getEdgeLabel = (edgeIndex, vertexCount) => (
  `${getVertexLabel(edgeIndex)}-${getVertexLabel((edgeIndex + 1) % vertexCount)}`
);

const flattenPointObjects = (points) => points.flatMap((point) => [point.x, point.y]);

const subtractPoints = (firstPoint, secondPoint) => ({
  x: firstPoint.x - secondPoint.x,
  y: firstPoint.y - secondPoint.y,
});

const rotateLeft = (vector) => ({ x: -vector.y, y: vector.x });
const rotateRight = (vector) => ({ x: vector.y, y: -vector.x });
const crossProduct = (firstVector, secondVector) => (
  firstVector.x * secondVector.y - firstVector.y * secondVector.x
);
const dotProduct = (firstVector, secondVector) => (
  firstVector.x * secondVector.x + firstVector.y * secondVector.y
);

const getDistanceBetweenPoints = (firstPoint, secondPoint) => (
  Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y)
);

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeVector = (vector) => {
  const length = Math.hypot(vector.x, vector.y);

  if (length < CURVE_CENTER_EPSILON) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
};

const getLineIntersection = (firstPoint, firstDirection, secondPoint, secondDirection) => {
  const determinant = crossProduct(firstDirection, secondDirection);

  if (Math.abs(determinant) < CURVE_CENTER_EPSILON) {
    return null;
  }

  const delta = subtractPoints(secondPoint, firstPoint);
  const scale = crossProduct(delta, secondDirection) / determinant;

  return {
    x: firstPoint.x + firstDirection.x * scale,
    y: firstPoint.y + firstDirection.y * scale,
  };
};

const arePointsEquivalent = (firstPoint, secondPoint) => (
  Math.abs(firstPoint.x - secondPoint.x) < 0.001
  && Math.abs(firstPoint.y - secondPoint.y) < 0.001
);

const getEdgeSweep = (startAngle, endAngle, anticlockwise) => {
  let sweep = endAngle - startAngle;

  if (anticlockwise) {
    while (sweep <= 0) {
      sweep += TWO_PI;
    }
  } else {
    while (sweep >= 0) {
      sweep -= TWO_PI;
    }
  }

  return sweep;
};

const getLegacyCurvedEdgeSamplePoints = ({
  previousVertex,
  startVertex,
  endVertex,
  nextVertex,
}) => {
  const startTangent = normalizeVector(subtractPoints(startVertex, previousVertex));
  const endTangent = normalizeVector(subtractPoints(nextVertex, endVertex));

  if (!startTangent || !endTangent) {
    return null;
  }

  const startNormal = rotateLeft(startTangent);
  const endNormal = rotateLeft(endTangent);
  let center = getLineIntersection(startVertex, startNormal, endVertex, endNormal);

  if (!center) {
    if (Math.abs(crossProduct(subtractPoints(endVertex, startVertex), startNormal)) > CURVE_CENTER_EPSILON) {
      return null;
    }

    const midpoint = {
      x: (startVertex.x + endVertex.x) / 2,
      y: (startVertex.y + endVertex.y) / 2,
    };
    const chordDirection = normalizeVector(subtractPoints(endVertex, startVertex));

    if (!chordDirection) {
      return null;
    }

    center = getLineIntersection(startVertex, startNormal, midpoint, rotateLeft(chordDirection));
  }

  if (!center) {
    return null;
  }

  const radiusStart = getDistanceBetweenPoints(center, startVertex);
  const radiusEnd = getDistanceBetweenPoints(center, endVertex);

  if (
    !Number.isFinite(radiusStart)
    || !Number.isFinite(radiusEnd)
    || radiusStart < CURVE_CENTER_EPSILON
    || Math.abs(radiusStart - radiusEnd) > Math.max(
      CURVE_RADIUS_TOLERANCE,
      Math.max(radiusStart, radiusEnd) * 0.08
    )
  ) {
    return null;
  }

  const radius = (radiusStart + radiusEnd) / 2;
  const normalizedStartRadius = normalizeVector(subtractPoints(startVertex, center));
  const normalizedEndRadius = normalizeVector(subtractPoints(endVertex, center));

  if (!normalizedStartRadius || !normalizedEndRadius) {
    return null;
  }

  const ccwStartTangent = rotateLeft(normalizedStartRadius);
  const ccwEndTangent = rotateLeft(normalizedEndRadius);
  const cwStartTangent = rotateRight(normalizedStartRadius);
  const cwEndTangent = rotateRight(normalizedEndRadius);
  const ccwScore = dotProduct(ccwStartTangent, startTangent) + dotProduct(ccwEndTangent, endTangent);
  const cwScore = dotProduct(cwStartTangent, startTangent) + dotProduct(cwEndTangent, endTangent);
  const anticlockwise = ccwScore >= cwScore;

  if (Math.max(ccwScore, cwScore) < 1) {
    return null;
  }

  const startAngle = Math.atan2(startVertex.y - center.y, startVertex.x - center.x);
  const endAngle = Math.atan2(endVertex.y - center.y, endVertex.x - center.x);
  const sweep = getEdgeSweep(startAngle, endAngle, anticlockwise);

  if (Math.abs(sweep) < 0.01 || Math.abs(sweep) > Math.PI * 1.5) {
    return null;
  }

  const segmentCount = Math.max(5, Math.ceil(Math.abs(sweep) / ARC_SAMPLE_STEP));
  const samplePoints = [];

  for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
    const angle = startAngle + sweep * (segmentIndex / segmentCount);
    samplePoints.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  return samplePoints;
};

const getVerticesAverageCenter = (vertices) => {
  if (!vertices.length) {
    return { x: 0, y: 0 };
  }

  const totals = vertices.reduce((accumulator, vertex) => ({
    x: accumulator.x + vertex.x,
    y: accumulator.y + vertex.y,
  }), { x: 0, y: 0 });

  return {
    x: totals.x / vertices.length,
    y: totals.y / vertices.length,
  };
};

const getCurveFactorStore = (plot) => {
  if (!plot?.curveFactors) {
    return {};
  }

  if (plot.curveFactors instanceof Map) {
    return Object.fromEntries(plot.curveFactors.entries());
  }

  if (typeof plot.curveFactors === "object") {
    return plot.curveFactors;
  }

  return {};
};

export const getCurveEdgeIndexes = (plot) => {
  if (!Array.isArray(plot?.curveEdges)) {
    return [];
  }

  const vertexCount = getPlotPoints(plot).length / 2;

  return [...new Set(
    plot.curveEdges
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < vertexCount)
  )].sort((firstValue, secondValue) => firstValue - secondValue);
};

const getOutwardNormalForEdge = (startVertex, endVertex, centerPoint) => {
  const chordVector = subtractPoints(endVertex, startVertex);
  const chordUnitVector = normalizeVector(chordVector);

  if (!chordUnitVector) {
    return null;
  }

  const midpoint = {
    x: (startVertex.x + endVertex.x) / 2,
    y: (startVertex.y + endVertex.y) / 2,
  };
  const toCenter = subtractPoints(centerPoint, midpoint);
  let outwardNormal = rotateLeft(chordUnitVector);

  if (dotProduct(outwardNormal, toCenter) > 0) {
    outwardNormal = {
      x: -outwardNormal.x,
      y: -outwardNormal.y,
    };
  }

  return outwardNormal;
};

const getPositiveAngleDifference = (fromAngle, toAngle) => {
  let difference = toAngle - fromAngle;

  while (difference < 0) {
    difference += TWO_PI;
  }

  while (difference >= TWO_PI) {
    difference -= TWO_PI;
  }

  return difference;
};

const getCurveFactorFromLegacyGeometry = ({
  vertices,
  edgeIndex,
  centerPoint,
}) => {
  const startVertex = vertices[edgeIndex];
  const endVertex = vertices[(edgeIndex + 1) % vertices.length];
  const previousVertex = vertices[(edgeIndex - 1 + vertices.length) % vertices.length];
  const nextVertex = vertices[(edgeIndex + 2) % vertices.length];
  const legacyPoints = getLegacyCurvedEdgeSamplePoints({
    previousVertex,
    startVertex,
    endVertex,
    nextVertex,
  });

  if (!legacyPoints?.length) {
    return null;
  }

  const chordLength = getDistanceBetweenPoints(startVertex, endVertex);
  const outwardNormal = getOutwardNormalForEdge(startVertex, endVertex, centerPoint);

  if (!chordLength || !outwardNormal) {
    return null;
  }

  const midpoint = {
    x: (startVertex.x + endVertex.x) / 2,
    y: (startVertex.y + endVertex.y) / 2,
  };
  const maxProjection = legacyPoints.reduce((bestValue, point) => {
    const projection = dotProduct(subtractPoints(point, midpoint), outwardNormal);
    return Math.max(bestValue, projection);
  }, 0);

  if (maxProjection <= CURVE_CENTER_EPSILON) {
    return null;
  }

  return clampValue(maxProjection / chordLength, MIN_CURVE_FACTOR, MAX_CURVE_FACTOR);
};

export const getCurveEdgeFactor = (plot, edgeIndex) => {
  const vertices = toPointObjects(getPlotPoints(plot));

  if (vertices.length < 3 || edgeIndex < 0 || edgeIndex >= vertices.length) {
    return DEFAULT_CURVE_FACTOR;
  }

  const rawFactor = Number(getCurveFactorStore(plot)?.[edgeIndex]);

  if (Number.isFinite(rawFactor) && rawFactor > 0) {
    return clampValue(rawFactor, MIN_CURVE_FACTOR, MAX_CURVE_FACTOR);
  }

  const centerPoint = getVerticesAverageCenter(vertices);
  const legacyFactor = getCurveFactorFromLegacyGeometry({
    vertices,
    edgeIndex,
    centerPoint,
  });

  return legacyFactor ?? DEFAULT_CURVE_FACTOR;
};

export const getCurveEdgeFactors = (plot) => {
  const curveFactors = {};

  getCurveEdgeIndexes(plot).forEach((edgeIndex) => {
    curveFactors[edgeIndex] = getCurveEdgeFactor(plot, edgeIndex);
  });

  return curveFactors;
};

const getCurvedEdgeSamplePoints = ({
  plot,
  vertices,
  edgeIndex,
  centerPoint,
}) => {
  const startVertex = vertices[edgeIndex];
  const endVertex = vertices[(edgeIndex + 1) % vertices.length];
  const chordLength = getDistanceBetweenPoints(startVertex, endVertex);
  const outwardNormal = getOutwardNormalForEdge(startVertex, endVertex, centerPoint);

  if (!chordLength || !outwardNormal) {
    return null;
  }

  const factor = getCurveEdgeFactor(plot, edgeIndex);
  const sagitta = clampValue(chordLength * factor, chordLength * MIN_CURVE_FACTOR, chordLength * MAX_CURVE_FACTOR);
  const midpoint = {
    x: (startVertex.x + endVertex.x) / 2,
    y: (startVertex.y + endVertex.y) / 2,
  };
  const radius = (chordLength * chordLength) / (8 * sagitta) + sagitta / 2;
  const center = {
    x: midpoint.x + outwardNormal.x * (sagitta - radius),
    y: midpoint.y + outwardNormal.y * (sagitta - radius),
  };
  const bulgePoint = {
    x: midpoint.x + outwardNormal.x * sagitta,
    y: midpoint.y + outwardNormal.y * sagitta,
  };
  const startAngle = Math.atan2(startVertex.y - center.y, startVertex.x - center.x);
  const endAngle = Math.atan2(endVertex.y - center.y, endVertex.x - center.x);
  const bulgeAngle = Math.atan2(bulgePoint.y - center.y, bulgePoint.x - center.x);
  const ccwSweep = getPositiveAngleDifference(startAngle, endAngle);
  const ccwBulgeDiff = getPositiveAngleDifference(startAngle, bulgeAngle);
  const anticlockwise = ccwBulgeDiff <= ccwSweep;
  const sweep = anticlockwise ? ccwSweep : ccwSweep - TWO_PI;
  const segmentCount = Math.max(5, Math.ceil(Math.abs(sweep) / ARC_SAMPLE_STEP));
  const samplePoints = [];

  for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
    const angle = startAngle + sweep * (segmentIndex / segmentCount);
    samplePoints.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }

  return samplePoints;
};

export const getPlotRenderPoints = (plot) => {
  const plotPoints = getPlotPoints(plot);

  if (plotPoints.length < 6) {
    return plotPoints;
  }

  const vertices = toPointObjects(plotPoints);
  const curveEdges = getCurveEdgeIndexes(plot);

  if (!curveEdges.length || vertices.length < 3) {
    return plotPoints;
  }

  const curveEdgeSet = new Set(curveEdges);
  const renderVertices = [vertices[0]];
  const centerPoint = getVerticesAverageCenter(vertices);

  for (let edgeIndex = 0; edgeIndex < vertices.length; edgeIndex += 1) {
    const startVertex = vertices[edgeIndex];
    const endVertex = vertices[(edgeIndex + 1) % vertices.length];

    if (!curveEdgeSet.has(edgeIndex)) {
      renderVertices.push(endVertex);
      continue;
    }

    const curvedPoints = getCurvedEdgeSamplePoints({
      plot,
      vertices,
      edgeIndex,
      centerPoint,
    });

    if (curvedPoints?.length) {
      renderVertices.push(...curvedPoints);
    } else {
      renderVertices.push(endVertex);
    }
  }

  if (renderVertices.length > 1 && arePointsEquivalent(renderVertices[0], renderVertices[renderVertices.length - 1])) {
    renderVertices.pop();
  }

  return flattenPointObjects(renderVertices);
};

export const getPlotRenderPointObjects = (plot) => toPointObjects(getPlotRenderPoints(plot));

export const getPlotShapeVertices = (plot) => {
  if (hasPolygonPoints(plot)) {
    return toPointObjects(getPlotPoints(plot));
  }

  const bounds = getPlotBounds(plot);

  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
};

export const getPlotBounds = (plot) => {
  const points = hasPolygonPoints(plot)
    ? getPlotRenderPoints(plot)
    : getPlotPoints(plot);

  if (points.length < 2) {
    if (
      isFiniteNumber(plot?.x)
      && isFiniteNumber(plot?.y)
      && isFiniteNumber(plot?.width)
      && isFiniteNumber(plot?.height)
    ) {
      return {
        x: plot.x,
        y: plot.y,
        width: plot.width,
        height: plot.height,
      };
    }

    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < points.length; index += 2) {
    const x = points[index];
    const y = points[index + 1];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getPolygonCentroid = (points) => {
  if (points.length < 6) {
    return null;
  }

  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    const currentX = points[index];
    const currentY = points[index + 1];
    const nextX = points[nextIndex];
    const nextY = points[nextIndex + 1];
    const cross = currentX * nextY - nextX * currentY;

    signedArea += cross;
    centroidX += (currentX + nextX) * cross;
    centroidY += (currentY + nextY) * cross;
  }

  if (Math.abs(signedArea) < 1e-6) {
    return null;
  }

  return {
    x: centroidX / (3 * signedArea),
    y: centroidY / (3 * signedArea),
  };
};

const getPolygonAreaFromPoints = (points) => {
  if (points.length < 6) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    area += points[index] * points[nextIndex + 1] - points[nextIndex] * points[index + 1];
  }

  return Math.abs(area / 2);
};

export const getPlotCenter = (plot) => {
  const points = hasPolygonPoints(plot)
    ? getPlotRenderPoints(plot)
    : getPlotPoints(plot);
  const centroid = getPolygonCentroid(points);

  if (centroid) {
    return centroid;
  }

  if (isFiniteNumber(plot?.centerX) && isFiniteNumber(plot?.centerY)) {
    return { x: plot.centerX, y: plot.centerY };
  }

  const bounds = getPlotBounds(plot);

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
};

export const getPlotAxisDimensionsFeet = (plot, pixelToFt = 1) => {
  const storedWidth = Number(plot?.plotWidth);
  const storedHeight = Number(plot?.plotHeight);

  return {
    widthFeet: Number.isFinite(storedWidth) && storedWidth > 0
      ? storedWidth
      : 0,
    heightFeet: Number.isFinite(storedHeight) && storedHeight > 0
      ? storedHeight
      : 0,
  };
};

export const getPlotAreaSqFt = (plot, pixelToFt = 1) => {
  const storedArea = Number(plot?.area);

  if (Number.isFinite(storedArea) && storedArea > 0) {
    return storedArea;
  }

  return 0;
};

export const getPlotAreaSqM = (plot, pixelToFt = 1) => (
  Number((getPlotAreaSqFt(plot, pixelToFt) * SQFT_TO_SQM).toFixed(2))
);

const getEdgeLengthMeterStore = (plot) => {
  if (plot?.edgeLengthsMeters instanceof Map) {
    return Object.fromEntries(plot.edgeLengthsMeters.entries());
  }

  if (plot?.edgeLengthsMeters && typeof plot.edgeLengthsMeters === "object") {
    return plot.edgeLengthsMeters;
  }

  return {};
};

export const getPolygonEdgeMeasurements = (plot, pixelToFt = 1) => {
  if (!hasPolygonPoints(plot)) {
    return [];
  }

  const vertices = getPlotShapeVertices(plot);
  const curveEdgeSet = new Set(getCurveEdgeIndexes(plot));
  const edgeLengthStore = getEdgeLengthMeterStore(plot);

  return vertices.map((startVertex, edgeIndex) => {
    const endVertex = vertices[(edgeIndex + 1) % vertices.length];
    const pixelLength = getDistanceBetweenPoints(startVertex, endVertex);
    const storedLengthMeters = Number(edgeLengthStore?.[edgeIndex]);
    const isCurved = curveEdgeSet.has(edgeIndex);
    const lengthMeters = !isCurved && Number.isFinite(storedLengthMeters) && storedLengthMeters > 0
      ? storedLengthMeters
      : 0;

    return {
      edgeIndex,
      label: getEdgeLabel(edgeIndex, vertices.length),
      start: startVertex,
      end: endVertex,
      midpoint: {
        x: (startVertex.x + endVertex.x) / 2,
        y: (startVertex.y + endVertex.y) / 2,
      },
      angleRadians: Math.atan2(endVertex.y - startVertex.y, endVertex.x - startVertex.x),
      pixelLength,
      isCurved,
      lengthMeters: Number.isFinite(lengthMeters) ? Number(lengthMeters.toFixed(2)) : null,
    };
  });
};

const formatMeasurementValue = (value) => {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (Math.abs(value - Math.round(value)) < 0.01) {
    return String(Math.round(value));
  }

  return value >= 10
    ? value.toFixed(1).replace(/\.0$/, "")
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

export const getPlotDimensionSummary = (plot, pixelToFt = 1) => {
  if (!plot) {
    return "";
  }

  if (hasPolygonPoints(plot)) {
    return getPolygonEdgeMeasurements(plot, pixelToFt)
      .filter((edge) => !edge.isCurved)
      .map((edge) => `${formatMeasurementValue(edge.lengthMeters)} m`)
      .join(", ");
  }

  const { widthFeet, heightFeet } = getPlotAxisDimensionsFeet(plot, pixelToFt);
  const widthMeters = widthFeet * FEET_TO_METERS;
  const heightMeters = heightFeet * FEET_TO_METERS;

  return `${formatMeasurementValue(widthMeters)} m x ${formatMeasurementValue(heightMeters)} m`;
};

export const getLayoutCropBounds = (layout) => {
  if (!layout || !layout.plots) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const includePoint = (x, y) => {
     minX = Math.min(minX, x);
     maxX = Math.max(maxX, x);
     minY = Math.min(minY, y);
     maxY = Math.max(maxY, y);
  };

  layout.plots.forEach(plot => {
    const renderPoints = getPlotRenderPoints(plot);

    if (renderPoints.length >= 6) {
      for (let i = 0; i < renderPoints.length; i += 2) {
         includePoint(renderPoints[i], renderPoints[i + 1]);
      }
    } else {
       includePoint(plot.x, plot.y);
       includePoint(plot.x + plot.width, plot.y + plot.height);
    }
  });

  if (layout.boundary && layout.boundary.length > 0) {
    for (let i = 0; i < layout.boundary.length; i += 2) {
       includePoint(layout.boundary[i], layout.boundary[i+1]);
    }
  }

  // Fallback if no valid points
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = layout.meta?.analysisWidth || 1000; maxY = layout.meta?.analysisHeight || 1000;
  }

  const padding = 2; // Exact border cropping
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  };
};

export const generateLayoutSVG = (layout) => {
  if (!layout || !layout.plots) return "";

  const crop = getLayoutCropBounds(layout);
  const width = crop.width;
  const height = crop.height;
  const offsetX = -crop.minX;
  const offsetY = -crop.minY;

  let bg = "";
  if (layout.boundary && layout.boundary.length >= 6) {
     let d = `M ${layout.boundary[0] + offsetX} ${layout.boundary[1] + offsetY} `;
     for (let i = 2; i < layout.boundary.length; i += 2) {
        d += `L ${layout.boundary[i] + offsetX} ${layout.boundary[i+1] + offsetY} `;
     }
     d += "Z";
     bg = `<path d="${d}" fill="${LAYOUT_MAP_COLORS.background}" stroke="${LAYOUT_MAP_COLORS.compoundWall}" stroke-width="2" />`;
  } else {
     bg = `<rect width="100%" height="100%" fill="${LAYOUT_MAP_COLORS.background}" rx="4"/>`;
  }

  const shapes = layout.plots.map(plot => {
    let d = "";
    const renderPoints = getPlotRenderPoints(plot);

    if (renderPoints.length >= 6) {
      d = `M ${renderPoints[0] + offsetX} ${renderPoints[1] + offsetY} `;
      for (let i = 2; i < renderPoints.length; i += 2) {
         d += `L ${renderPoints[i] + offsetX} ${renderPoints[i + 1] + offsetY} `;
      }
      d += "Z";
    } else {
      const px = plot.x + offsetX;
      const py = plot.y + offsetY;
      d = `M ${px} ${py} L ${px + plot.width} ${py} L ${px + plot.width} ${py + plot.height} L ${px} ${py + plot.height} Z`;
    }

    const fill = LAYOUT_STATUS_COLORS[plot.status] || LAYOUT_MAP_COLORS.plot;
    return `<path d="${d}" fill="${fill}" fill-opacity="1" stroke="${LAYOUT_MAP_COLORS.plotNumber}" stroke-width="2"/>`;
  }).join("\\n");

  const propsSvg = (layout.props || []).map(p => {
    const px = Math.round(p.x + offsetX);
    const py = Math.round(p.y + offsetY);
    const sc = Math.max(8, p.scaleX * 10);
    if (p.type === 'tree1') return `<circle cx="${px}" cy="${py}" r="${sc}" fill="${LAYOUT_MAP_COLORS.treeLeaf}" stroke="${LAYOUT_MAP_COLORS.compoundWall}" stroke-width="2"/>`;
    if (p.type === 'streetLight') return `<circle cx="${px}" cy="${py}" r="${sc * 0.4}" fill="#fde047" stroke="#854d0e" stroke-width="1.5"/>`;
    return `<rect x="${px - sc}" y="${py - sc}" width="${sc*2}" height="${sc*2}" fill="#9ca3af" stroke="#4b5563" stroke-width="2" rx="4"/>`;
  }).join("\\n");

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${bg}\\n${shapes}\\n${propsSvg}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
};
