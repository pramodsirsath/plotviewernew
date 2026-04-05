const MAX_ANALYSIS_SIDE = 1400;
const MIN_COMPONENT_AREA = 220;
const MIN_BOX_SIDE = 16;
const MIN_FILL_RATIO = 0.28;
const MIN_BORDER_SCORE = 0.3;
const MAX_PLOT_AREA_RATIO = 0.24;
const MAX_ASPECT_RATIO = 10;

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const scaleImage = (image) => {
  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > MAX_ANALYSIS_SIDE
    ? MAX_ANALYSIS_SIDE / longestSide
    : 1;

  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  context.drawImage(image, 0, 0, width, height);

  return {
    canvas,
    width,
    height,
    scaleX: image.width / width,
    scaleY: image.height / height,
  };
};

const getGrayscaleData = (context, width, height) => {
  const pixels = context.getImageData(0, 0, width, height).data;
  const grayscale = new Uint8ClampedArray(width * height);
  const histogram = new Uint32Array(256);

  for (let sourceIndex = 0, pixelIndex = 0; pixelIndex < grayscale.length; pixelIndex += 1, sourceIndex += 4) {
    const gray = Math.round(
      pixels[sourceIndex] * 0.299
      + pixels[sourceIndex + 1] * 0.587
      + pixels[sourceIndex + 2] * 0.114
    );

    grayscale[pixelIndex] = gray;
    histogram[gray] += 1;
  }

  return { grayscale, histogram };
};

const getOtsuThreshold = (histogram, totalPixels) => {
  let total = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    total += value * histogram[value];
  }

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let threshold = 160;

  for (let value = 0; value < histogram.length; value += 1) {
    weightBackground += histogram[value];

    if (weightBackground === 0) {
      continue;
    }

    const weightForeground = totalPixels - weightBackground;

    if (weightForeground === 0) {
      break;
    }

    sumBackground += value * histogram[value];

    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (total - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  return Math.min(Math.max(threshold + 8, 90), 210);
};

const dilateMask = (source, width, height) => {
  const next = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let isDark = 0;

      for (let offsetY = -1; offsetY <= 1 && !isDark; offsetY += 1) {
        const nextY = y + offsetY;

        if (nextY < 0 || nextY >= height) {
          continue;
        }

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nextX = x + offsetX;

          if (nextX < 0 || nextX >= width) {
            continue;
          }

          if (source[nextY * width + nextX]) {
            isDark = 1;
            break;
          }
        }
      }

      next[y * width + x] = isDark;
    }
  }

  return next;
};

const erodeMask = (source, width, height) => {
  const next = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let isDark = 1;

      for (let offsetY = -1; offsetY <= 1 && isDark; offsetY += 1) {
        const nextY = y + offsetY;

        if (nextY < 0 || nextY >= height) {
          isDark = 0;
          break;
        }

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const nextX = x + offsetX;

          if (nextX < 0 || nextX >= width || !source[nextY * width + nextX]) {
            isDark = 0;
            break;
          }
        }
      }

      next[y * width + x] = isDark;
    }
  }

  return next;
};

const closeMask = (source, width, height) => erodeMask(dilateMask(source, width, height), width, height);

const sampleDarkPixel = (mask, width, height, x, y) => {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return 0;
  }

  return mask[y * width + x];
};

const getBorderScore = (mask, width, height, component) => {
  const left = Math.max(component.minX - 1, 0);
  const right = Math.min(component.maxX + 1, width - 1);
  const top = Math.max(component.minY - 1, 0);
  const bottom = Math.min(component.maxY + 1, height - 1);
  let darkSamples = 0;
  let totalSamples = 0;

  for (let x = left; x <= right; x += 1) {
    darkSamples += sampleDarkPixel(mask, width, height, x, top);
    darkSamples += sampleDarkPixel(mask, width, height, x, bottom);
    totalSamples += 2;
  }

  for (let y = top + 1; y < bottom; y += 1) {
    darkSamples += sampleDarkPixel(mask, width, height, left, y);
    darkSamples += sampleDarkPixel(mask, width, height, right, y);
    totalSamples += 2;
  }

  return totalSamples ? darkSamples / totalSamples : 0;
};

const intersects = (first, second) => {
  return !(
    first.maxX < second.minX
    || second.maxX < first.minX
    || first.maxY < second.minY
    || second.maxY < first.minY
  );
};

