import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import { isPdfFile, renderPdfAsLayoutDesign } from "../../utils/pdfLayoutDesign";

const UploadLayout = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [layoutName, setLayoutName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedFile, setPreparedFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [sourceMessage, setSourceMessage] = useState("");
  const previewRef = useRef("");
  const prepareRunRef = useRef(0);

  const clearLocalPreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = "";
    }

    setLocalPreviewUrl("");
  };

  const replaceLocalPreview = (nextUrl) => {
    clearLocalPreview();
    previewRef.current = nextUrl;
    setLocalPreviewUrl(nextUrl);
  };

  useEffect(() => () => {
    clearLocalPreview();
  }, []);

  const handleFileChange = async (event) => {
    const nextFile = event.target.files?.[0] || null;
    const nextRun = prepareRunRef.current + 1;

    prepareRunRef.current = nextRun;
    setFile(nextFile);
    setImageUrl("");
    setPreparedFile(null);
    setSourceMessage("");
    clearLocalPreview();

    if (!nextFile) {
      return;
    }

    if (!isPdfFile(nextFile)) {
      replaceLocalPreview(URL.createObjectURL(nextFile));
      setPreparedFile(nextFile);
      setSourceMessage("Image source selected. This file will be used directly as the layout background.");
      return;
    }

    try {
      setIsPreparing(true);
      setSourceMessage("Converting the first PDF page into a clean layout design...");
      const result = await renderPdfAsLayoutDesign(nextFile);

      if (prepareRunRef.current !== nextRun) {
        URL.revokeObjectURL(result.previewUrl);
        return;
      }

      replaceLocalPreview(result.previewUrl);
      setPreparedFile(result.file);
      setSourceMessage(`PDF converted successfully. Using page 1 as a ${result.width} x ${result.height} layout design.`);
    } catch (error) {
      console.error(error);
      setPreparedFile(null);
      setSourceMessage("The PDF could not be converted. Try another PDF or use an image file.");
    } finally {
      if (prepareRunRef.current === nextRun) {
        setIsPreparing(false);
      }
    }
  };

  const handleUpload = async () => {
    if (!layoutName.trim()) {
      alert("Enter a layout name first");
      return;
    }

    if (!file) {
      alert("Select file first");
      return;
    }

    if (!preparedFile) {
      alert("Wait for the file to finish preparing first");
      return;
    }

    const formData = new FormData();
    formData.append("layout", preparedFile, preparedFile.name);

    try {
      setIsUploading(true);
      const res = await API.post("/upload-image", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setImageUrl(res.data.imageUrl);
    } catch (error) {
      console.error(error);
      alert("Layout upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="kicker">Upload Layout</div>
          <h1 className="page-title">Start with the plan, then bring each plot to life.</h1>
          <p className="page-subtitle">
            Give the layout a name, upload an image or PDF, convert it into a clean layout design, preview it, and continue into the automatic plot analyzer with the prepared background ready to scan.
          </p>
        </div>
      </div>

      <div className="hero-grid">
        <section className="surface-card section-stack">
          <div>
            <h2 className="panel-title">Create a fresh layout</h2>
            <p className="panel-subtitle">This prepared layout background becomes the foundation for every plot overlay, builder update, and customer interaction.</p>
          </div>

          <label className="form-label">
            Layout Name
            <input
              className="form-input"
              type="text"
              placeholder="Ex. Green Valley Phase 2"
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
            />
          </label>

          <div className="form-label">
            <span>Layout Source</span>
            <label className="checkbox-card" style={{ cursor: "pointer" }}>
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <span className="feature-icon">+</span>
              <span>{file ? file.name : "Click to choose a layout image or PDF"}</span>
            </label>
          </div>

          {sourceMessage && (
            <p className="panel-subtitle" style={{ margin: 0 }}>
              {sourceMessage}
            </p>
          )}

          <div className="button-row">
            <button className="btn btn-primary" onClick={handleUpload} disabled={isUploading || isPreparing || !preparedFile}>
              {isPreparing ? "Preparing PDF..." : isUploading ? "Uploading..." : "Upload Layout"}
            </button>
            {imageUrl && (
              <button
                className="btn btn-accent"
                onClick={() => navigate("/editor", { state: { imageUrl, layoutName } })}
              >
                Continue to Auto Analyzer
              </button>
            )}
          </div>
        </section>

        <section className="surface-card section-stack">
          <div>
            <h2 className="panel-title">Converted Design Preview</h2>
            <p className="panel-subtitle">Check the cleaned layout background before the analyzer starts detecting plots automatically.</p>
          </div>

          <div className="preview-frame" style={{ minHeight: 320, display: "grid", placeItems: "center" }}>
            {imageUrl || localPreviewUrl ? (
              <img
                src={imageUrl ? resolveServerUrl(imageUrl) : localPreviewUrl}
                alt="layout preview"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div className="empty-card" style={{ background: "transparent", boxShadow: "none", border: "none" }}>
                <h3 className="panel-title">No image yet</h3>
                <p className="panel-subtitle">Upload a layout image or choose a PDF to see the converted design here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default UploadLayout;
