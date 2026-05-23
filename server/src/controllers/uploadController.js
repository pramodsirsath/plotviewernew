const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getServerBaseUrl } = require("../utils/publicUrl");

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

const cloudinary = require("../config/cloudinary");
const { bucket } = require("../config/firebase");

const MODEL_PATH_PREFIX = "models/";
const ALLOWED_MODEL_EXTENSIONS = new Set([".glb", ".gltf"]);

const getModelContentType = (fileName) => {
  const extension = path.extname(fileName || "").toLowerCase();

  if (extension === ".gltf") {
    return "model/gltf+json";
  }

  return "model/gltf-binary";
};

const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const assertConfiguredBucket = () => {
  if (!bucket) {
    const error = new Error("Firebase Storage is not configured on the server.");
    error.statusCode = 500;
    throw error;
  }
};

const assertAllowedModelPath = (fileName) => {
  const normalized = safeDecodeURIComponent(String(fileName || "").trim()).replace(/^\/+/, "");
  const extension = path.extname(normalized).toLowerCase();
  const pathSegments = normalized.split("/");

  if (
    !normalized.startsWith(MODEL_PATH_PREFIX) ||
    normalized.includes("\\") ||
    pathSegments.some((segment) => !segment || segment === "." || segment === "..") ||
    !ALLOWED_MODEL_EXTENSIONS.has(extension)
  ) {
    const error = new Error("Invalid model file path.");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const getModelPathFromStorageUrl = (value) => {
  const url = new URL(value);

  if (url.hostname === "storage.googleapis.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const bucketName = parts.shift();

    if (bucketName !== bucket.name) {
      const error = new Error("Model URL does not belong to the configured Firebase bucket.");
      error.statusCode = 403;
      throw error;
    }

    return assertAllowedModelPath(parts.join("/"));
  }

  if (url.hostname === "firebasestorage.googleapis.com") {
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    const bucketName = match ? decodeURIComponent(match[1]) : "";

    if (!match || bucketName !== bucket.name) {
      const error = new Error("Model URL does not belong to the configured Firebase bucket.");
      error.statusCode = 403;
      throw error;
    }

    return assertAllowedModelPath(match[2]);
  }

  const error = new Error("Only Firebase Storage model URLs are supported.");
  error.statusCode = 400;
  throw error;
};

const getModelPathFromRequest = (req) => {
  const routePath = req.params?.modelPath;
  const rawPath = req.query.path || req.query.fileName;
  const rawUrl = req.query.url;

  if (routePath) {
    return assertAllowedModelPath(routePath);
  }

  if (rawPath) {
    return assertAllowedModelPath(rawPath);
  }

  if (rawUrl) {
    return getModelPathFromStorageUrl(rawUrl);
  }

  const error = new Error("Model path or URL is required.");
  error.statusCode = 400;
  throw error;
};

const buildModelProxyUrl = (fileName) => (
  `/api/model-file/${encodeURIComponent(fileName)}`
);

const buildStorageUrl = (fileName) => {
  const encodedPath = fileName.split("/").map(encodeURIComponent).join("/");
  return `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
};

exports.uploadImage = async (req, res) => {
  try {
    console.log("REQ.FILE:", req.file); // 🔍 MUST SEE THIS IN LOGS

    if (!req.file) {
      return res.status(400).json({
        message: "File not received"
      });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "plotviewer_layouts",
      resource_type: "image",
    });

    // Delete local file after upload
    fs.unlink(req.file.path, () => {});

    return res.status(200).json({
      message: "Upload successful",
      imageUrl: result.secure_url
    });

  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(500).json({
      message: "Upload failed",
      error: error.message
    });
  }
};

exports.uploadModel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "File not received",
      });
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase();

    if (!ALLOWED_MODEL_EXTENSIONS.has(extension)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        message: "Only GLB or GLTF model files are supported",
      });
    }

    assertConfiguredBucket();

    const fileName = `models/${Date.now()}_${req.file.originalname}`;

    await bucket.upload(req.file.path, {
      destination: fileName,
      metadata: { contentType: getModelContentType(fileName) }
    });

    const file = bucket.file(fileName);

    // Optional: make public if your bucket rules require it for public read access
    try {
      await file.makePublic();
    } catch (e) {
      console.log("Could not make file public, maybe bucket is already public or IAM restricted", e.message);
    }

    // Delete local file after upload
    fs.unlink(req.file.path, () => {});

    const storageUrl = buildStorageUrl(fileName);
    const modelUrl = buildModelProxyUrl(fileName);

    return res.status(200).json({
      message: "Model upload successful",
      modelUrl,
      storageUrl,
    });
  } catch (error) {
    console.error("MODEL UPLOAD ERROR:", error);
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(500).json({
      message: "Model upload failed",
      error: error.message,
    });
  }
};

exports.proxyModelFile = async (req, res) => {
  try {
    assertConfiguredBucket();

    const fileName = getModelPathFromRequest(req);
    const file = bucket.file(fileName);
    let metadata = {};

    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (error.code === 404) {
        return res.status(404).json({ message: "Model file not found" });
      }
      throw error;
    }

    res.set({
      "Content-Type": metadata.contentType || getModelContentType(fileName),
      "Cache-Control": metadata.cacheControl || "public, max-age=86400",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });

    const stream = file.createReadStream();

    stream.on("error", (error) => {
      console.error("MODEL PROXY STREAM ERROR:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to stream model file" });
      } else {
        res.destroy(error);
      }
    });

    return stream.pipe(res);
  } catch (error) {
    console.error("MODEL PROXY ERROR:", error);
    return res.status(error.statusCode || 500).json({
      message: error.message || "Failed to load model file",
    });
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
