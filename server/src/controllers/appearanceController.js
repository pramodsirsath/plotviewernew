const AppearanceTheme = require("../models/AppearanceTheme");

const DEFAULT_APPEARANCE_THEME = Object.freeze({
  palette: {
    background: "#222222",
    plot: "#cfc4ab",
    road: "#4E4F55",
    grass: "#687E35",
    plotBorder: "#000000",
    plotNumber: "#292929",
    compoundWall: "#676767",
  },
  render: {
    preset: "balanced",
    brightness: 1,
    contrast: 1,
    sharpness: 1,
    borderThickness: 1,
  },
});

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PALETTE_KEYS = Object.keys(DEFAULT_APPEARANCE_THEME.palette);
const RENDER_KEYS = Object.keys(DEFAULT_APPEARANCE_THEME.render);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeColor = (value, fallback) => (
  typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback
);

const RENDER_RANGES = Object.freeze({
  brightness: [0.85, 1.35],
  contrast: [0.85, 1.35],
  sharpness: [0.85, 1.35],
  borderThickness: [0.75, 1.6],
});

const normalizeRenderValue = (key, value, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const [minValue, maxValue] = RENDER_RANGES[key] || [0.85, 1.35];
  return clamp(numericValue, minValue, maxValue);
};

const normalizeAppearancePayload = (payload = {}) => {
  const nextPalette = {};
  const nextRender = {};

  PALETTE_KEYS.forEach((key) => {
    nextPalette[key] = normalizeColor(
      payload?.palette?.[key],
      DEFAULT_APPEARANCE_THEME.palette[key]
    );
  });

  const preset = typeof payload?.render?.preset === "string" && payload.render.preset.trim()
    ? payload.render.preset.trim()
    : DEFAULT_APPEARANCE_THEME.render.preset;

  nextRender.preset = preset;

  RENDER_KEYS.filter((key) => key !== "preset").forEach((key) => {
    nextRender[key] = normalizeRenderValue(
      key,
      payload?.render?.[key],
      DEFAULT_APPEARANCE_THEME.render[key]
    );
  });

  return {
    palette: nextPalette,
    render: nextRender,
  };
};

const toAppearanceResponse = (themeDocument) => {
  const normalizedTheme = normalizeAppearancePayload(themeDocument || {});

  return {
    palette: normalizedTheme.palette,
    render: normalizedTheme.render,
    updatedAt: themeDocument?.updatedAt || null,
  };
};

exports.getAppearanceTheme = async (req, res) => {
  try {
    const theme = await AppearanceTheme.findOne({ key: "global" }).lean();
    res.json(toAppearanceResponse(theme));
  } catch (error) {
    console.error("Get Appearance Theme Error:", error);
    res.status(500).json({ message: "Failed to fetch appearance theme" });
  }
};

exports.updateAppearanceTheme = async (req, res) => {
  try {
    const payload = normalizeAppearancePayload(req.body);
    const theme = await AppearanceTheme.findOneAndUpdate(
      { key: "global" },
      {
        key: "global",
        palette: payload.palette,
        render: payload.render,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({
      message: "Appearance theme updated successfully",
      ...toAppearanceResponse(theme),
    });
  } catch (error) {
    console.error("Update Appearance Theme Error:", error);
    res.status(500).json({ message: "Failed to update appearance theme" });
  }
};
