const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    mobile: String,
    email: { type: String, unique: true },
    password: String,
    role: { type: String, default: "builder", enum: ["admin", "builder", "staff"] },
    isVerified: { type: Boolean, default: false },
    otp: String,
    otpExpiry: Date,

    // Staff-specific: links staff to a builder
    builderEmail: { type: String, default: "" },
    linkedBuilder: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isApproved: { type: Boolean, default: true }, // builders auto-approved; staff needs builder approval

    // Builder contact for WhatsApp
    whatsappNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);