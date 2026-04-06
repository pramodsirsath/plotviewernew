import { TransformControls } from '@react-three/drei';
import { useState } from 'react';
import GroundTextLabel3D from './GroundTextLabel3D';
import { LAYOUT_MAP_COLORS } from '../../theme/layoutMapTheme';
export function TreeMesh() {
  return (
    <group>
      {/* Trunk */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.2, 1.2, 8]} />
        <meshStandardMaterial color="#3d2817" roughness={1} />
      </mesh>
      {/* Main Leaf Cluster */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={LAYOUT_MAP_COLORS.treeLeaf} roughness={0.9} />
      </mesh>
      {/* Left Leaf Cluster */}
      <mesh position={[-0.5, 1.5, 0.3]} castShadow>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color={LAYOUT_MAP_COLORS.treeLeaf} roughness={0.9} />
      </mesh>
      {/* Right Leaf Cluster */}
      <mesh position={[0.4, 2.1, -0.4]} castShadow>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color={LAYOUT_MAP_COLORS.treeLeaf} roughness={0.9} />
      </mesh>
    </group>
  );
}

export function TempleMesh() {
  return (
    <group>
      {/* Base Triple Stairs */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 0.2, 4.4]} />
        <meshStandardMaterial color="#c4bca3" roughness={1} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 0.2, 3.8]} />
        <meshStandardMaterial color="#dfd8c1" roughness={1} />
      </mesh>
      
      {/* Main Inner Chamber */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[2.5, 2, 2.5]} />
        <meshStandardMaterial color="#d8c69f" roughness={0.8} />
      </mesh>
      
      {/* Decorative Pillars */}
      {[-1.5, 1.5].map(x => [-1.5, 1.5].map(z => (
        <mesh position={[x, 1.4, z]} key={`pillar-${x}-${z}`} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 2, 8]} />
          <meshStandardMaterial color="#bda377" roughness={0.6} />
        </mesh>
      )))}
      
      {/* Dome Roof */}
      <mesh position={[0, 3.2, 0]} rotation={[0, Math.PI/4, 0]} castShadow>
        <cylinderGeometry args={[0, 2.2, 1.8, 4]} />
        <meshStandardMaterial color="#bda377" roughness={0.7} />
      </mesh>
      <mesh position={[0, 4.5, 0]} rotation={[0, Math.PI/4, 0]} castShadow>
        <cylinderGeometry args={[0, 0.8, 1.5, 4]} />
        <meshStandardMaterial color="#cda86c" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function CricketMesh() {
  return (
    <group>
      {/* Play Area Grass Pad */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[7, 13]} />
        <meshStandardMaterial color="#556b2f" roughness={0.9} />
      </mesh>
      {/* Inner Pitch */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 9]} />
        <meshStandardMaterial color="#888888" roughness={0.9} />
      </mesh>
      
      <mesh position={[0, 0.04, 3.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.5, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.04, -3.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.5, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      
      {/* Dark Corner Posts */}
      {[-2.2, 2.2].map(x => [-5, 5].map(z => (
         <mesh position={[x, 1.25, z]} key={`post-${x}-${z}`} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 2.5]} />
            <meshStandardMaterial color="#111111" />
         </mesh>
      )))}
      
      {/* DARK, VISIBLE Cage Enclosure */}
      <mesh position={[0, 1.25, 0]}>
        {/* Very light density wireframe so it's easily readable */}
        <boxGeometry args={[4.4, 2.5, 10, 4, 2, 8]} />
        <meshStandardMaterial color="#0a0a0a" wireframe transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function CourtMesh() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 10]} />
        <meshStandardMaterial color="#9c4235" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5, 9]} />
        <meshStandardMaterial color="#427a5b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
         <planeGeometry args={[5, 0.06]} />
         <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Small Net Posts & Net */}
      <mesh position={[-2.5, 0.4, 0]}><cylinderGeometry args={[0.04, 0.04, 0.8]} /><meshStandardMaterial color="#2d2d2d" /></mesh>
      <mesh position={[2.5, 0.4, 0]}><cylinderGeometry args={[0.04, 0.04, 0.8]} /><meshStandardMaterial color="#2d2d2d" /></mesh>
      <mesh position={[0, 0.4, 0]}>
         <planeGeometry args={[5, 0.7]} />
         <meshStandardMaterial color="#ffffff" wireframe transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

