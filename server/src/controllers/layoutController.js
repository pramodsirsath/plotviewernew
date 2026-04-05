const Layout = require("../models/Layout");
const User = require("../models/User");
const { buildPublicUrl, getClientBaseUrl } = require("../utils/publicUrl");
const crypto = require("crypto");

exports.saveLayout = async (req, res) => {
  try {
    const { name, imageUrl, plots, boundary, meta } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ message: "Image URL is required" });
    }
    if (!name) {
      return res.status(400).json({ message: "Layout name is required" });
    }

    const newLayout = new Layout({
      name,
      imageUrl,
      plots: plots || [],
      boundary: boundary || [],
      meta: meta || {},
      assignedBuilders: [],
      isPublic: false,
      publicToken: null,
    });

    await newLayout.save();

    res.status(201).json({
      message: "Layout saved successfully",
      layoutId: newLayout._id,
      layout: newLayout,
    });
  } catch (error) {
    console.error("Save Layout Error:", error);
    res.status(500).json({ message: "Error saving layout", error: error.message });
  }
};

exports.updateLayout = async (req, res) => {
  try {
    const { name, imageUrl, plots, boundary, meta } = req.body;
    const layout = await Layout.findById(req.params.id);
    
    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }

    if (name) layout.name = name;
    if (imageUrl) layout.imageUrl = imageUrl;
    if (plots) layout.plots = plots;
    if (boundary) layout.boundary = boundary;
    if (meta) layout.meta = meta;

    await layout.save();

    res.json({
      message: "Layout updated successfully",
      layoutId: layout._id,
    });
  } catch (error) {
    console.error("Update Layout Error:", error);
    res.status(500).json({ message: "Error updating layout", error: error.message });
  }
};

exports.getLayout = async (req, res) => {
  try {
    const layout = await Layout.findById(req.params.id);
    res.json(layout);
  } catch (err) {
    res.status(500).json({ message: "Error fetching layout" });
  }
};

exports.updateLayout3D = async (req, res) => {
  try {
    const { props3D } = req.body;
    const layout = await Layout.findByIdAndUpdate(
      req.params.id,
      { props3D },
      { returnDocument: 'after' }
    );
    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }
    res.json({ message: "3D layout updated successfully", layout });
  } catch (err) {
    console.error("Update Layout 3D Error:", err);
    res.status(500).json({ message: "Error updating 3D layout" });
  }
};

exports.getAdminLayouts = async (req, res) => {
  try {
    const layouts = await Layout.find().populate("assignedBuilders", "name email");
    res.json(layouts);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.assignBuilders = async (req, res) => {
  try {
    const { builders } = req.body;
    const layout = await Layout.findById(req.params.id);
    if (!layout) {
      return res.status(404).json({ msg: "Layout not found" });
    }
    layout.assignedBuilders = builders;
    await layout.save();
    res.json({ msg: "Builders assigned successfully" });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.generatePublicLink = async (req, res) => {
  try {
    const layout = await Layout.findById(req.params.id);
    if (!layout) {
      return res.status(404).json({ msg: "Layout not found" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    layout.publicToken = token;
    layout.isPublic = true;
    await layout.save();

    res.json({
      link: buildPublicUrl(getClientBaseUrl(req), `/layout/view/${token}`),
    });
  } catch (err) {
    res.status(500).json(err.message);
  }
};

exports.getBuilders = async (req, res) => {
  try {
    const builders = await User.find({
      role: "builder",
      isVerified: true,
    }).select("_id name email");
    res.status(200).json(builders);
  } catch (error) {
    console.error("Get Builders Error:", error);
    res.status(500).json({ message: "Failed to fetch builders", error: error.message });
  }
};

exports.getPublicLayout = async (req, res) => {
  try {
    const { token } = req.params;
    const layout = await Layout.findOne({ publicToken: token, isPublic: true });
    if (!layout) {
      return res.status(404).json({ message: "Layout not found or not public" });
    }

    // Also get builder contact for WhatsApp inquiry
    let builderContact = null;
    if (layout.assignedBuilders && layout.assignedBuilders.length > 0) {
      const builder = await User.findById(layout.assignedBuilders[0]).select("name whatsappNumber mobile");
      if (builder) {
        builderContact = {
          name: builder.name || "",
          whatsappNumber: builder.whatsappNumber || builder.mobile || "",
        };
      }
    }

    const response = layout.toObject();
    response.builderContact = builderContact;
    res.status(200).json(response);
  } catch (error) {
    console.error("Public Layout Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteLayout = async (req, res) => {
  try {
    const layout = await Layout.findById(req.params.id);
    if (!layout) {
      return res.status(404).json({ message: "Layout not found" });
    }
    await layout.deleteOne();
    res.json({ message: "Layout deleted successfully" });
  } catch (error) {
    console.error("Delete layout error:", error);
    res.status(500).json({ message: "Error deleting layout", error: error.message });
  }
};

// ================= LOCATION =================
exports.updateLocation = async (req, res) => {
  try {
    const { locationUrl } = req.body;
    const layout = await Layout.findByIdAndUpdate(
      req.params.id,
      { locationUrl },
      { returnDocument: 'after' }
    );
    if (!layout) return res.status(404).json({ message: "Layout not found" });
    res.json({ message: "Location updated", locationUrl: layout.locationUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DIRECTION =================
exports.updateDirection = async (req, res) => {
  try {
    const { frontDirection } = req.body;
    const layout = await Layout.findByIdAndUpdate(
      req.params.id,
      { frontDirection },
      { returnDocument: 'after' }
    );
    if (!layout) return res.status(404).json({ message: "Layout not found" });
    res.json({ message: "Direction updated", frontDirection: layout.frontDirection });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= MAP OVERLAY =================
exports.updateMapOverlay = async (req, res) => {
  try {
    const { mapOverlay } = req.body;
    const layout = await Layout.findByIdAndUpdate(
      req.params.id,
      { mapOverlay },
      { returnDocument: 'after' }
    );
    if (!layout) return res.status(404).json({ message: "Layout not found" });
    res.json({ message: "Map overlay updated", mapOverlay: layout.mapOverlay });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
