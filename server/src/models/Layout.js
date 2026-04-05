const mongoose = require("mongoose");

const plotSchema = new mongoose.Schema({
  plotNo: String,
  plotWidth: String,
  plotHeight: String,
  area: Number,
  status: String,
  category: { type: String, default: "Standard" },   // Premium, Diamond, Standard, etc.
  rate: { type: Number, default: 0 },                 // Price per sq.ft or total

  x: Number,
  y: Number,
  width: Number,
  height: Number,
  points: [Number],
  isCurved: { type: Boolean, default: false },
  centerX: Number,
  centerY: Number,
});

const layoutSchema = new mongoose.Schema({
  imageUrl: String,
  name: String,

  // Analysis / 3D
  boundary: [Number],
  meta: {
    analysisWidth: Number,
    analysisHeight: Number,
  },
  props3D: [mongoose.Schema.Types.Mixed],

  plots: [plotSchema],

  // Builder assignment
  assignedBuilders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],

  // Public sharing
  isPublic: { type: Boolean, default: false },
  publicToken: String,

  // Google Maps location link
  locationUrl: { type: String, default: "" },

  // Front direction of layout in compass degrees (0-360, 0=North)
  frontDirection: { type: Number, default: 0 },

  // Map overlay data (admin positions the layout image on Google Maps)
  mapOverlay: {
    center: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    rotation: { type: Number, default: 0 },
    zoom: { type: Number, default: 18 },
    opacity: { type: Number, default: 0.7 },
    bounds: {
      north: Number,
      south: Number,
      east: Number,
      west: Number,
    },
  },

  // Gallery images
  galleryImages: [String],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Layout", layoutSchema);
