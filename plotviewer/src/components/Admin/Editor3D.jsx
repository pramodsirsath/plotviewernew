import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { ArrowLeft, Save } from 'lucide-react';
import { RenderProp } from '../shared/Props3D';
import GroundTextLabel3D from '../shared/GroundTextLabel3D';
import HtmlPlotBorder3D from '../shared/HtmlPlotBorder3D';
import LayoutSceneEnvironment from '../shared/LayoutSceneEnvironment';
import PlotSelection3D from '../shared/PlotSelection3D';
import useGlobalLayoutTheme, { primeGlobalLayoutThemeCache } from '../shared/useGlobalLayoutTheme';
import useIsCoarsePointer from '../shared/useIsCoarsePointer';
import useOrbitInteractionMode, {
  DESKTOP_ORBIT_MOUSE_BUTTONS,
  LAYOUT_TOUCH_CONTROLS,
} from '../shared/useOrbitInteractionMode';
import API from "../../services/api";
import { GLOBAL_COLORS } from '../../theme/globalColors';
import {
  applyLayoutAppearancePreset,
  DEFAULT_RESOLVED_LAYOUT_THEME,
  extractLayoutAppearancePayload,
  getLayoutRenderProfile,
  LAYOUT_APPEARANCE_COLOR_FIELDS,
  LAYOUT_APPEARANCE_PRESETS,
  resolveLayoutAppearance,
} from '../../theme/layoutAppearance';
import {
  getPlotBounds,
  getPlotCenter,
  getPlotRenderPoints,
} from '../../utils/plotGeometry';

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
const BOUNDARY_LIFT = -0.05;
const PLOT_SURFACE_LIFT = BOUNDARY_LIFT + 0.0025;
const PLOT_LABEL_LIFT = PLOT_SURFACE_LIFT + 0.022;
const NON_PLOT_SURFACE_LIFT = PLOT_SURFACE_LIFT + 0.006;
const NON_PLOT_SELECTED_SURFACE_LIFT = PLOT_SURFACE_LIFT + 0.009;
const NON_PLOT_OUTLINE_LIFT = 0.005;
const NON_PLOT_LAYER_STEP = 0.003;
const PLOT_OUTLINE_LIFT = 0.0035;
const SELECTED_OVERLAY_ELEVATION = PLOT_SURFACE_LIFT + 0.004;
const ORBIT_ROTATE_SPEED = 3.2;
const ORBIT_ZOOM_SPEED = 1.2;
const APPEARANCE_SLIDERS = [
  { key: "brightness", label: "Brightness", min: 0.85, max: 1.35, step: 0.01 },
  { key: "contrast", label: "Contrast", min: 0.85, max: 1.35, step: 0.01 },
  { key: "sharpness", label: "Sharpness", min: 0.85, max: 1.35, step: 0.01 },
  { key: "borderThickness", label: "Plot Border Thickness", min: 0, max: 1.6, step: 0.01 },
];

const getPlotKey = (plot) => plot?._id || plot?.id;
const serializeAppearance = (appearance) => JSON.stringify(appearance);
const formatSliderValue = (value) => `${Number(value).toFixed(2)}x`;

