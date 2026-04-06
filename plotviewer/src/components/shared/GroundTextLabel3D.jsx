import React from "react";
import * as THREE from "three";
import { LAYOUT_MAP_COLORS, LAYOUT_MAP_FONT_FAMILY } from "../../theme/layoutMapTheme";

let fontLoadPromise = null;

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

const GroundTextLabel3D = ({
  text,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  fontSize = 1,
  fontWeight = 700,
  color = LAYOUT_MAP_COLORS.white,
  outlineColor = null,
  outlineWidth = 0,
  opacity = 1,
  renderOrder = 0,
  depthWrite = false,
  side = THREE.DoubleSide,
  alphaTest = 0.04,
  raycast,
}) => {
  const [fontVersion, setFontVersion] = React.useState(0);

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

  const { texture, aspectRatio, lineCount } = React.useMemo(() => {
    if (typeof document === "undefined") {
      return { texture: null, aspectRatio: 1, lineCount: 1 };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return { texture: null, aspectRatio: 1, lineCount: 1 };
    }

    const lines = label.split("\n");
    const fontPx = 160;
    const lineHeight = fontPx * 1.02;
    const outlinePx = outlineWidth > 0 ? Math.max(6, fontPx * outlineWidth * 0.22) : 0;
    const paddingX = Math.ceil(fontPx * 0.22 + outlinePx);
    const paddingY = Math.ceil(fontPx * 0.12 + outlinePx);

    context.font = `${fontWeight} ${fontPx}px ${LAYOUT_MAP_FONT_FAMILY}`;
    const maxWidth = Math.max(
      2,
      ...lines.map((line) => Math.ceil(context.measureText(line || " ").width))
    );

    const width = maxWidth + paddingX * 2;
    const height = Math.max(2, Math.ceil(lines.length * lineHeight + paddingY * 2));
    const pixelRatio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

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
    nextTexture.anisotropy = 4;
    nextTexture.needsUpdate = true;

    return {
      texture: nextTexture,
      aspectRatio: width / height,
      lineCount: lines.length,
    };
  }, [color, fontVersion, fontWeight, label, outlineColor, outlineWidth]);

  React.useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture || !label) {
    return null;
  }

  const worldHeight = fontSize * Math.max(1, lineCount) * 1.06;
  const worldWidth = worldHeight * aspectRatio;

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
        side={side}
        alphaTest={alphaTest}
        toneMapped={false}
      />
    </mesh>
  );
};

export default GroundTextLabel3D;
