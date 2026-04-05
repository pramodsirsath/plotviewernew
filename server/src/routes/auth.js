const express = require("express");
const router = express.Router();

const {
  sendOTP,
  verifyOTP,
  login,
  getProfile
} = require("../controllers/authController");

const { protect } = require("../middlewares/authMiddleware");

router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.get("/profile", protect, getProfile);

module.exports = router;