function PlotMesh({ plot, isSelected, onClick, layerOrder = 0, theme, renderProfile }) {
  const isNonPlotBlock = plot.isPlot === false;
  const renderPoints = useMemo(() => getPlotRenderPoints(plot), [plot]);
  const bounds = useMemo(() => getPlotBounds(plot), [plot]);
  const center = useMemo(() => getPlotCenter(plot), [plot]);

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();

    if (renderPoints.length >= 6) {
      shape.moveTo(renderPoints[0] * SCALE, -renderPoints[1] * SCALE);
      for (let i = 2; i < renderPoints.length; i += 2) {
        shape.lineTo(renderPoints[i] * SCALE, -renderPoints[i + 1] * SCALE);
      }
      shape.lineTo(renderPoints[0] * SCALE, -renderPoints[1] * SCALE);
    } else {
      shape.moveTo(plot.x * SCALE, -plot.y * SCALE);
      shape.lineTo((plot.x + plot.width) * SCALE, -plot.y * SCALE);
      shape.lineTo((plot.x + plot.width) * SCALE, -(plot.y + plot.height) * SCALE);
      shape.lineTo(plot.x * SCALE, -(plot.y + plot.height) * SCALE);
      shape.lineTo(plot.x * SCALE, -plot.y * SCALE);
    }

    return new THREE.ShapeGeometry(shape);
  }, [plot, renderPoints]);

  const outlinePoints = useMemo(() => {
    const outlineLift = isNonPlotBlock
      ? NON_PLOT_OUTLINE_LIFT
      : PLOT_OUTLINE_LIFT;
    const pts = [];
    if (renderPoints.length >= 6) {
      for (let i = 0; i < renderPoints.length; i += 2) {
        pts.push(new THREE.Vector3(renderPoints[i] * SCALE, -renderPoints[i + 1] * SCALE, outlineLift));
      }
      pts.push(new THREE.Vector3(renderPoints[0] * SCALE, -renderPoints[1] * SCALE, outlineLift));
    } else {
      pts.push(new THREE.Vector3(plot.x * SCALE, -plot.y * SCALE, outlineLift));
      pts.push(new THREE.Vector3((plot.x + plot.width) * SCALE, -plot.y * SCALE, outlineLift));
      pts.push(new THREE.Vector3((plot.x + plot.width) * SCALE, -(plot.y + plot.height) * SCALE, outlineLift));
      pts.push(new THREE.Vector3(plot.x * SCALE, -(plot.y + plot.height) * SCALE, outlineLift));
      pts.push(new THREE.Vector3(plot.x * SCALE, -plot.y * SCALE, outlineLift));
    }
    return pts;
  }, [plot, renderPoints, isNonPlotBlock]);

  const surfaceColor = plot.isPlot === false
    ? (plot.blockColor || theme.nonPlotBlock)
    : theme.plot;
  const layerLift = isNonPlotBlock ? layerOrder * NON_PLOT_LAYER_STEP : 0;
  const surfaceLift = isNonPlotBlock
    ? ((isSelected ? NON_PLOT_SELECTED_SURFACE_LIFT : NON_PLOT_SURFACE_LIFT) + layerLift)
    : PLOT_SURFACE_LIFT;
  const showOutline = !isNonPlotBlock || isSelected;
  const outlineColor = isNonPlotBlock ? theme.selectedPlotpopup : theme.plotBorder;
  const meshRenderOrder = isNonPlotBlock ? 18 + layerOrder * 2 : 0;
  const outlineRenderOrder = meshRenderOrder + 1;
  const labelSize = Math.max(0.4, Math.min(bounds.width * SCALE * 0.45, bounds.height * SCALE * 0.45, 2.5));

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
      >
        <meshStandardMaterial
          color={surfaceColor}
          roughness={isNonPlotBlock ? Math.min(1, renderProfile.plotRoughness + 0.06) : renderProfile.plotRoughness}
          metalness={0}
          side={isNonPlotBlock ? THREE.DoubleSide : THREE.FrontSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-4}
        />
      </mesh>
      {showOutline ? (
        !isNonPlotBlock && renderProfile.useHtmlPlotBorder ? (
          <HtmlPlotBorder3D
            plot={plot}
            scale={SCALE}
            elevation={surfaceLift}
            color={outlineColor}
            lineWidth={renderProfile.borderWidth}
            opacity={1}
          />
        ) : (
          <Line
            points={outlinePoints}
            color={outlineColor}
            lineWidth={isNonPlotBlock ? Math.max(2.2, renderProfile.borderWidth + 0.8) : renderProfile.borderWidth}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, surfaceLift, 0]}
            renderOrder={outlineRenderOrder}
            raycast={() => null}
            transparent={false}
            depthTest={false}
            depthWrite={false}
          />
        )
      ) : null}
      {!isNonPlotBlock && plot.plotNo ? (
        <GroundTextLabel3D
          text={plot.plotNo}
          renderMode="html"
          position={[center.x * SCALE, PLOT_LABEL_LIFT, center.y * SCALE]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={labelSize}
          color={isSelected ? theme.white : theme.plotNumber}
          depthWrite={false}
          depthTest={false}
          renderOrder={2}
          raycast={() => null}
          sharpness={renderProfile.labelSharpness}
        />
      ) : null}
    </group>
  );
}

