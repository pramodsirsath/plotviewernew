export const LAYOUT_MAP_FONT_NAME = "Inria Sans";
export const LAYOUT_MAP_FONT_FAMILY = `"${LAYOUT_MAP_FONT_NAME}", "Inter", sans-serif`;

export const LAYOUT_MAP_COLORS = Object.freeze({
  background: "#232323",
  plot: "#cfc4aa",
  road: "#414141",
  grass: "#687e35",
  treeLeaf: "#70873a",
  compoundWall: "#676767",
  plotNumber: "#292929",
  roadTextAccent: "#cbcbcb",
  roadText: "#d1d1d1",
  // selectedPlot: "#2c86db",
  selectedPlot: "#cfc4aa",

  available: "#4275d1",
  reserved: "#c19d3d",
  sold: "#b45261",
  white: "#ffffff",
  shadow: "#000000",
});

export const LAYOUT_STATUS_COLORS = Object.freeze({
  Available: LAYOUT_MAP_COLORS.available,
  Reserved: LAYOUT_MAP_COLORS.reserved,
  Sold: LAYOUT_MAP_COLORS.sold,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeHex = (hex) => {
  if (typeof hex !== "string") {
    return "#000000";
  }

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return hex;
  }

  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.slice(1).split("").map((char) => `${char}${char}`).join("")}`;
  }

  return "#000000";
};

const hexToRgb = (hex) => {
  const safeHex = normalizeHex(hex);

  return {
    r: Number.parseInt(safeHex.slice(1, 3), 16),
    g: Number.parseInt(safeHex.slice(3, 5), 16),
    b: Number.parseInt(safeHex.slice(5, 7), 16),
  };
};

export const toRgba = (hex, alpha = 1) => {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

export const blendHexColors = (fromHex, toHex, progress) => {
  const ratio = clamp(progress, 0, 1);
  const fromRgb = hexToRgb(fromHex);
  const toRgb = hexToRgb(toHex);

  const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * ratio);
  const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * ratio);
  const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * ratio);

  return `rgb(${r}, ${g}, ${b})`;
};

export const getLayoutStatusStyle = (status) => {
  const solid = LAYOUT_STATUS_COLORS[status] || LAYOUT_STATUS_COLORS.Available;

  return {
    overlay: toRgba(solid, 0.16),
    text: solid,
    fill: toRgba(solid, 0.78),
    solid,
    selectedFill: LAYOUT_MAP_COLORS.selectedPlot,
  };
};

export const getLayoutStatusFill = (status, alpha = 0.5) => {
  const solid = LAYOUT_STATUS_COLORS[status] || LAYOUT_STATUS_COLORS.Available;

  return toRgba(solid, alpha);
};
