import React from "react";
import useIsCoarsePointer from "./useIsCoarsePointer";

const DEV_MODE = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

const getNavigatorMetric = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default function useLayoutPerformanceMode() {
  const isCoarsePointer = useIsCoarsePointer();

  return React.useMemo(() => {
    if (typeof window === "undefined") {
      return {
        isCoarsePointer,
        isMobileDevice: false,
        isConstrainedDevice: false,
        isDevMode: DEV_MODE,
        deviceMemory: 8,
        hardwareConcurrency: 8,
      };
    }

    const deviceMemory = getNavigatorMetric(window.navigator?.deviceMemory, 8);
    const hardwareConcurrency = getNavigatorMetric(window.navigator?.hardwareConcurrency, 8);

    // Any touch/mobile device — used for lighter rendering defaults
    const isMobileDevice = isCoarsePointer;

    // Truly constrained: low memory OR low CPU on a touch device
    const isConstrainedDevice = isCoarsePointer && (
      deviceMemory <= 4 ||
      hardwareConcurrency <= 4
    );

    return {
      isCoarsePointer,
      isMobileDevice,
      isConstrainedDevice,
      isDevMode: DEV_MODE,
      deviceMemory,
      hardwareConcurrency,
    };
  }, [isCoarsePointer]);
}
