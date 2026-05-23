import { useEffect, useState } from "react";
import * as THREE from "three";

export const DESKTOP_ORBIT_MOUSE_BUTTONS = Object.freeze({
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
});

export const LAYOUT_TOUCH_CONTROLS = Object.freeze({
  ONE: THREE.TOUCH.PAN,
  TWO: THREE.TOUCH.DOLLY_ROTATE,
});

const applyDesktopMouseButtons = (controls, shouldRotateWithCursor) => {
  if (!controls) {
    return;
  }

  controls.mouseButtons = {
    LEFT: shouldRotateWithCursor ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
};

export default function useOrbitInteractionMode({
  controlsRef,
  isCoarsePointer = false,
  rotateEnabled = true,
}) {
  const [isCtrlRotateActive, setIsCtrlRotateActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }

    if (isCoarsePointer || !rotateEnabled) {
      setIsCtrlRotateActive(false);
      return undefined;
    }

    const updateModifierState = (event) => {
      setIsCtrlRotateActive(Boolean(event?.ctrlKey || event?.metaKey));
    };

    const resetModifierState = () => {
      setIsCtrlRotateActive(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        resetModifierState();
      }
    };

    window.addEventListener("keydown", updateModifierState);
    window.addEventListener("keyup", updateModifierState);
    window.addEventListener("blur", resetModifierState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", updateModifierState);
      window.removeEventListener("keyup", updateModifierState);
      window.removeEventListener("blur", resetModifierState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isCoarsePointer, rotateEnabled]);

  useEffect(() => {
    applyDesktopMouseButtons(
      controlsRef?.current,
      rotateEnabled && !isCoarsePointer && isCtrlRotateActive
    );
  }, [controlsRef, isCoarsePointer, isCtrlRotateActive, rotateEnabled]);

  return {
    isCtrlRotateActive,
  };
}
