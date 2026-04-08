import React, { useState } from "react";
import { normalizeAngle } from "../../utils/gestureUtils";

/**
 * CompassIndicator — a small animated compass widget showing North direction.
 * Props:
 *   rotation: current view rotation in degrees
 *   frontDirection: layout front direction in degrees (0=North)
 *   size: widget diameter (default 52)
 *   onClick: optional callback when clicked (typically rotates to north)
 */
const CompassIndicator = ({ rotation = 0, frontDirection = 0, size = 52, onClick }) => {
  const [hovered, setHovered] = useState(false);
  // Match the camera heading directly so the compass tracks rotation in the same direction.
  const needleAngle = normalizeAngle(rotation - frontDirection);

  return (
    <div
      className="compass-indicator"
      style={{
        width: size,
        height: size,
        position: "relative",
        borderRadius: "50%",
        background: "rgba(30,30,30,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: hovered
          ? "0 4px 16px rgba(0,0,0,0.5)"
          : "0 4px 12px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        transform: hovered ? "scale(1.05)" : "scale(1)",
        zIndex: 10,
      }}
      title={onClick ? "Click to face North" : `North: ${Math.round(frontDirection)}°`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          transform: `rotate(${needleAngle}deg)`,
          transformOrigin: "50% 50%",
          willChange: "transform",
        }}
      >
        {/* Simple white arrow head pointing North on the edge */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          {/* Arrow pointing up along the top edge */}
          <polygon points="50,4 58,16 42,16" fill="#fff" />
        </svg>
        
        {/* N label tilted with the compass */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: size * 0.38,
              fontWeight: 700,
              color: "#fff",
              marginTop: size * 0.1,
              fontFamily: "Inter, sans-serif"
            }}
          >
            N
          </span>
        </div>
      </div>
    </div>
  );
};

export default CompassIndicator;
