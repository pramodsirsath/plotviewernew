const app = require('./app.js');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");

const uploadsDir = path.resolve(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
} else if (!fs.statSync(uploadsDir).isDirectory()) {
  // If 'uploads' exists as a file (e.g. git placeholder), remove it and create a directory
  fs.unlinkSync(uploadsDir);
  fs.mkdirSync(uploadsDir, { recursive: true });
}

dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected');

    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';

    app.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err);
  });