function BoundaryMesh({ boundary, meta, theme, renderProfile }) {
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

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, BOUNDARY_LIFT, 0]}>
      <meshStandardMaterial
        color={theme.road}
        roughness={renderProfile.roadRoughness}
        polygonOffset
        polygonOffsetFactor={4}
        polygonOffsetUnits={8}
      />
    </mesh>
  );
}

function CompoundWall({ boundary, meta, theme, renderProfile }) {
  const wallGeometry = useMemo(() => {
    const points = [];
    if (boundary && boundary.length >= 6) {
      for (let i = 0; i < boundary.length; i += 2) {
        points.push(new THREE.Vector3(boundary[i] * SCALE, 0, boundary[i + 1] * SCALE));
      }
      points.push(points[0].clone());
    } else if (meta) {
      const width = meta.analysisWidth * SCALE;
      const height = meta.analysisHeight * SCALE;
      points.push(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(width, 0, 0),
        new THREE.Vector3(width, 0, height),
        new THREE.Vector3(0, 0, height),
        new THREE.Vector3(0, 0, 0)
      );
    }
    if (points.length < 3) {
      return null;
    }

    const wallHeight = 0.5;
    const positions = [];
    const indices = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const baseIndex = positions.length / 3;
      const start = points[i];
      const end = points[i + 1];
      positions.push(
        start.x, 0, start.z,
        end.x, 0, end.z,
        end.x, wallHeight, end.z,
        start.x, wallHeight, start.z
      );
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [boundary, meta]);

  if (!wallGeometry) {
    return null;
  }

  return (
    <mesh geometry={wallGeometry}>
      <meshStandardMaterial
        color={theme.compoundWall}
        roughness={renderProfile.wallRoughness}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
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
    alignItems: "flex-start",
    gap: "16px",
    maxHeight: "calc(100vh - 24px)",
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
  },
  sidePanels: {
    pointerEvents: "auto",
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    maxWidth: "min(56vw, 780px)",
    maxHeight: "calc(100vh - 48px)",
  },
  appearancePanel: {
    width: "min(360px, calc(100vw - 48px))",
    background: "rgba(0, 0, 0, 0.72)",
    backdropFilter: "blur(14px)",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: "16px",
    color: "#e5e7eb",
    boxShadow: "0 18px 40px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  },
  appearanceHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: "14px",
  },
  appearanceTitle: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 800,
    color: "#ffffff",
  },
  appearanceSubtitle: {
    fontSize: "0.78rem",
    color: "#cbd5e1",
    lineHeight: 1.45,
  },
  appearanceSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingTop: "12px",
    marginTop: "12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  appearanceSectionLabel: {
    fontSize: "0.76rem",
    fontWeight: 700,
    color: "#f8fafc",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  appearanceColorRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  appearanceColorLabel: {
    fontSize: "0.9rem",
    color: "#e5e7eb",
  },
  appearanceColorControl: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  appearanceColorSwatch: {
    width: "20px",
    height: "20px",
    borderRadius: "999px",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.2)",
  },
  appearanceColorInput: {
    width: "46px",
    height: "32px",
    border: "none",
    borderRadius: "10px",
    background: "transparent",
    cursor: "pointer",
  },
  appearancePresetRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  appearancePresetBtn: {
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e5e7eb",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 700,
  },
  appearanceSliderRow: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  appearanceSliderHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "0.88rem",
    color: "#e5e7eb",
  },
  appearanceSliderValue: {
    color: "#93c5fd",
    fontWeight: 700,
    minWidth: "44px",
    textAlign: "right",
  },
  appearanceSlider: {
    width: "100%",
    accentColor: "#60a5fa",
    cursor: "pointer",
  },
  appearanceActions: {
    display: "flex",
    gap: "10px",
  },
  appearanceFooter: {
    position: "sticky",
    bottom: 0,
    marginTop: "16px",
    paddingTop: "14px",
    paddingBottom: "4px",
    background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.86) 26%, rgba(0,0,0,0.96) 100%)",
  },
  appearanceActionBtn: {
    flex: 1,
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#ffffff",
    padding: "10px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },
  appearanceNotice: {
    marginTop: "12px",
    fontSize: "0.8rem",
    lineHeight: 1.4,
  },
  bottomRight: {
    position: "absolute",
    left: "24px",
    bottom: "24px",
    zIndex: 10,
    pointerEvents: "auto",
  },
};


