import { NoToneMapping } from "three";
import { GLOBAL_COLORS } from "./globalColors";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeColor = (value, fallback) => (
  typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback
);

const normalizeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const RENDER_RANGES = Object.freeze({
  brightness: [0.85, 1.35],
  contrast: [0.85, 1.35],
  sharpness: [0.85, 1.35],
  borderThickness: [0, 1.6],
});

export const LAYOUT_APPEARANCE_COLOR_FIELDS = Object.freeze([
  { key: "plot", label: "Plots" },
  { key: "road", label: "Roads" },
  { key: "grass", label: "Grass / Open Areas" },
  { key: "plotBorder", label: "Plot Borders" },
  { key: "plotNumber", label: "Plot Labels" },
  { key: "compoundWall", label: "Compound Wall" },
  { key: "background", label: "Scene Background" },
]);

export const LAYOUT_APPEARANCE_PRESETS = Object.freeze([
  {
    id: "balanced",
    label: "Balanced",
    description: "Closest to the current clean layout look.",
    render: { brightness: 1, contrast: 1, sharpness: 1 },
  },
  {
    id: "bright",
    label: "Bright",
    description: "Lifts the scene a bit for a more vivid layout.",
    render: { brightness: 1.12, contrast: 1.04, sharpness: 1.02 },
  },
  {
    id: "crisp",
    label: "Crisp",
    description: "Sharper lines and a slightly stronger layout contrast.",
    render: { brightness: 1.04, contrast: 1.12, sharpness: 1.16 },
  },
]);

const PRESET_LOOKUP = LAYOUT_APPEARANCE_PRESETS.reduce((lookup, preset) => {
  lookup[preset.id] = preset;
  return lookup;
}, {});

export const DEFAULT_LAYOUT_APPEARANCE = Object.freeze({
  palette: {
    background: GLOBAL_COLORS.background,
    plot: GLOBAL_COLORS.plot,
    road: GLOBAL_COLORS.road,
    grass: GLOBAL_COLORS.grass,
    plotBorder: GLOBAL_COLORS.plotBorder,
    plotNumber: GLOBAL_COLORS.plotNumber,
    compoundWall: GLOBAL_COLORS.compoundWall,
  },
  render: {
    preset: "balanced",
    brightness: 1,
    contrast: 1,
    sharpness: 1,
    borderThickness: 1,
  },
});

const getPreset = (presetId) => PRESET_LOOKUP[presetId] || PRESET_LOOKUP.balanced;

export const extractLayoutAppearancePayload = (themeInput = DEFAULT_LAYOUT_APPEARANCE) => {
  const source = themeInput?.appearance || themeInput;
  const paletteSource = source?.palette || {};
  const renderSource = source?.render || {};
  const preset = getPreset(renderSource.preset);

  return {
    palette: {
      background: normalizeColor(paletteSource.background, DEFAULT_LAYOUT_APPEARANCE.palette.background),
      plot: normalizeColor(paletteSource.plot, DEFAULT_LAYOUT_APPEARANCE.palette.plot),
      road: normalizeColor(paletteSource.road, DEFAULT_LAYOUT_APPEARANCE.palette.road),
      grass: normalizeColor(paletteSource.grass, DEFAULT_LAYOUT_APPEARANCE.palette.grass),
      plotBorder: normalizeColor(paletteSource.plotBorder, DEFAULT_LAYOUT_APPEARANCE.palette.plotBorder),
      plotNumber: normalizeColor(paletteSource.plotNumber, DEFAULT_LAYOUT_APPEARANCE.palette.plotNumber),
      compoundWall: normalizeColor(paletteSource.compoundWall, DEFAULT_LAYOUT_APPEARANCE.palette.compoundWall),
    },
    render: {
      preset: preset.id,
      brightness: clamp(normalizeNumber(renderSource.brightness, preset.render.brightness), ...RENDER_RANGES.brightness),
      contrast: clamp(normalizeNumber(renderSource.contrast, preset.render.contrast), ...RENDER_RANGES.contrast),
      sharpness: clamp(normalizeNumber(renderSource.sharpness, preset.render.sharpness), ...RENDER_RANGES.sharpness),
      borderThickness: clamp(
        normalizeNumber(renderSource.borderThickness, DEFAULT_LAYOUT_APPEARANCE.render.borderThickness),
        ...RENDER_RANGES.borderThickness
      ),
    },
  };
};

