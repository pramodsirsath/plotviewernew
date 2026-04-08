import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Line } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft, Save } from 'lucide-react';
import { RenderProp } from '../shared/Props3D';
import API from "../../services/api";
import { GLOBAL_COLORS } from '../../theme/globalColors';

const SCALE = 0.05;
const NON_PLOT_PRESET_COLORS = [
  "#dcfce7",
  "#bbf7d0",
  GLOBAL_COLORS.nonPlotBlock,
  "#4ade80",
  "#22c55e",
  "#15803d",
  "#65a30d",
  "#4d7c0f",
  "#16a34a",
  "#2f855a",
  "#14532d",
  "#a7f3d0",
  "#2dd4bf",
  "#0f766e",
  "#38bdf8",
  "#60a5fa",
  "#facc15",
  "#fb923c",
  "#fda4af",
  "#c084fc",
  "#94a3b8",
];
const NON_PLOT_SURFACE_LIFT = 0.018;
const NON_PLOT_SELECTED_SURFACE_LIFT = 0.026;
const NON_PLOT_OUTLINE_LIFT = 0.004;
const NON_PLOT_LAYER_STEP = 0.006;

const getPlotKey = (plot) => plot?._id || plot?.id;

function PlotMesh({ plot, isSelected, onClick, layerOrder = 0 }) {
  const isNonPlotBlock = plot.isPlot === false;

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();

    if (plot.points && plot.points.length >= 6) {
      if (plot.isCurved) {
        const shapeVectors = [];
        for (let i = 0; i < plot.points.length; i += 2) {
          shapeVectors.push(new THREE.Vector2(plot.points[i] * SCALE, -plot.points[i + 1] * SCALE));
        }
        shape.moveTo(shapeVectors[0].x, shapeVectors[0].y);
        shape.splineThru(shapeVectors);
      } else {
        shape.moveTo(plot.points[0] * SCALE, -plot.points[1] * SCALE);
        for (let i = 2; i < plot.points.length; i += 2) {
          shape.lineTo(plot.points[i] * SCALE, -plot.points[i + 1] * SCALE);
        }
        shape.lineTo(plot.points[0] * SCALE, -plot.points[1] * SCALE);
      }
    } else {
      shape.moveTo(plot.x * SCALE, -plot.y * SCALE);
      shape.lineTo((plot.x + plot.width) * SCALE, -plot.y * SCALE);
      shape.lineTo((plot.x + plot.width) * SCALE, -(plot.y + plot.height) * SCALE);
      shape.lineTo(plot.x * SCALE, -(plot.y + plot.height) * SCALE);
      shape.lineTo(plot.x * SCALE, -plot.y * SCALE);
    }

    if (isNonPlotBlock) {
      return new THREE.ShapeGeometry(shape);
    }

    const extrudeSettings = {
      depth: isSelected ? 0.08 : 0.05,
      bevelEnabled: false,
    };

    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [plot, isSelected, isNonPlotBlock]);

  const outlinePoints = useMemo(() => {
    const outlineLift = isNonPlotBlock
      ? NON_PLOT_OUTLINE_LIFT
      : (isSelected ? 0.082 : 0.052);
    const pts = [];
    if (plot.points && plot.points.length >= 6) {
      if (plot.isCurved) {
        const shapeVectors = [];
        for (let i = 0; i < plot.points.length; i += 2) {
          shapeVectors.push(new THREE.Vector2(plot.points[i] * SCALE, -plot.points[i + 1] * SCALE));
        }
        const spline = new THREE.SplineCurve(shapeVectors);
        const splinePts = spline.getPoints(50);
        splinePts.forEach((point) => pts.push(new THREE.Vector3(point.x, point.y, outlineLift)));
      } else {
        for (let i = 0; i < plot.points.length; i += 2) {
          pts.push(new THREE.Vector3(plot.points[i] * SCALE, -plot.points[i + 1] * SCALE, outlineLift));
        }
        pts.push(new THREE.Vector3(plot.points[0] * SCALE, -plot.points[1] * SCALE, outlineLift));
      }
    } else {
      pts.push(new THREE.Vector3(plot.x * SCALE, -plot.y * SCALE, outlineLift));
      pts.push(new THREE.Vector3((plot.x + plot.width) * SCALE, -plot.y * SCALE, outlineLift));
      pts.push(new THREE.Vector3((plot.x + plot.width) * SCALE, -(plot.y + plot.height) * SCALE, outlineLift));
      pts.push(new THREE.Vector3(plot.x * SCALE, -(plot.y + plot.height) * SCALE, outlineLift));
      pts.push(new THREE.Vector3(plot.x * SCALE, -plot.y * SCALE, outlineLift));
    }
    return pts;
  }, [plot, isSelected, isNonPlotBlock]);

  const surfaceColor = plot.isPlot === false
    ? (plot.blockColor || GLOBAL_COLORS.nonPlotBlock)
    : (isSelected ? GLOBAL_COLORS.selectedPlot : GLOBAL_COLORS.plot);
  const layerLift = isNonPlotBlock ? layerOrder * NON_PLOT_LAYER_STEP : 0;
  const surfaceLift = isNonPlotBlock
    ? ((isSelected ? NON_PLOT_SELECTED_SURFACE_LIFT : NON_PLOT_SURFACE_LIFT) + layerLift)
    : 0;
  const showOutline = !isNonPlotBlock || isSelected;
  const outlineColor = isNonPlotBlock ? GLOBAL_COLORS.selectedPlotpopup : GLOBAL_COLORS.plotBorder;
  const meshRenderOrder = isNonPlotBlock ? 10 + layerOrder * 2 : 0;
  const outlineRenderOrder = meshRenderOrder + 1;

  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, surfaceLift, 0]}
        renderOrder={meshRenderOrder}
        onClick={(e) => {
          e.stopPropagation();
          onClick(plot);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick(plot);
        }}
      >
        <meshStandardMaterial
          color={surfaceColor}
          roughness={1}
          metalness={0}
          side={isNonPlotBlock ? THREE.DoubleSide : THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {showOutline ? (
        <Line
          points={outlinePoints}
          color={outlineColor}
          lineWidth={isNonPlotBlock ? 2.8 : 2.5}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, surfaceLift, 0]}
          renderOrder={outlineRenderOrder}
          raycast={() => null}
          transparent={false}
        />
      ) : null}
    </group>
  );
}

