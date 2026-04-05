const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { buildPublicUrl, getServerBaseUrl } = require("../utils/publicUrl");

const execFileAsync = promisify(execFile);

const resolveUploadedImagePath = (req, imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("Layout image URL is required");
  }

  const serverBaseUrl = getServerBaseUrl(req);
  const resolvedUrl = new URL(imageUrl, serverBaseUrl);

  if (!resolvedUrl.pathname.startsWith("/uploads/")) {
    throw new Error("Only uploaded layout images can be analyzed");
  }

  const fileName = path.basename(resolvedUrl.pathname);
  const uploadPath = path.resolve(__dirname, "../../uploads", fileName);

  if (!fs.existsSync(uploadPath)) {
    throw new Error("Uploaded layout image could not be found on the server");
  }

  return uploadPath;
};

exports.uploadImage = (req, res) => {
  try {
    const imageUrl = buildPublicUrl(
      getServerBaseUrl(req),
      `/uploads/${req.file.filename}`
    );
    res.json({ imageUrl });
  } catch (error) {
    console.error("Upload controller error:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

exports.analyzeLayoutImage = async (req, res) => {
  try {
    const imagePath = resolveUploadedImagePath(req, req.body?.imageUrl);
    const pythonExecutable = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    const scriptPath = path.resolve(__dirname, "../utils/detect_layout_plots.py");

    const { stdout, stderr } = await execFileAsync(
      pythonExecutable,
      [scriptPath, imagePath],
      {
        cwd: path.resolve(__dirname, "../../"),
        maxBuffer: 8 * 1024 * 1024,
      }
    );

    if (stderr?.trim()) {
      console.warn("Layout analyzer stderr:", stderr.trim());
    }

    let parsedOutput;

    try {
      parsedOutput = JSON.parse(stdout.trim());
    } catch (error) {
      console.error("Layout analyzer parse error:", stdout);
      throw new Error("Layout analyzer returned an unreadable response");
    }

    if (parsedOutput?.error) {
      throw new Error(parsedOutput.error);
    }

    res.json(parsedOutput);
  } catch (error) {
    console.error("Layout analysis error:", error);
    res.status(500).json({
      message: error.message || "Automatic layout analysis failed",
    });
  }
};
