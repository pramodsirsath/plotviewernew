import {
  LAYOUT_MAP_COLORS,
  LAYOUT_STATUS_COLORS,
} from "../theme/layoutMapTheme";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export const getPlotPoints = (plot) => {
  if (!Array.isArray(plot?.points)) {
    return [];
  }

  return plot.points.filter(isFiniteNumber);
};

export const hasPolygonPoints = (plot) => getPlotPoints(plot).length >= 6;

export const getPlotBounds = (plot) => {
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

  const points = getPlotPoints(plot);

  if (points.length < 2) {
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

export const getPlotCenter = (plot) => {
  if (isFiniteNumber(plot?.centerX) && isFiniteNumber(plot?.centerY)) {
    return { x: plot.centerX, y: plot.centerY };
  }

  const points = getPlotPoints(plot);
  const centroid = getPolygonCentroid(points);

  if (centroid) {
    return centroid;
  }

  const bounds = getPlotBounds(plot);

  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
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
    if (plot.points && plot.points.length >= 6) {
      for (let i = 0; i < plot.points.length; i += 2) {
         includePoint(plot.points[i], plot.points[i+1]);
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
    if (plot.points && plot.points.length >= 6) {
      d = `M ${plot.points[0] + offsetX} ${plot.points[1] + offsetY} `;
      for (let i = 2; i < plot.points.length; i += 2) {
         d += `L ${plot.points[i] + offsetX} ${plot.points[i+1] + offsetY} `;
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