function BoundaryMesh({ boundary, meta, isDimOverlay }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (boundary && boundary.length > 0) {
      shape.moveTo(boundary[0] * SCALE, -boundary[1] * SCALE);
      for (let i = 2; i < boundary.length; i += 2) {
        shape.lineTo(boundary[i] * SCALE, -boundary[i + 1] * SCALE);
      }
      shape.lineTo(boundary[0] * SCALE, -boundary[1] * SCALE);
    } else if (meta) {
      shape.moveTo(0, 0);
      shape.lineTo(meta.analysisWidth * SCALE, 0);
      shape.lineTo(meta.analysisWidth * SCALE, -meta.analysisHeight * SCALE);
      shape.lineTo(0, -meta.analysisHeight * SCALE);
    }

    return new THREE.ShapeGeometry(shape);
  }, [boundary, meta]);

  if (isDimOverlay) {
    return (
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} raycast={() => null}>
        <meshBasicMaterial color="#000000" transparent opacity={0.65} />
      </mesh>
    );
  }

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <meshStandardMaterial color={GLOBAL_COLORS.road} roughness={1} />
    </mesh>
  );
}

const styles = {
  container: {
    width: "100%",
    height: "100vh",
    position: "relative",
    background: "#222222",
    overflow: "hidden",
    fontFamily: "Inter, sans-serif"
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    padding: "24px",
    zIndex: 10,
    pointerEvents: "none",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  leftGroup: {
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  toolbar: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    left: "24px",
    zIndex: 10,
    pointerEvents: "auto",
    maxHeight: "80vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px",
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.1)"
  },
  transformBar: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    left: "90px",
    zIndex: 10,
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px",
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.1)"
  },
  toolBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.25rem",
    border: "1px solid transparent",
    background: "transparent",
    color: "#ffffff",
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  toolBtnActive: {
    background: "#ff8c00",
    borderColor: "#ffad4d",
    color: "#000000"
  },
  modeBtn: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    border: "1px solid rgba(255,255,255,0.2)",
    cursor: "pointer",
    transition: "all 0.3s ease"
  },
  btn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(12px)",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "600",
    transition: "all 0.2s"
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: "rgba(37, 99, 235, 0.9)",
    backdropFilter: "blur(12px)",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "700",
    transition: "all 0.2s"
  },
  infoBox: {
    pointerEvents: "auto",
    background: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(12px)",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    minWidth: "190px"
  },
  helperToast: {
    position: "absolute",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 24px",
    borderRadius: "999px",
    fontSize: "0.875rem",
    pointerEvents: "none",
    transition: "opacity 0.3s ease",
    zIndex: 10,
    fontWeight: "500",
    color: "#9ca3af",
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.05)"
  }
};