const mergeNearbyBoxes = (components) => {
  const merged = [];

  components
    .sort((first, second) => second.area - first.area)
    .forEach((component) => {
      const existing = merged.find((entry) => {
        const horizontalGap = Math.max(
          0,
          Math.max(entry.minX - component.maxX, component.minX - entry.maxX)
        );
        const verticalGap = Math.max(
          0,
          Math.max(entry.minY - component.maxY, component.minY - entry.maxY)
        );

        return intersects(entry, component)
          || (
            horizontalGap <= 4
            && verticalGap <= 4
            && Math.abs(entry.width - component.width) <= 10
            && Math.abs(entry.height - component.height) <= 10
          );
      });

      if (!existing) {
        merged.push({ ...component });
        return;
      }

      const mergedMinX = Math.min(existing.minX, component.minX);
      const mergedMinY = Math.min(existing.minY, component.minY);
      const mergedMaxX = Math.max(existing.maxX, component.maxX);
      const mergedMaxY = Math.max(existing.maxY, component.maxY);

      existing.minX = mergedMinX;
      existing.minY = mergedMinY;
      existing.maxX = mergedMaxX;
      existing.maxY = mergedMaxY;
      existing.width = mergedMaxX - mergedMinX + 1;
      existing.height = mergedMaxY - mergedMinY + 1;
      existing.area += component.area;
      existing.pixels = [...existing.pixels, ...component.pixels];
      existing.fillRatio = existing.area / (existing.width * existing.height);
      existing.borderScore = Math.max(existing.borderScore, component.borderScore);
    });

  return merged;
};

