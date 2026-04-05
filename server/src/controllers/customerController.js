const VisitedCustomer = require("../models/VisitedCustomer");
const Layout = require("../models/Layout");

// ================= ADD VISITED CUSTOMER =================
exports.addVisitedCustomer = async (req, res) => {
  try {
    const { layoutId, customerName, customerEmail, customerPhone, customerAddress, requirements } = req.body;

    if (!layoutId || !customerName) {
      return res.status(400).json({ message: "Layout and customer name are required" });
    }

    let builderId = req.user._id;
    let staffId = null;

    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
      staffId = req.user._id;
    }

    // Verify layout belongs to this builder
    const layout = await Layout.findOne({ _id: layoutId, assignedBuilders: builderId });
    if (!layout) {
      return res.status(404).json({ message: "Layout not found or not assigned to your builder" });
    }

    const customer = new VisitedCustomer({
      layoutId,
      builderId,
      staffId,
      customerName,
      customerEmail: customerEmail || "",
      customerPhone: customerPhone || "",
      customerAddress: customerAddress || "",
      requirements: requirements || "",
    });

    await customer.save();
    res.status(201).json({ message: "Customer data saved", customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET VISITED CUSTOMERS =================
exports.getVisitedCustomers = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const customers = await VisitedCustomer.find({
      layoutId: req.params.layoutId,
      builderId,
    })
      .populate("staffId", "name email")
      .sort({ createdAt: -1 });

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= EXPORT AS CSV =================
exports.exportCustomersCSV = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const customers = await VisitedCustomer.find({
      layoutId: req.params.layoutId,
      builderId,
    })
      .populate("staffId", "name email")
      .sort({ createdAt: -1 });

    // Build CSV
    const headers = "Name,Email,Phone,Address,Requirements,Added By,Date\n";
    const rows = customers
      .map((c) => {
        const staffName = c.staffId?.name || "Builder";
        const date = new Date(c.createdAt).toLocaleDateString("en-IN");
        return [
          `"${(c.customerName || "").replace(/"/g, '""')}"`,
          `"${(c.customerEmail || "").replace(/"/g, '""')}"`,
          `"${(c.customerPhone || "").replace(/"/g, '""')}"`,
          `"${(c.customerAddress || "").replace(/"/g, '""')}"`,
          `"${(c.requirements || "").replace(/"/g, '""')}"`,
          `"${staffName}"`,
          `"${date}"`,
        ].join(",");
      })
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=visited_customers_${req.params.layoutId}.csv`);
    res.send(headers + rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= EXPORT TO GOOGLE SHEETS =================
exports.exportToGoogleSheets = async (req, res) => {
  try {
    let builderId = req.user._id;
    if (req.user.role === "staff" && req.user.linkedBuilder) {
      builderId = req.user.linkedBuilder;
    }

    const customers = await VisitedCustomer.find({
      layoutId: req.params.layoutId,
      builderId,
    })
      .populate("staffId", "name email")
      .sort({ createdAt: -1 });

    const layout = await Layout.findById(req.params.layoutId);

    // Google Sheets API
    const { google } = require("googleapis");
    const path = require("path");
    const credPath = path.join(__dirname, "..", "..", "google-credentials.json");

    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    // Create new spreadsheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `Visited Customers - ${layout?.name || "Layout"}` },
        sheets: [{ properties: { title: "Customers" } }],
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;

    // Write data
    const headers = [["Name", "Email", "Phone", "Address", "Requirements", "Added By", "Date"]];
    const rows = customers.map((c) => [
      c.customerName || "",
      c.customerEmail || "",
      c.customerPhone || "",
      c.customerAddress || "",
      c.requirements || "",
      c.staffId?.name || "Builder",
      new Date(c.createdAt).toLocaleDateString("en-IN"),
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Customers!A1",
      valueInputOption: "RAW",
      requestBody: { values: [...headers, ...rows] },
    });

    // Make it publicly readable
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "reader", type: "anyone" },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.json({ message: "Google Sheet created", url: sheetUrl });
  } catch (err) {
    console.error("Google Sheets export error:", err);
    if (err.code === 403) {
      return res.status(403).json({ 
        message: "Google Sheets API is not enabled in your Google Cloud Console. Please go to console.cloud.google.com, select your project, and enable BOTH the 'Google Sheets API' and 'Google Drive API'." 
      });
    }
    res.status(500).json({ message: "Failed to export to Google Sheets", error: err.message });
  }
};
