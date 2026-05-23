import React from "react";

export default function useForegroundRefreshKey() {
  const [refreshKey, setRefreshKey] = React.useState(0);

  const triggerRefresh = React.useCallback(() => {
    setRefreshKey((previousKey) => previousKey + 1);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleFocus = () => {
      triggerRefresh();
    };

    const handlePageShow = () => {
      triggerRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [triggerRefresh]);

  return {
    refreshKey,
    triggerRefresh,
  };
}
