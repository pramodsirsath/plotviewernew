import React, { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Transformer,
  Text,
  Group,
} from "react-konva";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import {
  getTouchAngle,
  getTouchCenter,
  getTouchDistance,
  normalizeAngle,
  normalizeAngleDelta,
} from "../../utils/gestureUtils";
import {
  getLayoutStatusFill,
  LAYOUT_MAP_COLORS,
  LAYOUT_MAP_FONT_FAMILY,
} from "../../theme/layoutMapTheme";

const DEFAULT_STATUS = "Available";
const FEET_TO_METERS = 0.3048;

const formatFeetValueAsMeters = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const meterValue = numericValue * FEET_TO_METERS;

  return Math.abs(meterValue - Math.round(meterValue)) < 0.01
    ? String(Math.round(meterValue))
    : meterValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const parseMeterInputToFeet = (value) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const feetValue = numericValue / FEET_TO_METERS;

  return Math.abs(feetValue - Math.round(feetValue)) < 0.01
    ? String(Math.round(feetValue))
    : feetValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const PlotEditor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const imageUrl = location.state?.imageUrl;
  const initialLayoutName = location.state?.layoutName || "";

  const stageRef = useRef(null);
  const trRef = useRef(null);
  const gestureRef = useRef(null);

  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [layoutName, setLayoutName] = useState(initialLayoutName);
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rectangles, setRectangles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (!imageUrl) {
      navigate("/uploadimage");
      return;
    }

    const img = new window.Image();
    img.src = resolveServerUrl(imageUrl);
    img.onload = () => setImage(img);
  }, [imageUrl, navigate]);

  React.useEffect(() => {
    if (!trRef.current || !stageRef.current) {
      return;
    }

    const stage = stageRef.current;
    const selectedNode = stage.findOne(`#rect-${selectedId}`);

    trRef.current.nodes(selectedNode ? [selectedNode] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [selectedId, rectangles, rotation]);

  const addRectangle = () => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const centerX = (stage.width() / 2 - stage.x()) / stage.scaleX();
    const centerY = (stage.height() / 2 - stage.y()) / stage.scaleY();

    const newRect = {
      id: Date.now().toString(),
      x: centerX - 40,
      y: centerY - 25,
      width: 80,
      height: 50,
      plotNo: "",
      plotWidth: "",
      plotHeight: "",
      area: 0,
      status: DEFAULT_STATUS,
    };

    setRectangles((prev) => [...prev, newRect]);
    setSelectedId(newRect.id);
    setIsEditing(true);
  };

  const handleWheel = (e) => {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) {
      return;
    }

    if (e.evt.altKey) {
      setRotation((prev) => normalizeAngle(prev + (e.evt.deltaY > 0 ? 6 : -6)));
      return;
    }

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleTouchStart = (e) => {
    const touches = e.evt.touches;

    if (touches.length !== 2) {
      gestureRef.current = null;
      setIsGestureActive(false);
      return;
    }

    e.evt.preventDefault();
    setIsGestureActive(true);
    gestureRef.current = {
      startDistance: getTouchDistance(touches[0], touches[1]),
      startCenter: getTouchCenter(touches[0], touches[1]),
      startScale: scale,
      startRotation: rotation,
      startPosition: position,
      lastAngle: getTouchAngle(touches[0], touches[1]),
      accumulatedRotation: 0,
    };
  };

  const handleTouchMove = (e) => {
    const touches = e.evt.touches;
    const gesture = gestureRef.current;

    if (!gesture || touches.length !== 2) {
      return;
    }

    e.evt.preventDefault();

    const nextDistance = getTouchDistance(touches[0], touches[1]);
    const nextAngle = getTouchAngle(touches[0], touches[1]);
    const nextCenter = getTouchCenter(touches[0], touches[1]);
    const nextScale = gesture.startScale * (nextDistance / gesture.startDistance);
    const angleDelta = normalizeAngleDelta(nextAngle - gesture.lastAngle);

    gesture.lastAngle = nextAngle;
    gesture.accumulatedRotation += angleDelta;

    setScale(nextScale);
    setRotation(normalizeAngle(gesture.startRotation + gesture.accumulatedRotation));
    setPosition({
      x: gesture.startPosition.x + (nextCenter.x - gesture.startCenter.x),
      y: gesture.startPosition.y + (nextCenter.y - gesture.startCenter.y),
    });
  };

  const handleTouchEnd = () => {
    gestureRef.current = null;
    setIsGestureActive(false);
  };

  const handleDragMove = (e, id) => {
    setRectangles((prev) =>
      prev.map((rect) =>
        rect.id === id ? { ...rect, x: e.target.x(), y: e.target.y() } : rect
      )
    );
  };

  const handleTransformEnd = (e, rect) => {
    const node = e.target;
    const nextWidth = Math.max(20, node.width() * node.scaleX());
    const nextHeight = Math.max(20, node.height() * node.scaleY());

    node.scaleX(1);
    node.scaleY(1);

    setRectangles((prev) =>
      prev.map((item) =>
        item.id === rect.id
          ? {
              ...item,
              x: node.x(),
              y: node.y(),
              width: nextWidth,
              height: nextHeight,
            }
          : item
      )
    );
  };

  const deleteRectangle = () => {
    setRectangles((prev) => prev.filter((rect) => rect.id !== selectedId));
    setSelectedId(null);
    setIsEditing(false);
    trRef.current?.nodes([]);
  };

  const handleInputChange = (field, value) => {
    setRectangles((prev) =>
      prev.map((rect) => {
        if (rect.id !== selectedId) {
          return rect;
        }

        const updatedRect = { ...rect, [field]: value };
        const widthValue = parseFloat(updatedRect.plotWidth);
        const heightValue = parseFloat(updatedRect.plotHeight);

        updatedRect.area = !Number.isNaN(widthValue) && !Number.isNaN(heightValue)
          ? Number((widthValue * heightValue).toFixed(2))
          : 0;

        return updatedRect;
      })
    );
  };

  const handleSubmit = async () => {
    if (!layoutName.trim()) {
      alert("Enter a layout name");
      return;
    }

    if (!imageUrl) {
      alert("Upload a layout image first");
      return;
    }

    try {
      setIsSaving(true);
      const res = await API.post("/upload-layout", {
        name: layoutName.trim(),
        imageUrl,
        plots: rectangles,
      });

      const layoutId = res.data.layoutId;
      navigate("/admin-dashboard");
      alert(`Layout saved successfully. Admin preview id: ${layoutId}`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Error saving layout");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRect = rectangles.find((rect) => rect.id === selectedId);
  const imageCenterX = image ? image.width / 2 : 0;
  const imageCenterY = image ? image.height / 2 : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Plot Editor</h1>
          <p style={styles.subtitle}>Draw plot rectangles, fill plot details, and rotate with two fingers on touch or Alt + wheel on desktop.</p>
        </div>

        <div style={styles.actions}>
          <input
            type="text"
            placeholder="Layout name"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            style={styles.layoutNameInput}
          />
          <button style={styles.addBtn} onClick={addRectangle}>+ Add Plot</button>
          <button style={styles.saveBtnTop} onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Layout"}
          </button>
        </div>
      </div>

      <div style={styles.canvasWrapper}>
        {image && (
          <Stage
            width={window.innerWidth - 40}
            height={window.innerHeight - 150}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={!isGestureActive}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            ref={stageRef}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedId(null);
                setIsEditing(false);
              }
            }}
          >
            <Layer>
              <Group
                x={imageCenterX}
                y={imageCenterY}
                offsetX={imageCenterX}
                offsetY={imageCenterY}
                rotation={rotation}
              >
                <KonvaImage image={image} />

                {rectangles.map((rect) => (
                  <React.Fragment key={rect.id}>
                    <Rect
                      id={`rect-${rect.id}`}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill={getPlotFill(rect.status)}
                      stroke={selectedId === rect.id ? LAYOUT_MAP_COLORS.selectedPlot : LAYOUT_MAP_COLORS.plotNumber}
                      strokeWidth={2}
                      draggable
                      onClick={() => setSelectedId(rect.id)}
                      onTap={() => setSelectedId(rect.id)}
                      onDragMove={(e) => handleDragMove(e, rect.id)}
                      onTransformEnd={(e) => handleTransformEnd(e, rect)}
                    />

                    {rect.plotNo && (
                      <Text
                        x={rect.x + 5}
                        y={rect.y + 5}
                        text={`#${rect.plotNo}\n${formatFeetValueAsMeters(rect.plotWidth) || "-"} m x ${formatFeetValueAsMeters(rect.plotHeight) || "-"} m`}
                        fontSize={12}
                        fontFamily={LAYOUT_MAP_FONT_FAMILY}
                        fill={LAYOUT_MAP_COLORS.plotNumber}
                      />
                    )}
                  </React.Fragment>
                ))}
              </Group>

              <Transformer ref={trRef} rotateEnabled={false} />
            </Layer>
          </Stage>
        )}
      </div>

      {selectedRect && (
        <div
          style={{
            ...styles.toolbox,
            top: selectedRect.y * scale + position.y - 60,
            left: selectedRect.x * scale + position.x + (selectedRect.width * scale) / 2 - 110,
          }}
        >
          {!isEditing ? (
            <div style={styles.toolboxActions}>
              <button style={styles.infoBtn} onClick={() => setIsEditing(true)}>Edit Info</button>
              <button style={styles.deleteBtn} onClick={deleteRectangle}>Delete</button>
            </div>
          ) : (
            <div style={styles.formStack}>
              <input placeholder="Plot No" value={selectedRect.plotNo} onChange={(e) => handleInputChange("plotNo", e.target.value)} style={styles.input} />
              <input placeholder="Width (m)" type="number" step="0.01" inputMode="decimal" value={formatFeetValueAsMeters(selectedRect.plotWidth)} onChange={(e) => handleInputChange("plotWidth", parseMeterInputToFeet(e.target.value))} style={styles.input} />
              <input placeholder="Height (m)" type="number" step="0.01" inputMode="decimal" value={formatFeetValueAsMeters(selectedRect.plotHeight)} onChange={(e) => handleInputChange("plotHeight", parseMeterInputToFeet(e.target.value))} style={styles.input} />
              <select value={selectedRect.status} onChange={(e) => handleInputChange("status", e.target.value)} style={styles.input}>
                <option value="Available">Available</option>
                <option value="Reserved">Reserved</option>
                <option value="Sold">Sold</option>
              </select>
              <select value={selectedRect.category || "Standard"} onChange={(e) => handleInputChange("category", e.target.value)} style={styles.input}>
                <option value="Standard">Standard</option>
                <option value="Premium">Premium</option>
                <option value="Diamond">Diamond</option>
              </select>
              <input type="number" placeholder="Rate (₹)" value={selectedRect.rate || ""} onChange={(e) => handleInputChange("rate", e.target.value ? Number(e.target.value) : 0)} style={styles.input} />
              <div style={styles.areaLabel}>Area: {selectedRect.area} sq.ft</div>
              <button style={styles.saveBtn} onClick={() => setIsEditing(false)}>Done</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const getPlotFill = (status) => getLayoutStatusFill(status, 0.5);

export default PlotEditor;

const styles = {
  container: { background: "#f8fafc", minHeight: "100vh", padding: "24px", fontFamily: '"Segoe UI", sans-serif' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" },
  title: { fontSize: "22px", fontWeight: "700", margin: 0 },
  subtitle: { fontSize: "13px", color: "#64748b", marginTop: "4px" },
  actions: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
  layoutNameInput: { padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", minWidth: "220px" },
  controlBtn: { background: "#e0f2fe", color: "#075985", padding: "10px 14px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  addBtn: { background: "#16a34a", color: "#fff", padding: "10px 16px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  saveBtnTop: { background: "#2563eb", color: "#fff", padding: "10px 16px", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" },
  canvasWrapper: { marginTop: "20px", borderRadius: "16px", overflow: "hidden", background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", border: "1px solid #e5e7eb" },
  toolbox: { position: "absolute", background: "#fff", padding: "12px", borderRadius: "12px", boxShadow: "0 8px 25px rgba(0,0,0,0.15)", zIndex: 100, minWidth: "220px", border: "1px solid #e5e7eb" },
  toolboxActions: { display: "flex", gap: "10px" },
  formStack: { display: "flex", flexDirection: "column", gap: "8px" },
  infoBtn: { background: "#2563eb", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  deleteBtn: { background: "#dc2626", color: "#fff", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" },
  input: { padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "13px" },
  areaLabel: { fontSize: "12px", color: "#475569" },
  saveBtn: { background: "#16a34a", color: "#fff", border: "none", padding: "8px", borderRadius: "6px", cursor: "pointer" },
};