export default function Editor3D() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [layoutData, setLayoutData] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [is2DMode, setIs2DMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [placedItems, setPlacedItems] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedPropId, setSelectedPropId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');

  useEffect(() => {
    const fetchLayout = async () => {
      try {
        const res = await API.get(`/layout/${id}`);
        setLayoutData(res.data);
        if (res.data.props3D) {
          setPlacedItems(res.data.props3D);
        }
      } catch (err) {
        console.error("Error fetching layout data:", err);
      }
    };
    fetchLayout();
  }, [id]);

  const handleFloorClick = (e) => {
    e.stopPropagation();
    if (!activeTool || activeTool === 'select') {
      setSelectedPropId(null);
      setSelectedPlot(null);
      return;
    }
    if (activeTool === 'trash') return;

    let text = null;
    if (activeTool === 'roadtext') {
      text = window.prompt("Enter road text:", "9M WIDE ROAD");
      if (!text) return; // cancelled
    }

    const newItem = {
      id: Date.now() + Math.random(),
      type: activeTool,
      position: [e.point.x, e.point.y, e.point.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      text: text
    };
    setPlacedItems([...placedItems, newItem]);
    setSelectedPropId(newItem.id);
    setActiveTool('select');
  };

  const handlePropClick = (item, e) => {
    if (activeTool === 'trash') {
      e.stopPropagation();
      setPlacedItems(placedItems.filter(i => i.id !== item.id));
      if (selectedPropId === item.id) setSelectedPropId(null);
    } else if (!activeTool || activeTool === 'select') {
      e.stopPropagation();
      setSelectedPlot(null);
      setSelectedPropId(item.id);
    }
  };

  const handlePlotClick = (plot) => {
    setSelectedPropId(null);
    setSelectedPlot(plot);
  };

  const handleSelectedBlockColorChange = (nextColor) => {
    if (!selectedPlot || selectedPlot.isPlot !== false) {
      return;
    }

    const selectedKey = getPlotKey(selectedPlot);
    setSelectedPlot((previousPlot) => (
      previousPlot ? { ...previousPlot, blockColor: nextColor } : previousPlot
    ));
    setLayoutData((previousLayout) => {
      if (!previousLayout) {
        return previousLayout;
      }

      return {
        ...previousLayout,
        plots: (previousLayout.plots || []).map((plot) => (
          getPlotKey(plot) === selectedKey ? { ...plot, blockColor: nextColor } : plot
        )),
      };
    });
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await API.put(`/layouts/${id}`, { plots: layoutData?.plots || [] });
      await API.put(`/layouts/${id}/3d`, { props3D: placedItems });
      alert("3D Layout saved successfully!");
      navigate('/admin-dashboard');
    } catch (err) {
      console.error(err);
      alert("Failed to save 3D layout");
    } finally {
      setIsSaving(false);
    }
  };

  if (!layoutData) return <div style={styles.container}><div style={{ ...styles.infoBox, margin: '40px max-content', color: 'white' }}>Loading 3D Editor...</div></div>;

  const width = layoutData.meta?.analysisWidth || 1000;
  const height = layoutData.meta?.analysisHeight || 1000;

  const centerOffsetX = (width * SCALE) / 2;
  const centerOffsetZ = (height * SCALE) / 2;

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div style={styles.leftGroup}>
          <button
            onClick={() => navigate('/admin-dashboard')}
            style={styles.btn}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
          >
            <ArrowLeft width={16} height={16} /> Back to Dashboard
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={styles.btnPrimary}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(29, 78, 216, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.9)'}
          >
            <Save width={16} height={16} /> {isSaving ? "Saving..." : "Save 3D Layout"}
          </button>
        </div>

        {selectedPlot && (
          <div style={styles.infoBox}>
            <h3 style={{ color: "#ff8c00", fontWeight: "bold", fontSize: "1.125rem", margin: "0 0 4px 0" }}>
              {selectedPlot.isPlot === false ? (selectedPlot.plotNo || "Non-plot block") : `Plot ${selectedPlot.plotNo || "-"}`}
            </h3>
            <div style={{ color: "#d1d5db", fontSize: "0.875rem" }}>
              {selectedPlot.isPlot === false ? (
                <p style={{ margin: "4px 0" }}>Usage: <span style={{ color: "#ffffff" }}>Non-plot block</span></p>
              ) : (
                <p style={{ margin: "4px 0" }}>Status: <span style={{ color: "#ffffff" }}>{selectedPlot.status}</span></p>
              )}
              <p style={{ margin: "4px 0" }}>Type: <span style={{ color: "#ffffff" }}>{selectedPlot.points?.length ? 'Polygon' : 'Rectangle'}</span></p>
            </div>
            {selectedPlot.isPlot === false && (
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "#bbf7d0", fontSize: "0.8rem", fontWeight: 700 }}>Block color</span>
                  <input
                    type="color"
                    value={selectedPlot.blockColor || GLOBAL_COLORS.nonPlotBlock}
                    onChange={(event) => handleSelectedBlockColorChange(event.target.value)}
                    style={{ width: "44px", height: "32px", border: "none", borderRadius: "10px", background: "#ffffff", cursor: "pointer" }}
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {NON_PLOT_PRESET_COLORS.map((color) => (
                    <button
                      key={`block-color-${color}`}
                      type="button"
                      onClick={() => handleSelectedBlockColorChange(color)}
                      aria-label={`Set block color ${color}`}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "999px",
                        border: "none",
                        cursor: "pointer",
                        background: color,
                        boxShadow: (selectedPlot.blockColor || GLOBAL_COLORS.nonPlotBlock) === color
                          ? "0 0 0 2px rgba(255,255,255,0.95)"
                          : "0 0 0 1px rgba(255,255,255,0.2)",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.toolbar}>
        {[
          { id: null, icon: "🖱️", name: "Select" },
          { id: "tree", icon: "🌲", name: "Add Tree" },
          { id: "temple", icon: "🏛️", name: "Add Temple" },
          { id: "cricket", icon: "🏏", name: "Add Cricket Box" },
          { id: "court", icon: "🏸", name: "Add Open Court" },
          { id: "watertank", icon: "🚰", name: "Add Water Tank" },
          { id: "grass", icon: "🟩", name: "Add Grass Patch" },
          { id: "gate", icon: "⛩️", name: "Add Gate" },
          { id: "roadtext", icon: "🛣️", name: "Add Road Text" },
          { id: "trash", icon: "🗑️", name: "Delete Prop" }
        ].map((tool) => (
          <button
            key={tool.id || 'select'}
            title={tool.name}
            onClick={() => { setActiveTool(tool.id); if (tool.id !== 'select' && tool.id !== null) setSelectedPropId(null); }}
            style={{ ...styles.toolBtn, ...(activeTool === tool.id ? styles.toolBtnActive : {}) }}
            onMouseEnter={(e) => { if (activeTool !== tool.id) e.currentTarget.style.background = "rgba(255,255,255,0.1)" }}
            onMouseLeave={(e) => { if (activeTool !== tool.id) e.currentTarget.style.background = "transparent" }}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {(!activeTool || activeTool === 'select') && selectedPropId && (
        <div style={styles.transformBar}>
          {[{ id: 'translate', icon: '🔀', title: 'Move' }, { id: 'rotate', icon: '🔄', title: 'Rotate' }, { id: 'scale', icon: '📏', title: 'Scale' }].map(mode => (
            <button
              key={mode.id}
              title={mode.title}
              onClick={() => setTransformMode(mode.id)}
              style={{ ...styles.toolBtn, ...(transformMode === mode.id ? styles.toolBtnActive : {}) }}
              onMouseEnter={(e) => { if (transformMode !== mode.id) e.currentTarget.style.background = "rgba(255,255,255,0.1)" }}
              onMouseLeave={(e) => { if (transformMode !== mode.id) e.currentTarget.style.background = "transparent" }}
            >
              {mode.icon}
            </button>
          ))}
        </div>
      )}

      <Canvas shadows camera={{ position: [0, Math.max(height * SCALE * 1.5, 50), centerOffsetZ + 40], fov: 45 }} style={{ touchAction: 'none' }}>
        <color attach="background" args={[GLOBAL_COLORS.background]} />

        <ambientLight intensity={0.6} />
        <directionalLight
          castShadow
          position={[50, 150, 50]}
          intensity={1.2}
          shadow-mapSize={[1024, 1024]}
        />
        <Environment preset="city" opacity={0.3} />

        <group position={[-centerOffsetX, 0, -centerOffsetZ]}>
          <BoundaryMesh boundary={layoutData.boundary} meta={layoutData.meta} />

          {layoutData.plots.map((plot, index) => (
            <PlotMesh
              key={getPlotKey(plot)}
              plot={plot}
              isSelected={getPlotKey(selectedPlot) === getPlotKey(plot)}
              onClick={handlePlotClick}
              layerOrder={index}
            />
          ))}
        </group>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.06, 0]}
          onClick={handleFloorClick}
          visible={false}
        >
          <planeGeometry args={[2000, 2000]} />
        </mesh>

        {placedItems.map((item) => (
          <RenderProp
            key={item.id}
            item={item}
            onClick={handlePropClick}
            isSelected={selectedPropId === item.id}
            transformMode={transformMode}
            theme={GLOBAL_COLORS}
            onTransformEnd={(newTransform) => {
              setPlacedItems(placedItems.map(p => p.id === item.id ? { ...p, ...newTransform } : p));
            }}
          />
        ))}

        {!is2DMode && (
          <ContactShadows resolution={1024} scale={200} blur={2} opacity={0.5} far={10} color="#000000" />
        )}

        <OrbitControls
          makeDefault
          minPolarAngle={is2DMode ? 0 : 0}
          maxPolarAngle={is2DMode ? 0 : Math.PI / 2 - 0.05}
          enableRotate={!is2DMode}
          enableDamping={true}
          dampingFactor={0.08}
          target={[0, 0, 0]}
        />
      </Canvas>

      <div style={styles.bottomRight}>
        <button
          onClick={() => setIs2DMode(!is2DMode)}
          style={{
            ...styles.modeBtn,
            background: is2DMode ? "#ff8c00" : "#2a2a2a",
            color: is2DMode ? "#000000" : "#ffffff",
            borderColor: is2DMode ? "transparent" : "rgba(255,255,255,0.2)"
          }}
          onMouseEnter={(e) => { if (!is2DMode) e.currentTarget.style.background = "#333333" }}
          onMouseLeave={(e) => { if (!is2DMode) e.currentTarget.style.background = "#2a2a2a" }}
        >
          {is2DMode ? '3D' : '2D'}
        </button>
      </div>

      <div style={{ ...styles.helperToast, opacity: is2DMode ? 0.3 : 1 }}>
        {activeTool ? `Click terrain to place ${activeTool} • Select 'Trash' to delete` : (is2DMode ? 'Left/Right-click to Pan • Scroll to Zoom' : 'Left-click to Rotate • Right-click to Pan')}
      </div>
    </div>
  );
}
