const mongoose = require("mongoose");

const DEFAULT_RENDER_VALUE = 1;

const appearanceThemeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      trim: true,
    },
    palette: {
      background: { type: String, default: "" },
      plot: { type: String, default: "" },
      road: { type: String, default: "" },
      grass: { type: String, default: "" },
      plotBorder: { type: String, default: "" },
      plotNumber: { type: String, default: "" },
      compoundWall: { type: String, default: "" },
    },
    render: {
      preset: { type: String, default: "balanced" },
      brightness: { type: Number, default: DEFAULT_RENDER_VALUE },
      contrast: { type: Number, default: DEFAULT_RENDER_VALUE },
      sharpness: { type: Number, default: DEFAULT_RENDER_VALUE },
      borderThickness: { type: Number, default: DEFAULT_RENDER_VALUE },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AppearanceTheme", appearanceThemeSchema);
