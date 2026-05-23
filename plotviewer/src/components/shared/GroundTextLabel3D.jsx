import React from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { LAYOUT_MAP_COLORS, LAYOUT_MAP_FONT_FAMILY } from "../../theme/layoutMapTheme";
import { useThree } from "@react-three/fiber";


let fontLoadPromise = null;
let constrainedDeviceCache = null;
const HTML_LABEL_FONT_PX = 96;
const HTML_LABEL_LINE_HEIGHT = 1.02;
const HTML_LABEL_DISTANCE_FACTOR = (400 * 1.06) / (HTML_LABEL_FONT_PX * HTML_LABEL_LINE_HEIGHT);

const ensureLayoutFontLoaded = () => {
  if (typeof document === "undefined" || !document.fonts?.load) {
    return Promise.resolve();
  }

  if (!fontLoadPromise) {
    fontLoadPromise = Promise.all([
      document.fonts.load(`700 32px ${LAYOUT_MAP_FONT_FAMILY}`),
      document.fonts.load(`600 32px ${LAYOUT_MAP_FONT_FAMILY}`),
      document.fonts.load(`500 32px ${LAYOUT_MAP_FONT_FAMILY}`),
    ]).catch(() => {});
  }

  return fontLoadPromise;
};

const getIsConstrainedLabelDevice = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  if (constrainedDeviceCache === null) {
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const deviceMemory = Number(window.navigator?.deviceMemory);
    const hardwareConcurrency = Number(window.navigator?.hardwareConcurrency);
    const hasLowMemory = Number.isFinite(deviceMemory) && deviceMemory <= 4;
    const hasLowCpu = Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 4;

    constrainedDeviceCache = isCoarsePointer && (hasLowMemory || hasLowCpu);
  }

  return constrainedDeviceCache;
};

const drawTextLine = ({ context, text, x, y, fill, stroke, strokeWidth }) => {
  if (stroke && strokeWidth > 0) {
    context.lineJoin = "round";
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth;
    context.strokeText(text, x, y);
  }

  context.fillStyle = fill;
  context.fillText(text, x, y);
};

const buildHtmlTextShadow = (outlineColor, outlineWidth) => {
  if (!outlineColor || outlineWidth <= 0) {
    return "none";
  }

  const px = Math.max(1, Math.round(HTML_LABEL_FONT_PX * outlineWidth * 0.22));
  return [
    `${px}px 0 0 ${outlineColor}`,
    `-${px}px 0 0 ${outlineColor}`,
    `0 ${px}px 0 ${outlineColor}`,
    `0 -${px}px 0 ${outlineColor}`,
    `${px}px ${px}px 0 ${outlineColor}`,
    `${px}px -${px}px 0 ${outlineColor}`,
    `-${px}px ${px}px 0 ${outlineColor}`,
    `-${px}px -${px}px 0 ${outlineColor}`,
  ].join(", ");
};

