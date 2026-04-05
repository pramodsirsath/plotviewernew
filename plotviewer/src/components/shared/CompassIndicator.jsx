import React, { useState } from "react";

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
  // The compass needle should compensate for both the view rotation and the layout's front direction
  const needleAngle = -(rotation + frontDirection);

  return (
    <div
      className="compass-indicator"
      style={{
        width: size,
        height: size,
        position: "relative",
        borderRadius: "50%",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1.5px solid ${hovered ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)"}`,
        boxShadow: hovered
          ? "0 4px 24px rgba(0,0,0,0.5), 0 0 16px rgba(59,130,246,0.3), inset 0 0 0 1px rgba(255,255,255,0.12)"
          : "0 4px 20px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        transition: "all 0.3s ease",
        transform: hovered ? "scale(1.08)" : "scale(1)",
        zIndex: 10,
      }}
      title={onClick ? "Click to face North" : `North: ${Math.round(frontDirection)}°`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Outer ring tick marks */}
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          style={{
            position: "absolute",
            width: 1.5,
            height: deg % 180 === 0 ? 6 : 4,
            background: deg === 0 ? "#fff" : "rgba(255,255,255,0.3)",
            top: deg % 180 === 0 ? 3 : 4,
            left: "50%",
            transformOrigin: `50% ${size / 2 - 3}px`,
            transform: `translateX(-50%) rotate(${deg + needleAngle}deg)`,
            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderRadius: 1,
          }}
        />
      ))}

      {/* Compass needle SVG */}
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 24 24"
        style={{
          transform: `rotate(${needleAngle}deg)`,
          transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
        }}
      >
        {/* North arrow (red/white) */}
        <polygon points="12,2 15,12 12,10 9,12" fill="#fff" opacity="0.95" />
        {/* South arrow (darker) */}
        <polygon points="12,22 9,12 12,14 15,12" fill="rgba(255,255,255,0.2)" />
      </svg>

      {/* N label */}
      <div
        style={{
          position: "absolute",
          top: -2,
          left: "50%",
          transform: `translateX(-50%) rotate(${needleAngle}deg)`,
          transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          transformOrigin: `50% ${size / 2 + 2}px`,
        }}
      >
        <span
          style={{
            display: "block",
            fontSize: 8,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: "0.05em",
            transform: `rotate(${-needleAngle}deg)`,
            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          N
        </span>
      </div>
    </div>
  );
};

export default CompassIndicator;
