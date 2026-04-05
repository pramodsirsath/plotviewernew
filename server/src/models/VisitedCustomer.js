const mongoose = require("mongoose");

const visitedCustomerSchema = new mongoose.Schema(
  {
    layoutId: { type: mongoose.Schema.Types.ObjectId, ref: "Layout", required: true },
    builderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    customerName: { type: String, required: true },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    customerAddress: { type: String, default: "" },
    requirements: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VisitedCustomer", visitedCustomerSchema);