const GroundTextLabel3D = ({
  text,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  fontSize = 1,
  maxWidth = null,
  maxHeight = null,
  fontWeight = 700,
  color = LAYOUT_MAP_COLORS.white,
  outlineColor = null,
  outlineWidth = 0,
  opacity = 1,
  renderOrder = 0,
  depthWrite = false,
  depthTest = true,
  polygonOffset = false,
  polygonOffsetFactor = 0,
  polygonOffsetUnits = 0,
  side = THREE.DoubleSide,
  alphaTest = 0.04,
  raycast,
  sharpness = 1,
  renderMode = "canvas",
}) => {
  const [fontVersion, setFontVersion] = React.useState(0);
  const { gl } = useThree();

  React.useEffect(() => {
    let cancelled = false;

    ensureLayoutFontLoaded().then(() => {
      if (!cancelled) {
        setFontVersion((previous) => previous + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const label = text === null || text === undefined ? "" : String(text);
  const htmlTextShadow = React.useMemo(
    () => buildHtmlTextShadow(outlineColor, outlineWidth),
    [outlineColor, outlineWidth]
  );
  const htmlStyle = React.useMemo(() => ({
    fontFamily: LAYOUT_MAP_FONT_FAMILY,
    fontWeight,
    fontSize: `${HTML_LABEL_FONT_PX}px`,
    lineHeight: HTML_LABEL_LINE_HEIGHT,
    color,
    opacity,
    whiteSpace: "pre",
    textAlign: "center",
    letterSpacing: "0.01em",
    textShadow: htmlTextShadow,
    userSelect: "none",
    WebkitUserSelect: "none",
    transform: "translateZ(0)",
  }), [color, fontWeight, htmlTextShadow, opacity]);

  const { texture, aspectRatio, lineCount } = React.useMemo(() => {
    if (renderMode === "html") {
      return { texture: null, aspectRatio: 1, lineCount: 1 };
    }

    if (typeof document === "undefined") {
      return { texture: null, aspectRatio: 1, lineCount: 1 };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return { texture: null, aspectRatio: 1, lineCount: 1 };
    }

    const lines = label.split("\n");
    const isConstrainedDevice = getIsConstrainedLabelDevice();
    const fontPx = isConstrainedDevice ? 96 : 160;
    const lineHeight = fontPx * 1.02;
    const outlinePx = outlineWidth > 0 ? Math.max(4, fontPx * outlineWidth * 0.22) : 0;
    const paddingX = Math.ceil(fontPx * 0.22 + outlinePx);
    const paddingY = Math.ceil(fontPx * 0.12 + outlinePx);

    context.font = `${fontWeight} ${fontPx}px ${LAYOUT_MAP_FONT_FAMILY}`;
    const maxWidth = Math.max(
      2,
      ...lines.map((line) => Math.ceil(context.measureText(line || " ").width))
    );

    const width = maxWidth + paddingX * 2;
    const height = Math.max(2, Math.ceil(lines.length * lineHeight + paddingY * 2));
    const sharpnessFactor = Math.min(1.5, Math.max(0.85, sharpness));
    const basePixelRatio = isConstrainedDevice
      ? 1.0 + sharpnessFactor * 0.3
      : 1.2 + sharpnessFactor * 0.6;
    const minPixelRatio = isConstrainedDevice ? 1 : 2;
    const maxPixelRatio = isConstrainedDevice ? 2 : 3.5;
    const pixelRatio = Math.min(
      maxPixelRatio,
      Math.max(minPixelRatio, (window.devicePixelRatio || 1) * basePixelRatio)
    );

    canvas.width = Math.ceil(width * pixelRatio);
    canvas.height = Math.ceil(height * pixelRatio);

    context.scale(pixelRatio, pixelRatio);
    context.clearRect(0, 0, width, height);
    context.font = `${fontWeight} ${fontPx}px ${LAYOUT_MAP_FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    lines.forEach((line, index) => {
      const x = width / 2;
      const y = paddingY + lineHeight * index + fontPx * 0.52;

      drawTextLine({
        context,
        text: line || " ",
        x,
        y,
        fill: color,
        stroke: outlineColor,
        strokeWidth: outlinePx,
      });
    });

    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.anisotropy = Math.max(
      isConstrainedDevice ? 2 : 4,
      Math.min(
        isConstrainedDevice ? 4 : 8,
        Math.round((gl.capabilities?.getMaxAnisotropy?.() || 4) * Math.min(1, sharpnessFactor))
      )
    );
    nextTexture.generateMipmaps = true;
    nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
    nextTexture.magFilter = THREE.LinearFilter;
    nextTexture.needsUpdate = true;

    return {
      texture: nextTexture,
      aspectRatio: width / height,
      lineCount: lines.length,
    };
  }, [color, fontVersion, fontWeight, gl, label, outlineColor, outlineWidth, renderMode, sharpness]);

  React.useEffect(() => () => texture?.dispose(), [texture]);

  if (!label) {
    return null;
  }

  if (renderMode === "html") {
    return (
      <group
        position={position}
        rotation={rotation}
        renderOrder={renderOrder}
        raycast={raycast}
      >
        <Html
          transform
          center
          pointerEvents="none"
          distanceFactor={fontSize * HTML_LABEL_DISTANCE_FACTOR}
          zIndexRange={[12, 0]}
          style={htmlStyle}
        >
          {label}
        </Html>
      </group>
    );
  }

  if (!texture) {
    return null;
  }

  const baseWorldHeight = fontSize * Math.max(1, lineCount) * 1.06;
  const baseWorldWidth = baseWorldHeight * aspectRatio;
  const widthScale = Number.isFinite(maxWidth) && maxWidth > 0 && baseWorldWidth > 0
    ? Math.min(1, maxWidth / baseWorldWidth)
    : 1;
  const heightScale = Number.isFinite(maxHeight) && maxHeight > 0 && baseWorldHeight > 0
    ? Math.min(1, maxHeight / baseWorldHeight)
    : 1;
  const worldScale = Math.min(widthScale, heightScale);
  const worldHeight = baseWorldHeight * worldScale;
  const worldWidth = baseWorldWidth * worldScale;

  return (
    <mesh
      position={position}
      rotation={rotation}
      renderOrder={renderOrder}
      raycast={raycast}
      
    >
      <planeGeometry args={[worldWidth, worldHeight]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={depthWrite}
        depthTest={depthTest}
        polygonOffset={polygonOffset}
        polygonOffsetFactor={polygonOffsetFactor}
        polygonOffsetUnits={polygonOffsetUnits}
        side={side}
        alphaTest={alphaTest}
        toneMapped={false}
        
      />
    </mesh>
  );
};

export default GroundTextLabel3D;
