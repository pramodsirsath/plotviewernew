const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

// ================= SEND OTP =================
exports.sendOTP = async (req, res) => {
  try {
    const { name, mobile, email, password, role, builderEmail } = req.body;
    const signupRole = role === "staff" ? "staff" : "builder";

    const existing = await User.findOne({ email, isVerified: true });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // If staff, validate builder email exists
    if (signupRole === "staff") {
      if (!builderEmail) {
        return res.status(400).json({ message: "Builder email is required for staff signup" });
      }
      const builder = await User.findOne({ email: builderEmail, role: "builder", isVerified: true });
      if (!builder) {
        return res.status(400).json({ message: "No verified builder found with that email" });
      }
    }

    let user = await User.findOne({ email });
    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (!user) {
      user = new User({
        name,
        mobile,
        email,
        password: hashedPassword,
        role: signupRole,
        builderEmail: signupRole === "staff" ? builderEmail : "",
        isApproved: signupRole === "builder", // builders auto-approved, staff needs approval
      });
    } else {
      user.password = hashedPassword;
      user.name = name;
      user.mobile = mobile;
      user.role = signupRole;
      user.builderEmail = signupRole === "staff" ? builderEmail : "";
      user.isApproved = signupRole === "builder";
    }

    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    await user.save();
    await sendEmail(email, otp);

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= VERIFY OTP =================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;

    // If staff, link to builder
    if (user.role === "staff" && user.builderEmail) {
      const builder = await User.findOne({ email: user.builderEmail, role: "builder", isVerified: true });
      if (builder) {
        user.linkedBuilder = builder._id;
      }
    }

    await user.save();

    const token = generateToken(user);
    res.json({ message: "Signup successful", token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.isVerified) {
      return res.status(400).json({ message: "User not found or not verified" });
    }

    // Staff must be approved by their builder
    if (user.role === "staff" && !user.isApproved) {
      return res.status(403).json({ message: "Your account is pending approval from your builder. Please wait." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ message: "Login successful", token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= PROTECTED =================
exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
};