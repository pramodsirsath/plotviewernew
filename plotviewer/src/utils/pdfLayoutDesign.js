import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const CONTENT_DISTANCE_THRESHOLD = 22;
const OUTPUT_PADDING = 48;
const DEFAULT_SCALE = 2.8;

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const getBrightness = (red, green, blue) => 0.299 * red + 0.587 * green + 0.114 * blue;

const getColorDistance = (red, green, blue, reference) => (
  Math.abs(red - reference.red)
  + Math.abs(green - reference.green)
  + Math.abs(blue - reference.blue)
);

const sampleCorner = (pixels, width, height, xStart, yStart, size) => {
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let totalAlpha = 0;
  let samples = 0;

  for (let y = yStart; y < Math.min(yStart + size, height); y += 1) {
    for (let x = xStart; x < Math.min(xStart + size, width); x += 1) {
      const index = (y * width + x) * 4;
      totalRed += pixels[index];
      totalGreen += pixels[index + 1];
      totalBlue += pixels[index + 2];
      totalAlpha += pixels[index + 3];
      samples += 1;
    }
  }

  return {
    red: Math.round(totalRed / samples),
    green: Math.round(totalGreen / samples),
    blue: Math.round(totalBlue / samples),
    alpha: Math.round(totalAlpha / samples),
  };
};

const getBackgroundReference = (pixels, width, height) => {
  const sampleSize = Math.max(12, Math.min(40, Math.floor(Math.min(width, height) * 0.03)));
  const samples = [
    sampleCorner(pixels, width, height, 0, 0, sampleSize),
    sampleCorner(pixels, width, height, Math.max(width - sampleSize, 0), 0, sampleSize),
    sampleCorner(pixels, width, height, 0, Math.max(height - sampleSize, 0), sampleSize),
    sampleCorner(pixels, width, height, Math.max(width - sampleSize, 0), Math.max(height - sampleSize, 0), sampleSize),
  ];

  return samples.reduce(
    (accumulator, sample) => ({
      red: accumulator.red + sample.red / samples.length,
      green: accumulator.green + sample.green / samples.length,
      blue: accumulator.blue + sample.blue / samples.length,
      alpha: accumulator.alpha + sample.alpha / samples.length,
    }),
    { red: 0, green: 0, blue: 0, alpha: 0 }
  );
};

const findContentBounds = (sourceCanvas) => {
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const background = getBackgroundReference(pixels, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];

      if (alpha < 16) {
        continue;
      }

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const distance = getColorDistance(red, green, blue, background);

      if (distance < CONTENT_DISTANCE_THRESHOLD) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      x: 0,
      y: 0,
      width,
      height,
      background,
    };
  }

  return {
    x: Math.max(minX - OUTPUT_PADDING, 0),
    y: Math.max(minY - OUTPUT_PADDING, 0),
    width: Math.min(maxX - minX + OUTPUT_PADDING * 2, width),
    height: Math.min(maxY - minY + OUTPUT_PADDING * 2, height),
    background,
  };
};

const renderPresentationCanvas = (sourceCanvas, bounds) => {
  const isLightBackground = getBrightness(
    bounds.background.red,
    bounds.background.green,
    bounds.background.blue
  ) > 232;
  const presentationCanvas = createCanvas(bounds.width + OUTPUT_PADDING * 2, bounds.height + OUTPUT_PADDING * 2);
  const context = presentationCanvas.getContext("2d");

  if (isLightBackground) {
    context.fillStyle = "#232323";
    context.fillRect(0, 0, presentationCanvas.width, presentationCanvas.height);
  } else {
    context.fillStyle = `rgb(${bounds.background.red}, ${bounds.background.green}, ${bounds.background.blue})`;
    context.fillRect(0, 0, presentationCanvas.width, presentationCanvas.height);
  }

  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 32;
  context.shadowOffsetY = 10;
  context.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    OUTPUT_PADDING,
    OUTPUT_PADDING,
    bounds.width,
    bounds.height
  );

  return presentationCanvas;
};

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
      return;
    }

    reject(new Error("Could not create PNG blob from rendered PDF"));
  }, "image/png", 0.96);
});

const toSafeBaseName = (fileName) => fileName.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").replace(/-+/g, "-");

export const isPdfFile = (file) => {
  if (!file) {
    return false;
  }

  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
};

export const renderPdfAsLayoutDesign = async (file, options = {}) => {
  const scale = options.scale || DEFAULT_SCALE;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const sourceCanvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });

  await page.render({
    canvasContext: context,
    viewport,
    background: "rgb(255,255,255)",
  }).promise;

  const bounds = findContentBounds(sourceCanvas);
  const presentationCanvas = renderPresentationCanvas(sourceCanvas, bounds);
  const blob = await canvasToBlob(presentationCanvas);
  const baseName = toSafeBaseName(file.name || "layout");
  const outputFile = new File([blob], `${baseName}-layout-design.png`, {
    type: "image/png",
  });
  const previewUrl = URL.createObjectURL(blob);

  return {
    file: outputFile,
    previewUrl,
    pageCount: pdf.numPages,
    width: presentationCanvas.width,
    height: presentationCanvas.height,
    sourceType: "pdf",
  };
};
