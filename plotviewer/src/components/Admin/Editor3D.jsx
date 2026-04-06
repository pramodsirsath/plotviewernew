import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowLeft, Save, Home } from 'lucide-react';
import FitToLayoutController from "../shared/FitToLayoutController";
import { getPlotCenter, getPlotBounds } from "../../utils/plotGeometry";
import { RenderProp } from '../shared/Props3D';
import API from "../../services/api";
import PlotSelection3D from "../shared/PlotSelection3D";
import CameraAngleController from "../shared/CameraAngleController";
import useIsCoarsePointer from "../shared/useIsCoarsePointer";
import { LAYOUT_MAP_COLORS } from "../../theme/layoutMapTheme";

const SCALE = 0.05;
const DEFAULT_TOUCH_CONTROLS = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const MOBILE_TOUCH_CONTROLS = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

function PlotMesh({ plot, isSelected, isDimmed, onClick }) {
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
          shape.lineTo(plot.points[i] * SCALE, -plot.points[i+1] * SCALE);
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

    const extrudeSettings = {
      depth: isSelected ? 0.08 : 0.05,
      bevelEnabled: false,
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [plot, isSelected]);

  return (
    <group>
      <mesh 
        geometry={geometry} 
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
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
            color={isSelected ? LAYOUT_MAP_COLORS.selectedPlot : LAYOUT_MAP_COLORS.plot} 
            roughness={1} 
            metalness={0} 
            transparent={!!isDimmed}
            opacity={isDimmed ? 0.25 : 1}
          />
        <lineSegments raycast={() => null}>
          <edgesGeometry attach="geometry" args={[geometry]} />
            <lineBasicMaterial attach="material" color={LAYOUT_MAP_COLORS.plotNumber} linewidth={1} transparent={!!isDimmed} opacity={isDimmed ? 0.25 : 1} />
        </lineSegments>
      </mesh>
    </group>
  );
}

