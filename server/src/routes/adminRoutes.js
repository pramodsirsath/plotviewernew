const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadMiddleware");
const { analyzeLayoutImage, uploadImage } = require("../controllers/uploadController");
const {
  saveLayout,
  getLayout,
  updateLayout3D,
  getAdminLayouts,
  assignBuilders,
  generatePublicLink,
  getBuilders,
  getPublicLayout,
  deleteLayout,
  updateLocation,
  updateDirection,
  updateMapOverlay,
  updateLayout,
} = require("../controllers/layoutController");

const { protect } = require("../middlewares/authMiddleware");
const { adminOnly } = require("../middlewares/adminMiddleware");

router.post("/upload-image", protect, adminOnly, upload.single("layout"), uploadImage);
router.post("/analyze-layout", protect, adminOnly, analyzeLayoutImage);
router.post("/upload-layout", protect, adminOnly, saveLayout);
router.put("/layouts/:id/3d", protect, adminOnly, updateLayout3D);
router.get("/layout/:id", getLayout);
router.put("/layouts/:id", protect, adminOnly, updateLayout);
router.delete("/layouts/:id", protect, adminOnly, deleteLayout);

router.get("/users/builders", protect, adminOnly, getBuilders);
router.get("/layouts/admin", protect, adminOnly, getAdminLayouts);

router.post("/layouts/:id/assign", protect, adminOnly, assignBuilders);
router.get("/layouts/public/:token", getPublicLayout);
router.post("/layouts/:id/public", protect, adminOnly, generatePublicLink);

// New admin routes
router.put("/layouts/:id/location", protect, adminOnly, updateLocation);
router.put("/layouts/:id/direction", protect, adminOnly, updateDirection);
router.put("/layouts/:id/map-overlay", protect, adminOnly, updateMapOverlay);

module.exports = router;
