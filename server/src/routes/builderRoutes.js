const express = require("express");
const router = express.Router();
const upload = require("../middlewares/uploadMiddleware");

const {
  getBuilderLayouts,
  getBuilderLayoutById,
  updatePlotStatus,
  getStaffRequests,
  getMyStaff,
  approveStaff,
  rejectStaff,
  uploadGalleryImages,
  getGalleryImages,
  deleteGalleryImage,
  updateWhatsappNumber,
} = require("../controllers/builderController");

const {
  addVisitedCustomer,
  getVisitedCustomers,
  exportCustomersCSV,
  exportToGoogleSheets,
} = require("../controllers/customerController");

const { protect } = require("../middlewares/authMiddleware");
const { builderOrStaff } = require("../middlewares/builderMiddleware");

// Layout routes
router.get("/getLayouts", protect, builderOrStaff, getBuilderLayouts);
router.get("/layouts/:id", protect, builderOrStaff, getBuilderLayoutById);
router.patch("/plot-status", protect, builderOrStaff, updatePlotStatus);

// Staff management (builder only)
router.get("/staff-requests", protect, builderOrStaff, getStaffRequests);
router.get("/my-staff", protect, builderOrStaff, getMyStaff);
router.post("/approve-staff/:staffId", protect, builderOrStaff, approveStaff);
router.post("/reject-staff/:staffId", protect, builderOrStaff, rejectStaff);

// Gallery
router.post("/layouts/:id/gallery", protect, builderOrStaff, upload.array("gallery", 20), uploadGalleryImages);
router.get("/layouts/:id/gallery", protect, builderOrStaff, getGalleryImages);
router.delete("/layouts/:id/gallery/:imageIndex", protect, builderOrStaff, deleteGalleryImage);

// Visited customers
router.post("/visited-customer", protect, builderOrStaff, addVisitedCustomer);
router.get("/visited-customers/:layoutId", protect, builderOrStaff, getVisitedCustomers);
router.get("/visited-customers/:layoutId/export-csv", protect, builderOrStaff, exportCustomersCSV);
router.post("/visited-customers/:layoutId/export-sheets", protect, builderOrStaff, exportToGoogleSheets);

// WhatsApp
router.put("/whatsapp-number", protect, builderOrStaff, updateWhatsappNumber);

module.exports = router;
