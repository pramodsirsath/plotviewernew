const express = require("express");
const cors = require("cors");
const path = require("path");

const adminRoutes = require("./src/routes/adminRoutes.js");
const authRoutes = require("./src/routes/auth.js");
const builderRoutes = require("./src/routes/builderRoutes.js");
const app = express();

app.use(cors());
app.use(express.json());

// serve images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/builder", builderRoutes);
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

module.exports = app;