export function GateMesh() {
  return (
    <group>
      {/* Left Pillar */}
      <mesh position={[-2.5, 1.8, 0]} castShadow>
        <boxGeometry args={[0.8, 3.6, 0.8]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
      </mesh>
      {/* Right Pillar */}
      <mesh position={[2.5, 1.8, 0]} castShadow>
        <boxGeometry args={[0.8, 3.6, 0.8]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
      </mesh>
      {/* Decorative Bridge */}
      <mesh position={[0, 3.8, 0]} castShadow>
        <boxGeometry args={[6.5, 0.6, 0.8]} />
        <meshStandardMaterial color="#cda86c" roughness={0.6} />
      </mesh>
      {/* Top Banner Structure */}
      <mesh position={[0, 4.4, 0]} castShadow>
        <boxGeometry args={[2.5, 0.6, 0.6]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
    </group>
  );
}

export function GrassMesh() {
  return (
    <group>
      {/* Completely flat grass pad */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5, 5]} />
        <meshStandardMaterial color={LAYOUT_MAP_COLORS.grass} roughness={1} />
      </mesh>
    </group>
  );
}

export function WaterTankMesh() {
  return (
    <group>
      {/* Pillars */}
      {[-1.5, 1.5].map(x => [-1.5, 1.5].map(z => (
         <mesh position={[x, 2, z]} key={`tankpost-${x}-${z}`} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 4]} />
            <meshStandardMaterial color="#555555" />
         </mesh>
      )))}
      {/* Support Plate */}
      <mesh position={[0, 4, 0]} castShadow>
         <boxGeometry args={[3.6, 0.3, 3.6]} />
         <meshStandardMaterial color="#444444" />
      </mesh>
      {/* Big Blue/Grey Tank */}
      <mesh position={[0, 6, 0]} castShadow>
         <cylinderGeometry args={[2.5, 2.5, 3.5, 16]} />
         <meshStandardMaterial color="#aab2c0" roughness={0.6} />
      </mesh>
      {/* Top Cap */}
      <mesh position={[0, 7.8, 0]} castShadow>
         <cylinderGeometry args={[2.6, 2.6, 0.2, 16]} />
         <meshStandardMaterial color="#444444" />
      </mesh>
    </group>
  );
}

export function RoadTextMesh({ item }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Asphalt Plane */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color={LAYOUT_MAP_COLORS.road} roughness={0.95} />
      </mesh>

      {/* Text Label */}
      <GroundTextLabel3D
        text={item?.text || "ROAD"}
        position={[0, 0, 0.05]}
        fontSize={1.35}
        color={LAYOUT_MAP_COLORS.roadText}
        outlineColor={LAYOUT_MAP_COLORS.roadTextAccent}
        outlineWidth={0.22}
        depthWrite={false}
      />
    </group>
  );
}

export function RenderProp({ item, onClick, isSelected, transformMode, onTransformEnd }) {
  const [target, setTarget] = useState(null);

  return (
    <>
      {isSelected && target && (
        <TransformControls 
          object={target} 
          mode={transformMode || 'translate'} 
          showX={transformMode === 'rotate' ? false : true}
          showY={transformMode === 'translate' ? false : true}
          showZ={transformMode === 'rotate' ? false : true}
          onMouseUp={() => {
            if (target && onTransformEnd) {
              onTransformEnd({
                position: target.position.toArray(),
                rotation: target.rotation.toArray(),
                scale: target.scale.toArray()
              });
            }
          }} 
        />
      )}
      <group 
        ref={setTarget}
        position={item.position}
        rotation={item.rotation || [0, 0, 0]}
        scale={item.scale || [1, 1, 1]}
        onClick={(e) => {
          if (onClick) {
            onClick(item, e);
          }
        }}
      >
        {item.type === 'tree' && <TreeMesh />}
        {item.type === 'temple' && <TempleMesh />}
        {item.type === 'court' && <CourtMesh />}
        {item.type === 'cricket' && <CricketMesh />}
        {item.type === 'gate' && <GateMesh />}
        {item.type === 'grass' && <GrassMesh />}
        {item.type === 'watertank' && <WaterTankMesh />}
        {item.type === 'roadtext' && <RoadTextMesh item={item} />}
      </group>
    </>
  );
}
