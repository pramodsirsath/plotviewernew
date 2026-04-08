const Layout = require("../models/Layout");
const User = require("../models/User");

// ================= GET BUILDER LAYOUTS =================
exports.getBuilderLayouts = async (req, res) => {
  try {
    let builderId = req.user._id;

    // If staff, use their linked builder's ID
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const layouts = await Layout.find({ assignedBuilders: builderId });
    res.json(layouts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET BUILDER LAYOUT BY ID =================
exports.getBuilderLayoutById = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const layout = await Layout.findOne({
      _id: req.params.id,
      assignedBuilders: builderId,
    });

    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    // Attach builder's whatsapp number for customer contact
    const builder = await User.findById(builderId).select("whatsappNumber name email");
    const response = layout.toJSON();
    response.builderContact = {
      name: builder?.name || "",
      whatsappNumber: builder?.whatsappNumber || builder?.mobile || "",
    };

    res.json(response);
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ message: "Layout not found" });
    }
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE PLOT STATUS =================
exports.updatePlotStatus = async (req, res) => {
  try {
    const { layoutId, plotId, status } = req.body;
    const allowedStatuses = ["Available", "Reserved", "Sold"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const layout = await Layout.findById(layoutId);
    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const isAssigned = layout.assignedBuilders.some(
      (id) => id.toString() === builderId.toString()
    );

    if (!isAssigned) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const plot = layout.plots.id(plotId);
    if (!plot) {
      return res.status(404).json({ message: "Plot not found" });
    }

    plot.status = status;
    await layout.save();
    res.json({ message: "Status updated", plot });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= STAFF MANAGEMENT =================
exports.getStaffRequests = async (req, res) => {
  try {
    const staff = await User.find({
      builderEmail: req.user.email,
      role: "staff",
      isVerified: true,
      isApproved: false,
    }).select("-password -otp -otpExpiry");

    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyStaff = async (req, res) => {
  try {
    const staff = await User.find({
      linkedBuilder: req.user._id,
      role: "staff",
      isVerified: true,
      isApproved: true,
    }).select("-password -otp -otpExpiry");

    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);
    if (!staff || staff.role !== "staff") {
      return res.status(404).json({ message: "Staff member not found" });
    }

    if (staff.builderEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized to approve this staff" });
    }

    staff.isApproved = true;
    staff.linkedBuilder = req.user._id;
    await staff.save();

    res.json({ message: `${staff.name} has been approved as your staff member` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectStaff = async (req, res) => {
  try {
    const staff = await User.findById(req.params.staffId);
    if (!staff || staff.role !== "staff") {
      return res.status(404).json({ message: "Staff member not found" });
    }

    if (staff.builderEmail !== req.user.email) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await staff.deleteOne();
    res.json({ message: "Staff request rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GALLERY =================
exports.uploadGalleryImages = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const layout = await Layout.findOne({
      _id: req.params.id,
      assignedBuilders: builderId,
    });

    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    const newPaths = req.files.map((file) => `/uploads/${file.filename}`);
    layout.galleryImages = [...(layout.galleryImages || []), ...newPaths];
    await layout.save();

    res.json({ message: "Images uploaded", galleryImages: layout.galleryImages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getGalleryImages = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const layout = await Layout.findOne({
      _id: req.params.id,
      assignedBuilders: builderId,
    }).select("galleryImages");

    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    res.json(layout.galleryImages || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteGalleryImage = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const layout = await Layout.findOne({
      _id: req.params.id,
      assignedBuilders: builderId,
    });

    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    const imageIndex = parseInt(req.params.imageIndex, 10);
    if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= (layout.galleryImages || []).length) {
      return res.status(400).json({ message: "Invalid image index" });
    }

    layout.galleryImages.splice(imageIndex, 1);
    await layout.save();

    res.json({ message: "Image removed", galleryImages: layout.galleryImages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE WHATSAPP NUMBER =================
exports.updateWhatsappNumber = async (req, res) => {
  try {
    const { whatsappNumber } = req.body;
    await User.findByIdAndUpdate(req.user._id, { whatsappNumber }, { returnDocument: 'after' });
    res.json({ message: "WhatsApp number updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