export const resolveLayoutAppearance = (themeInput = DEFAULT_LAYOUT_APPEARANCE) => {
  const appearance = extractLayoutAppearancePayload(themeInput);
  const palette = appearance.palette;
  const render = appearance.render;

  return {
    ...GLOBAL_COLORS,
    background: palette.background,
    plot: palette.plot,
    selectedPlot: palette.plot,
    road: palette.road,
    grass: palette.grass,
    nonPlotBlock: palette.grass,
    plotBorder: palette.plotBorder,
    plotNumber: palette.plotNumber,
    compoundWall: palette.compoundWall,
    render,
    appearance,
  };
};

export const DEFAULT_RESOLVED_LAYOUT_THEME = resolveLayoutAppearance(DEFAULT_LAYOUT_APPEARANCE);

export const applyLayoutAppearancePreset = (themeInput, presetId) => {
  const appearance = extractLayoutAppearancePayload(themeInput);
  const preset = getPreset(presetId);

  return resolveLayoutAppearance({
    palette: appearance.palette,
    render: {
      preset: preset.id,
      brightness: preset.render.brightness,
      contrast: preset.render.contrast,
      sharpness: preset.render.sharpness,
      borderThickness: appearance.render.borderThickness,
    },
  });
};

export const getLayoutRenderProfile = (
  themeInput,
  { isCoarsePointer = false, isConstrainedDevice = false, isMobileDevice = false } = {}
) => {
  const theme = resolveLayoutAppearance(themeInput);
  const { brightness, contrast, sharpness, borderThickness } = theme.render;
  const brightnessDelta = brightness - 1;
  const contrastDelta = contrast - 1;
  const sharpnessDelta = sharpness - 1;

  const nativeDpr = typeof window !== "undefined" ? (window.devicePixelRatio || 2) : 2;

  // Treat any coarse-pointer as mobile for rendering purposes
  const effectiveMobile = isMobileDevice || isCoarsePointer;
  const baseBorderWidth = (1.0 + contrastDelta * 1.2 + sharpnessDelta * 0.8) * borderThickness;
  const borderWidth = clamp(
    effectiveMobile ? baseBorderWidth * 0.48 : baseBorderWidth,
    0,
    effectiveMobile ? 1.15 : 2.5
  );

  // --- DPR: drastically lowered on mobile to prevent browser crashes ---
  let dpr;
  if (isConstrainedDevice) {
    // Low-end mobile: cap at 1.5 — prevents OOM crashes
    dpr = [1, clamp(Math.min(nativeDpr, 1.5), 1, 1.5)];
  } else if (effectiveMobile) {
    // Mid-range mobile: cap at 2
    dpr = [1, clamp(Math.min(nativeDpr, 2), 1, 2)];
  } else {
    // Desktop: full quality
    dpr = [1.5, clamp(Math.min(nativeDpr, 3) + sharpnessDelta * 1, 2, 3)];
  }

  return {
    dpr,
    // Disable antialiasing on constrained devices to save GPU memory
    antialias: !isConstrainedDevice,
    // NoToneMapping: crisp accurate colors — no cinematic wash/haze like ACES.
    toneMapping: NoToneMapping,
    exposure: 1,
    ambientIntensity: clamp(0.95 + brightnessDelta * 0.8, 0.65, 1.4),
    hemisphereIntensity: clamp(0.55 + brightnessDelta * 0.6, 0.3, 1),
    directionalIntensity: clamp(0.85 + brightnessDelta * 0.9, 0.6, 1.5),
    plotRoughness: clamp(0.62 - contrastDelta * 0.6, 0.25, 0.82),
    roadRoughness: clamp(0.72 - contrastDelta * 0.5, 0.35, 0.88),
    wallRoughness: clamp(0.65 - contrastDelta * 0.45, 0.3, 0.8),
    // --- Thin borders: base reduced from 2.2 → 1.0, clamp max lowered ---
    borderWidth,
    labelSharpness: clamp(
      isConstrainedDevice ? sharpness * 1.02 : effectiveMobile ? sharpness * 1.12 : sharpness * 1.1,
      0.95,
      1.4
    ),
    plotLabelColor: theme.plotNumber,
    selectedPlotLabelColor: theme.white,
    plotLabelFontWeight: 700,
    plotLabelOutlineColor: null,
    plotLabelOutlineWidth: 0,
    plotLabelMinSize: isConstrainedDevice ? 0.46 : effectiveMobile ? 0.5 : 0.4,
    plotLabelMaxSize: isConstrainedDevice ? 2.15 : effectiveMobile ? 2.6 : 2.5,
    plotLabelRenderMode: "html",
    useHtmlPlotBorder: !effectiveMobile,
  };
};