const collectEnclosedComponents = (mask, width, height) => {
  const size = width * height;
  const outside = new Uint8Array(size);
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);

  let head = 0;
  let tail = 0;

  const enqueueOutside = (index) => {
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    const top = x;
    const bottom = (height - 1) * width + x;

    if (!mask[top] && !outside[top]) {
      enqueueOutside(top);
    }

    if (!mask[bottom] && !outside[bottom]) {
      enqueueOutside(bottom);
    }
  }

  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = left + width - 1;

    if (!mask[left] && !outside[left]) {
      enqueueOutside(left);
    }

    if (!mask[right] && !outside[right]) {
      enqueueOutside(right);
    }
  }

  while (head < tail) {
    const current = queue[head];
    head += 1;

    const x = current % width;
    const y = Math.floor(current / width);
    const neighbors = [
      current - 1,
      current + 1,
      current - width,
      current + width,
    ];

    for (let index = 0; index < neighbors.length; index += 1) {
      const next = neighbors[index];

      if (next < 0 || next >= size || outside[next] || mask[next]) {
        continue;
      }

      if (
        (index === 0 && x === 0)
        || (index === 1 && x === width - 1)
        || (index === 2 && y === 0)
        || (index === 3 && y === height - 1)
      ) {
        continue;
      }

      outside[next] = 1;
      queue[tail] = next;
      tail += 1;
    }
  }

  const components = [];

  for (let start = 0; start < size; start += 1) {
    if (mask[start] || outside[start] || visited[start]) {
      continue;
    }

    head = 0;
    tail = 0;
    visited[start] = 1;
    queue[tail] = start;
    tail += 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const pixels = [];

    while (head < tail) {
      const current = queue[head];
      head += 1;
      area += 1;
      pixels.push(current);

      const x = current % width;
      const y = Math.floor(current / width);

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x > 0) {
        const next = current - 1;
        if (!mask[next] && !outside[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      if (x < width - 1) {
        const next = current + 1;
        if (!mask[next] && !outside[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      if (y > 0) {
        const next = current - width;
        if (!mask[next] && !outside[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }

      if (y < height - 1) {
        const next = current + width;
        if (!mask[next] && !outside[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }

    components.push({
      area,
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels,
    });
  }

  return components;
};

const getPointKey = (point) => `${point.x},${point.y}`;

const getLoopArea = (points) => {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const nextPoint = points[(index + 1) % points.length];
    area += points[index].x * nextPoint.y - nextPoint.x * points[index].y;
  }

  return area / 2;
};

const removeDuplicateClosingPoint = (points) => {
  if (points.length < 2) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (first.x === last.x && first.y === last.y) {
    return points.slice(0, -1);
  }

  return points;
};

const removeCollinearPoints = (points) => {
  if (points.length < 4) {
    return points;
  }

  const cleaned = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross =
      (current.x - previous.x) * (next.y - current.y)
      - (current.y - previous.y) * (next.x - current.x);

    if (Math.abs(cross) > 0.02) {
      cleaned.push(current);
    }
  }

  return cleaned.length >= 3 ? cleaned : points;
};

const getDistanceToSegment = (point, start, end) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (deltaX === 0 && deltaY === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = (
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY)
    / (deltaX ** 2 + deltaY ** 2)
  );
  const t = Math.max(0, Math.min(1, projection));
  const projectedX = start.x + deltaX * t;
  const projectedY = start.y + deltaY * t;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
};

const simplifyOpenPoints = (points, epsilon) => {
  if (points.length <= 2) {
    return points;
  }

  let furthestIndex = 0;
  let maxDistance = -1;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = getDistanceToSegment(
      points[index],
      points[0],
      points[points.length - 1]
    );

    if (distance > maxDistance) {
      maxDistance = distance;
      furthestIndex = index;
    }
  }

  if (maxDistance <= epsilon) {
    return [points[0], points[points.length - 1]];
  }

  const left = simplifyOpenPoints(points.slice(0, furthestIndex + 1), epsilon);
  const right = simplifyOpenPoints(points.slice(furthestIndex), epsilon);

  return [...left.slice(0, -1), ...right];
};

const simplifyPolygonPoints = (points, epsilon) => {
  const withoutDuplicateEnd = removeDuplicateClosingPoint(points);
  const withoutCollinear = removeCollinearPoints(withoutDuplicateEnd);

  if (withoutCollinear.length < 4) {
    return withoutCollinear;
  }

  const simplifiedOpen = simplifyOpenPoints(
    [...withoutCollinear, withoutCollinear[0]],
    epsilon
  );
  const simplifiedClosed = removeCollinearPoints(simplifiedOpen.slice(0, -1));

  return simplifiedClosed.length >= 3 ? simplifiedClosed : withoutCollinear;
};

const getFlatPointBounds = (points) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < points.length; index += 2) {
    minX = Math.min(minX, points[index]);
    minY = Math.min(minY, points[index + 1]);
    maxX = Math.max(maxX, points[index]);
    maxY = Math.max(maxY, points[index + 1]);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getFlatPointCentroid = (points) => {
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
    const bounds = getFlatPointBounds(points);
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  return {
    x: centroidX / (3 * signedArea),
    y: centroidY / (3 * signedArea),
  };
};

const buildComponentPolygon = (component, width, height, scaleX, scaleY) => {
  const pixelSet = new Set(component.pixels);
  const edgeMap = new Map();

  const addEdge = (startX, startY, endX, endY) => {
    const key = `${startX},${startY}`;
    const nextPoint = { x: endX, y: endY };

    if (edgeMap.has(key)) {
      edgeMap.get(key).push(nextPoint);
      return;
    }

    edgeMap.set(key, [nextPoint]);
  };

  component.pixels.forEach((pixel) => {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const hasTop = y > 0 && pixelSet.has(pixel - width);
    const hasRight = x < width - 1 && pixelSet.has(pixel + 1);
    const hasBottom = y < height - 1 && pixelSet.has(pixel + width);
    const hasLeft = x > 0 && pixelSet.has(pixel - 1);

    if (!hasTop) {
      addEdge(x, y, x + 1, y);
    }

    if (!hasRight) {
      addEdge(x + 1, y, x + 1, y + 1);
    }

    if (!hasBottom) {
      addEdge(x + 1, y + 1, x, y + 1);
    }

    if (!hasLeft) {
      addEdge(x, y + 1, x, y);
    }
  });

  const loops = [];

  while (edgeMap.size) {
    const [startKey, nextPoints] = edgeMap.entries().next().value;
    const [startX, startY] = startKey.split(",").map(Number);
    const loop = [{ x: startX, y: startY }];
    const firstNextPoint = nextPoints.pop();

    if (!nextPoints.length) {
      edgeMap.delete(startKey);
    }

    loop.push(firstNextPoint);

    let currentKey = getPointKey(firstNextPoint);

    while (currentKey !== startKey) {
      const nextList = edgeMap.get(currentKey);

      if (!nextList?.length) {
        break;
      }

      const nextPoint = nextList.pop();

      if (!nextList.length) {
        edgeMap.delete(currentKey);
      }

      loop.push(nextPoint);
      currentKey = getPointKey(nextPoint);
    }

    if (loop.length > 4) {
      loops.push(loop);
    }
  }

  if (!loops.length) {
    return null;
  }

  const primaryLoop = [...loops].sort(
    (first, second) => Math.abs(getLoopArea(second)) - Math.abs(getLoopArea(first))
  )[0];
  const epsilon = Math.max(2.5, Math.min(component.width, component.height) * 0.05);
  const simplifiedLoop = simplifyPolygonPoints(primaryLoop, epsilon);

  if (simplifiedLoop.length < 3) {
    return null;
  }

  return simplifiedLoop.flatMap((point) => [
    Number((point.x * scaleX).toFixed(2)),
    Number((point.y * scaleY).toFixed(2)),
  ]);
};

const sortPlots = (plots) => {
  if (plots.length <= 1) {
    return plots;
  }

  const averageHeight = plots.reduce((sum, plot) => sum + plot.height, 0) / plots.length;
  const rowSize = Math.max(24, averageHeight * 0.85);

  return [...plots].sort((first, second) => {
    const firstRow = Math.round(first.y / rowSize);
    const secondRow = Math.round(second.y / rowSize);

    if (firstRow !== secondRow) {
      return firstRow - secondRow;
    }

    if (Math.abs(first.y - second.y) > rowSize * 0.45) {
      return first.y - second.y;
    }

    return first.x - second.x;
  });
};

const buildPlotRecord = (component, index, width, height, scaleX, scaleY) => {
  const points = buildComponentPolygon(component, width, height, scaleX, scaleY);
  const bounds = points?.length
    ? getFlatPointBounds(points)
    : {
        x: Math.round(component.minX * scaleX),
        y: Math.round(component.minY * scaleY),
        width: Math.max(20, Math.round(component.width * scaleX)),
        height: Math.max(20, Math.round(component.height * scaleY)),
      };
  const center = points?.length
    ? getFlatPointCentroid(points)
    : {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };

  return {
    id: `auto-${index + 1}`,
    x: bounds.x,
    y: bounds.y,
    width: Math.max(20, bounds.width),
    height: Math.max(20, bounds.height),
    points: points || [],
    centerX: Number(center.x.toFixed(2)),
    centerY: Number(center.y.toFixed(2)),
    plotNo: String(index + 1),
    plotWidth: "",
    plotHeight: "",
    area: 0,
    status: "Available",
  };
};

export const detectPlotsFromImage = async (image) => {
  const { canvas, width, height, scaleX, scaleY } = scaleImage(image);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { grayscale, histogram } = getGrayscaleData(context, width, height);
  const threshold = getOtsuThreshold(histogram, width * height);
  const darkMask = new Uint8Array(width * height);

  for (let index = 0; index < grayscale.length; index += 1) {
    darkMask[index] = grayscale[index] < threshold ? 1 : 0;
  }

  const closedMask = closeMask(darkMask, width, height);
  const maxPlotArea = width * height * MAX_PLOT_AREA_RATIO;

  const filteredComponents = collectEnclosedComponents(closedMask, width, height)
    .filter((component) => {
      if (
        component.area < MIN_COMPONENT_AREA
        || component.width < MIN_BOX_SIDE
        || component.height < MIN_BOX_SIDE
        || component.area > maxPlotArea
      ) {
        return false;
      }

      const fillRatio = component.area / (component.width * component.height);

      if (fillRatio < MIN_FILL_RATIO) {
        return false;
      }

      const aspectRatio = Math.max(
        component.width / component.height,
        component.height / component.width
      );

      if (aspectRatio > MAX_ASPECT_RATIO) {
        return false;
      }

      const borderScore = getBorderScore(closedMask, width, height, component);

      if (borderScore < MIN_BORDER_SCORE) {
        return false;
      }

      return true;
    })
    .map((component) => ({
      ...component,
      fillRatio: component.area / (component.width * component.height),
      borderScore: getBorderScore(closedMask, width, height, component),
    }));

  const mergedComponents = mergeNearbyBoxes(filteredComponents);
  const sortedPlots = sortPlots(
    mergedComponents.map((component, index) => buildPlotRecord(component, index, width, height, scaleX, scaleY))
  ).map((plot, index) => ({
    ...plot,
    id: `auto-${index + 1}`,
    plotNo: String(index + 1),
  }));

  return {
    plots: sortedPlots,
    threshold,
    scaledWidth: width,
    scaledHeight: height,
  };
};