export default function Editor3D() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isCoarsePointer = useIsCoarsePointer();
  const controlsRef = useRef(null);
  const baseGroupRef = useRef(null);
  const propsGroupRef = useRef(null);
  const {
    theme: savedGlobalTheme,
    setTheme: setGlobalTheme,
    isLoading: isThemeLoading,
  } = useGlobalLayoutTheme();
  const [layoutData, setLayoutData] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [is2DMode, setIs2DMode] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [appearanceNotice, setAppearanceNotice] = useState("");
  const [appearanceTone, setAppearanceTone] = useState("muted");

  const [placedItems, setPlacedItems] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedPropId, setSelectedPropId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  useOrbitInteractionMode({
    controlsRef,
    isCoarsePointer,
    rotateEnabled: !is2DMode,
  });
  const defaultAppearance = useMemo(
    () => extractLayoutAppearancePayload(DEFAULT_RESOLVED_LAYOUT_THEME),
    []
  );
  const savedAppearance = useMemo(
    () => extractLayoutAppearancePayload(savedGlobalTheme),
    [savedGlobalTheme]
  );
  const savedAppearanceSerialized = useMemo(
    () => serializeAppearance(savedAppearance),
    [savedAppearance]
  );
  const [appearanceDraft, setAppearanceDraft] = useState(savedAppearance);

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

  useEffect(() => {
    if (!isThemeLoading) {
      setAppearanceDraft(savedAppearance);
    }
  }, [isThemeLoading, savedAppearance, savedAppearanceSerialized]);

  const previewTheme = useMemo(
    () => resolveLayoutAppearance(appearanceDraft),
    [appearanceDraft]
  );
  const renderProfile = useMemo(
    () => getLayoutRenderProfile(previewTheme, { isCoarsePointer }),
    [isCoarsePointer, previewTheme]
  );
  const appearanceDirty = useMemo(
    () => serializeAppearance(appearanceDraft) !== savedAppearanceSerialized,
    [appearanceDraft, savedAppearanceSerialized]
  );

  const updateAppearanceDraft = (updater) => {
    setAppearanceDraft((previousDraft) => {
      const candidate = typeof updater === "function"
        ? updater(previousDraft)
        : updater;
      return extractLayoutAppearancePayload(candidate);
    });
  };

  const handleAppearanceColorChange = (key, value) => {
    updateAppearanceDraft((previousDraft) => ({
      ...previousDraft,
      palette: {
        ...previousDraft.palette,
        [key]: value,
      },
    }));
  };

  const handleAppearancePresetClick = (presetId) => {
    updateAppearanceDraft((previousDraft) => (
      applyLayoutAppearancePreset(previousDraft, presetId).appearance
    ));
  };

  const handleAppearanceSliderChange = (key, value) => {
    updateAppearanceDraft((previousDraft) => ({
      ...previousDraft,
      render: {
        ...previousDraft.render,
        [key]: Number(value),
      },
    }));
  };

  const handleResetAppearance = () => {
    setAppearanceDraft(defaultAppearance);
    setAppearanceTone("muted");
    setAppearanceNotice("Preview reset to the default layout theme. Save theme to apply it app-wide.");
  };

  const handleSaveAppearance = async () => {
    try {
      setIsSavingAppearance(true);
      setAppearanceTone("muted");
      setAppearanceNotice("");

      const payload = extractLayoutAppearancePayload(appearanceDraft);
      const response = await API.put("/appearance/theme", payload);

      primeGlobalLayoutThemeCache(response.data);
      setGlobalTheme(response.data);
      setAppearanceDraft(extractLayoutAppearancePayload(response.data));
      setAppearanceTone("success");
      setAppearanceNotice("Global layout theme saved. All layout views now use this appearance.");
    } catch (error) {
      console.error("Failed to save appearance theme:", error);
      setAppearanceTone("error");
      setAppearanceNotice(error.response?.data?.message || "Could not save the appearance theme.");
    } finally {
      setIsSavingAppearance(false);
    }
  };

  const handleFloorClick = (e) => {
    e.stopPropagation();
    if (!activeTool || activeTool === 'select') {
      setSelectedPropId(null);
      setSelectedPlot(null);
      return;
    }
    if (activeTool === 'trash') return;

    let text = null;
    if (activeTool === 'text') {
      text = window.prompt("Enter text:", "Sample Text");
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
    setPlacedItems((previousItems) => [...previousItems, newItem]);
    setSelectedPropId(newItem.id);
    setActiveTool('select');
  };

  const handlePropClick = (item, e) => {
    if (activeTool === 'trash') {
      e.stopPropagation();
      setPlacedItems((previousItems) => previousItems.filter((entry) => entry.id !== item.id));
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
      setIsSavingLayout(true);
      
      let baseModelUrl = layoutData?.modelAssets?.baseModelUrl;
      let propModelUrls = layoutData?.modelAssets?.propModelUrls || [];

      // Export Base Layout
      if (baseGroupRef.current) {
        const exporter = new GLTFExporter();
        const baseBuffer = await new Promise((resolve, reject) => {
          exporter.parse(baseGroupRef.current, resolve, reject, { binary: true });
        });
        const blob = new Blob([baseBuffer], { type: 'application/octet-stream' });
        const formData = new FormData();
        formData.append('model', blob, `base_${id}.glb`);
        const res = await API.post('/upload-model', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        baseModelUrl = res.data.modelUrl;
      }

      // Export Props Layout
      if (propsGroupRef.current) {
        const exporter = new GLTFExporter();
        const propsBuffer = await new Promise((resolve, reject) => {
          exporter.parse(propsGroupRef.current, resolve, reject, { binary: true });
        });
        const blob = new Blob([propsBuffer], { type: 'application/octet-stream' });
        const formData = new FormData();
        formData.append('model', blob, `props_${id}.glb`);
        const res = await API.post('/upload-model', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        propModelUrls = [res.data.modelUrl];
      }

      const modelAssets = {
        ...layoutData?.modelAssets,
        baseModelUrl,
        propModelUrls,
      };

      await API.put(`/layouts/${id}`, { 
        plots: layoutData?.plots || [],
        modelAssets
      });
      await API.put(`/layouts/${id}/3d`, { props3D: placedItems });
      
      alert("3D Layout and GLB models saved successfully!");
      navigate('/admin-dashboard');
    } catch (err) {
      console.error(err);
      alert("Failed to save 3D layout or upload GLB models");
    } finally {
      setIsSavingLayout(false);
    }
  };

  if (!layoutData) return <div style={{ ...styles.container, background: previewTheme.background }}><div style={{ ...styles.infoBox, margin: '40px max-content', color: 'white' }}>Loading 3D Editor...</div></div>;

  const width = layoutData.meta?.analysisWidth || 1000;
  const height = layoutData.meta?.analysisHeight || 1000;
  const appearanceControlsDisabled = isThemeLoading || isSavingAppearance;
  const selectedBlockColor = selectedPlot?.blockColor || previewTheme.nonPlotBlock;

  const centerOffsetX = (width * SCALE) / 2;
  const centerOffsetZ = (height * SCALE) / 2;

  return (
    <div style={{ ...styles.container, background: previewTheme.background }}>
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
            disabled={isSavingLayout}
            style={styles.btnPrimary}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(29, 78, 216, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.9)'}
          >
            <Save width={16} height={16} /> {isSavingLayout ? "Saving..." : "Save 3D Layout"}
          </button>
        </div>

        <div style={styles.sidePanels}>
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
                      value={selectedBlockColor}
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
                          boxShadow: selectedBlockColor === color
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

          <div style={{ ...styles.appearancePanel, opacity: appearanceControlsDisabled ? 0.82 : 1 }}>
            <div style={styles.appearanceHeader}>
              <h2 style={styles.appearanceTitle}>Appearance</h2>
              <div style={styles.appearanceSubtitle}>
                Edit the global layout theme here. This preview updates live and the saved appearance is reused in admin, builder, customer, and public layout views.
              </div>
            </div>

            <div style={styles.appearanceSection}>
              <div style={styles.appearanceSectionLabel}>Surface Colors</div>
              {LAYOUT_APPEARANCE_COLOR_FIELDS.map((field) => (
                <div key={field.key} style={styles.appearanceColorRow}>
                  <span style={styles.appearanceColorLabel}>{field.label}</span>
                  <div style={styles.appearanceColorControl}>
                    <span
                      style={{
                        ...styles.appearanceColorSwatch,
                        background: appearanceDraft.palette[field.key],
                      }}
                    />
                    <input
                      type="color"
                      disabled={appearanceControlsDisabled}
                      value={appearanceDraft.palette[field.key]}
                      onChange={(event) => handleAppearanceColorChange(field.key, event.target.value)}
                      style={styles.appearanceColorInput}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.appearanceSection}>
              <div style={styles.appearanceSectionLabel}>Render Presets</div>
              <div style={styles.appearancePresetRow}>
                {LAYOUT_APPEARANCE_PRESETS.map((preset) => {
                  const isActive = appearanceDraft.render.preset === preset.id;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={appearanceControlsDisabled}
                      onClick={() => handleAppearancePresetClick(preset.id)}
                      title={preset.description}
                      style={{
                        ...styles.appearancePresetBtn,
                        background: isActive ? "rgba(59, 130, 246, 0.22)" : "rgba(255,255,255,0.04)",
                        borderColor: isActive ? "rgba(96, 165, 250, 0.65)" : "rgba(255,255,255,0.12)",
                        color: isActive ? "#ffffff" : "#e5e7eb",
                      }}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.appearanceSection}>
              <div style={styles.appearanceSectionLabel}>Render Controls</div>
              {APPEARANCE_SLIDERS.map((slider) => (
                <div key={slider.key} style={styles.appearanceSliderRow}>
                  <div style={styles.appearanceSliderHeader}>
                    <span>{slider.label}</span>
                    <span style={styles.appearanceSliderValue}>{formatSliderValue(appearanceDraft.render[slider.key])}</span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    disabled={appearanceControlsDisabled}
                    value={appearanceDraft.render[slider.key]}
                    onChange={(event) => handleAppearanceSliderChange(slider.key, event.target.value)}
                    style={styles.appearanceSlider}
                  />
                </div>
              ))}
            </div>

            <div style={styles.appearanceFooter}>
              <div style={styles.appearanceActions}>
                <button
                  type="button"
                  disabled={appearanceControlsDisabled}
                  onClick={handleResetAppearance}
                  style={{ ...styles.appearanceActionBtn, opacity: appearanceControlsDisabled ? 0.6 : 1 }}
                >
                  Reset to Default
                </button>
                <button
                  type="button"
                  disabled={appearanceControlsDisabled || !appearanceDirty}
                  onClick={handleSaveAppearance}
                  style={{
                    ...styles.appearanceActionBtn,
                    background: "rgba(37, 99, 235, 0.9)",
                    opacity: appearanceControlsDisabled || !appearanceDirty ? 0.6 : 1,
                  }}
                >
                  {isSavingAppearance ? "Saving..." : "Save Theme"}
                </button>
              </div>

              <div
                style={{
                  ...styles.appearanceNotice,
                  color: appearanceTone === "error"
                    ? "#fca5a5"
                    : appearanceTone === "success"
                      ? "#86efac"
                      : "#cbd5e1",
                }}
              >
                {appearanceNotice || (
                  isThemeLoading
                    ? "Loading the saved global theme..."
                    : "Only the visual theme changes here. Plot geometry, props placement, status, search, zoom, and selection behavior stay intact."
                )}
              </div>
            </div>
          </div>
        </div>
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
          { id: "text", icon: "Aa", name: "Add Text" },
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

      <Canvas
        dpr={renderProfile.dpr}
        performance={{ min: 1 }}
        shadows={false}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, Math.max(height * SCALE * 1.5, 50), centerOffsetZ + 40], fov: 45 }}
        style={{ touchAction: 'none' }}
      >
        <color attach="background" args={[previewTheme.background]} />
        <LayoutSceneEnvironment theme={previewTheme} isCoarsePointer={isCoarsePointer} />

        <group ref={baseGroupRef} position={[-centerOffsetX, 0, -centerOffsetZ]}>
          <BoundaryMesh
            boundary={layoutData.boundary}
            meta={layoutData.meta}
            theme={previewTheme}
            renderProfile={renderProfile}
          />

          <CompoundWall
            boundary={layoutData.boundary}
            meta={layoutData.meta}
            theme={previewTheme}
            renderProfile={renderProfile}
          />

          {layoutData.plots.map((plot, index) => (
            <PlotMesh
              key={getPlotKey(plot)}
              plot={plot}
              isSelected={getPlotKey(selectedPlot) === getPlotKey(plot)}
              onClick={handlePlotClick}
              layerOrder={index}
              theme={previewTheme}
              renderProfile={renderProfile}
            />
          ))}

          {selectedPlot && selectedPlot.isPlot !== false ? (
            <PlotSelection3D
              plot={selectedPlot}
              scale={SCALE}
              elevation={SELECTED_OVERLAY_ELEVATION}
              pixelToFt={layoutData?.meta?.pixelToFt || 1}
              theme={previewTheme}
            />
          ) : null}
        </group>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.06, 0]}
          onClick={handleFloorClick}
          visible={false}
        >
          <planeGeometry args={[2000, 2000]} />
        </mesh>

        <group ref={propsGroupRef}>
          {placedItems.map((item) => (
            <RenderProp
              key={item.id}
              item={item}
              onClick={handlePropClick}
              isSelected={selectedPropId === item.id}
              transformMode={transformMode}
              theme={previewTheme}
              onTransformEnd={(newTransform) => {
                setPlacedItems((previousItems) => previousItems.map((entry) => (
                  entry.id === item.id ? { ...entry, ...newTransform } : entry
                )));
              }}
            />
          ))}
        </group>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          touches={LAYOUT_TOUCH_CONTROLS}
          mouseButtons={DESKTOP_ORBIT_MOUSE_BUTTONS}
          minPolarAngle={is2DMode ? 0 : 0}
          maxPolarAngle={is2DMode ? 0 : Math.PI / 2 - 0.05}
          enableRotate={!is2DMode}
          enablePan={true}
          enableDamping={false}
          screenSpacePanning
          rotateSpeed={ORBIT_ROTATE_SPEED}
          zoomSpeed={ORBIT_ZOOM_SPEED}
          panSpeed={1.15}
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

      <div style={{ ...styles.helperToast, opacity: 0, pointerEvents: 'none', visibility: 'hidden' }}>
        {activeTool ? `Click terrain to place ${activeTool} • Select 'Trash' to delete` : (is2DMode ? 'Left/Right-click to Pan • Scroll to Zoom' : 'Left-click to Rotate • Right-click to Pan')}
      </div>
      <div style={{ ...styles.helperToast, opacity: is2DMode ? 0.3 : 1 }}>
        {activeTool
          ? `Click terrain to place ${activeTool} • Select 'Trash' to delete`
          : isCoarsePointer
            ? 'One finger to drag • Two fingers to rotate and zoom'
            : is2DMode
              ? 'Drag to pan • Scroll to zoom'
              : 'Drag to pan • Hold Ctrl and drag to rotate • Scroll to zoom'}
      </div>
    </div>
  );
}