function BoundaryMesh({ boundary, meta, isDimOverlay }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (boundary && boundary.length > 0) {
      shape.moveTo(boundary[0] * SCALE, -boundary[1] * SCALE);
      for (let i = 2; i < boundary.length; i += 2) {
         shape.lineTo(boundary[i] * SCALE, -boundary[i+1] * SCALE);
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
      <meshStandardMaterial color={LAYOUT_MAP_COLORS.background} roughness={1} />
    </mesh>
  );
}

// Simple camera animator for Admin editor to focus selected plot
function CameraAnimator({ cameraTargetPlot, layout, isTopDown, angleAnimating, fitLocked }) {
  const { camera, controls } = useThree();
  React.useEffect(() => {
    if (isTopDown || angleAnimating || fitLocked) return;
    if (cameraTargetPlot === undefined) return;
    if (!controls || !layout) return;

    const analysisW = layout.meta?.analysisWidth || 1000;
    const analysisH = layout.meta?.analysisHeight || 1000;
    let frame;
    let cancelled = false;
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startTime = performance.now();

    let endTarget = new THREE.Vector3();
    let endPos = new THREE.Vector3();
    if (cameraTargetPlot) {
      const cx = getPlotCenter(cameraTargetPlot).x * SCALE - (analysisW * SCALE) / 2;
      const cz = getPlotCenter(cameraTargetPlot).y * SCALE - (analysisH * SCALE) / 2;
      endTarget.set(cx, 0, cz);
      const bounds = getPlotBounds(cameraTargetPlot);
      const width = Math.max(0.0001, bounds.width * SCALE);
      const height = Math.max(0.0001, bounds.height * SCALE);
      const fillFraction = 0.7;
      const fov = ((camera.fov || 45) * Math.PI) / 180;
      const aspect = camera.aspect || (window.innerWidth / window.innerHeight);
      const tanFov2 = Math.tan(fov / 2);
      const halfH = height / 2;
      const halfW = width / 2;
      const distV = halfH / (tanFov2 * fillFraction);
      const distH = halfW / (tanFov2 * aspect * fillFraction);
      const dist = Math.max(8, Math.max(distV, distH));
      const polar = controls.getPolarAngle ? controls.getPolarAngle() : Math.PI / 4;
      const azimuth = controls.getAzimuthalAngle ? controls.getAzimuthalAngle() : 0;
      endPos.set(
        endTarget.x + dist * Math.sin(polar) * Math.sin(azimuth),
        endTarget.y + dist * Math.cos(polar),
        endTarget.z + dist * Math.sin(polar) * Math.cos(azimuth)
      );
    } else {
      endTarget.set(0, 0, 0);
      const overviewH = Math.max(analysisH * SCALE * 1.5, 50);
      endPos.set(0, overviewH * 0.6, (analysisH * SCALE) / 2 + 40);
    }

    const cancelOnInteract = () => { cancelled = true; };
    controls.addEventListener('start', cancelOnInteract);

    const animate = (now) => {
      if (cancelled) return;
      const elapsed = now - startTime;
      const t = Math.min(elapsed / 800, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      camera.position.lerpVectors(startPos, endPos, ease);
      controls.update();
      if (t < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => { cancelled = true; controls.removeEventListener('start', cancelOnInteract); if (frame) cancelAnimationFrame(frame); };
  }, [cameraTargetPlot, camera, controls, layout, isTopDown, angleAnimating, fitLocked]);
  return null;
}

const styles = {
  container: {
    width: "100%",
    height: "100vh",
    position: "relative",
    background: LAYOUT_MAP_COLORS.background,
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
  const [cameraTargetPlot, setCameraTargetPlot] = useState(undefined);
  const [isSaving, setIsSaving] = useState(false);
  
  const [placedItems, setPlacedItems] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedPropId, setSelectedPropId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const controlsRef = useRef();
  const [isTopDown, setIsTopDown] = useState(false);
  const [angleAnimating, setAngleAnimating] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [fitLocked, setFitLocked] = useState(false);
  const isCoarsePointer = useIsCoarsePointer();

    // Clear fit lock when user interacts with controls (so Home persists until user starts interacting)
    useEffect(() => {
      const c = controlsRef.current;
      if (!c) return;
      const onStart = () => setFitLocked(false);
      c.addEventListener('start', onStart);
      return () => c.removeEventListener('start', onStart);
    }, [controlsRef]);

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
      setSelectedPropId(item.id);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
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

  if (!layoutData) return <div style={styles.container}><div style={{...styles.infoBox, margin: '40px max-content', color: 'white'}}>Loading 3D Editor...</div></div>;

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
           <button
             onClick={() => { setSelectedPlot(null); setCameraTargetPlot(undefined); setFitLocked(false); setFitKey(k => k + 1); setAngleAnimating(true); }}
             style={{ ...styles.btn, marginLeft: 8 }}
             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
             onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
           >
             <Home width={16} height={16} /> Home
           </button>
           <button
             onClick={() => setIsTopDown((s) => !s)}
             style={{ ...styles.btn, marginLeft: 8 }}
             title={isTopDown ? 'Switch to 3D' : 'Switch to 2D'}
           >
             {isTopDown ? '2D' : '3D'}
           </button>
         </div>

         {selectedPlot && (
            <div style={styles.infoBox}>
               <h3 style={{ color: LAYOUT_MAP_COLORS.selectedPlot, fontWeight: "bold", fontSize: "1.125rem", margin: "0 0 4px 0" }}>Plot {selectedPlot.plotNo}</h3>
               <div style={{ color: "#d1d5db", fontSize: "0.875rem" }}>
                  <p style={{ margin: "4px 0" }}>Status: <span style={{ color: "#ffffff" }}>{selectedPlot.status}</span></p>
                  <p style={{ margin: "4px 0" }}>Type: <span style={{ color: "#ffffff" }}>{selectedPlot.points?.length ? 'Polygon' : 'Rectangle'}</span></p>
               </div>
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
           {[ { id: 'translate', icon: '🔀', title: 'Move' }, { id: 'rotate', icon: '🔄', title: 'Rotate' }, { id: 'scale', icon: '📏', title: 'Scale' } ].map(mode => (
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
        <color attach="background" args={[LAYOUT_MAP_COLORS.background]} />
        
        <ambientLight intensity={0.6} />
        <directionalLight 
          castShadow 
          position={[50, 150, 50]} 
          intensity={1.2} 
          shadow-mapSize={[1024, 1024]}
        />
        <Environment preset="city" opacity={0.3} />

        <CameraAnimator cameraTargetPlot={cameraTargetPlot} layout={layoutData} isTopDown={isTopDown} angleAnimating={angleAnimating} fitLocked={fitLocked} />
        <group position={[-centerOffsetX, 0, -centerOffsetZ]}>
          <BoundaryMesh boundary={layoutData.boundary} meta={layoutData.meta} />
          
          {layoutData.plots.map((plot) => (
            <PlotMesh 
              key={plot.id || Math.random()} 
              plot={plot} 
              isSelected={selectedPlot?._id === plot._id}
              isDimmed={!!selectedPlot && selectedPlot._id !== plot._id}
              onClick={(p) => { setSelectedPlot(p); setCameraTargetPlot(p); }}
            />
          ))}
            {selectedPlot && <PlotSelection3D plot={selectedPlot} scale={SCALE} />}
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
             onTransformEnd={(newTransform) => {
               setPlacedItems(placedItems.map(p => p.id === item.id ? { ...p, ...newTransform } : p));
             }}
           />
        ))}

        <ContactShadows resolution={1024} scale={200} blur={2} opacity={0.5} far={10} color="#000000" />
        
          <CameraAngleController isTopDown={isTopDown} controlsRef={controlsRef} duration={360} onStart={() => setAngleAnimating(true)} onComplete={() => setAngleAnimating(false)} />
          <FitToLayoutController fitKey={fitKey} isTopDown={isTopDown} image={null} layout={layoutData} scale={SCALE} duration={1600} onStart={() => setAngleAnimating(true)} onComplete={() => { setAngleAnimating(false); setFitLocked(true); }} />
          <OrbitControls 
            ref={controlsRef}
            makeDefault
            touches={isCoarsePointer ? MOBILE_TOUCH_CONTROLS : DEFAULT_TOUCH_CONTROLS}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2 - 0.05}
            enableRotate={true}
            enableDamping={true}
            dampingFactor={0.08}
            target={[0, 0, 0]}
          />
      </Canvas>
      {angleAnimating && <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'auto', background: 'transparent' }} />}

      <div style={styles.helperToast}>
        {activeTool ? `Click terrain to place ${activeTool} • Select 'Trash' to delete` : 'Left-click to Rotate • Right-click to Pan'}
      </div>
    </div>
  );
}
