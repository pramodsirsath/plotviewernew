import React from "react";
import API from "../../services/api";
import {
  DEFAULT_RESOLVED_LAYOUT_THEME,
  resolveLayoutAppearance,
} from "../../theme/layoutAppearance";

let cachedResolvedTheme = DEFAULT_RESOLVED_LAYOUT_THEME;
let inflightRequest = null;
const THEME_EVENT = "plotviewer:global-layout-theme-updated";
const THEME_STORAGE_KEY = "plotviewer.globalLayoutTheme";
const listeners = new Set();

const getThemeSignature = (theme) => JSON.stringify(theme?.appearance || theme || {});
let cachedThemeSignature = getThemeSignature(cachedResolvedTheme);

const broadcastTheme = (resolvedTheme) => {
  const nextSignature = getThemeSignature(resolvedTheme);

  if (nextSignature === cachedThemeSignature) {
    return cachedResolvedTheme;
  }

  cachedResolvedTheme = resolvedTheme;
  cachedThemeSignature = nextSignature;
  listeners.forEach((listener) => listener(resolvedTheme));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: resolvedTheme }));

    try {
      window.localStorage.setItem(
        THEME_STORAGE_KEY,
        JSON.stringify({
          theme: resolvedTheme,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage write issues and keep in-memory propagation working.
    }
  }

  return resolvedTheme;
};

const subscribeTheme = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const fetchThemeFromApi = async ({ force = false } = {}) => {
  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = API.get("/appearance/theme", {
    params: force ? { _ts: Date.now() } : undefined,
  })
    .then((response) => {
      const resolvedTheme = resolveLayoutAppearance(response.data);
      return broadcastTheme(resolvedTheme);
    })
    .catch(() => cachedResolvedTheme)
    .finally(() => {
      inflightRequest = null;
    });

  return inflightRequest;
};

export const primeGlobalLayoutThemeCache = (themeInput) => {
  return broadcastTheme(resolveLayoutAppearance(themeInput));
};

export default function useGlobalLayoutTheme() {
  const [theme, setThemeState] = React.useState(cachedResolvedTheme);
  const [isLoading, setIsLoading] = React.useState(true);

  const setTheme = React.useCallback((nextTheme) => {
    setThemeState((previousTheme) => {
      const candidate = typeof nextTheme === "function"
        ? nextTheme(previousTheme)
        : nextTheme;
      const resolvedTheme = broadcastTheme(resolveLayoutAppearance(candidate));
      return resolvedTheme;
    });
  }, []);

  const refreshTheme = React.useCallback(async ({ force = false, silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const nextTheme = await fetchThemeFromApi({ force });
      setThemeState((previousTheme) => (
        getThemeSignature(previousTheme) === getThemeSignature(nextTheme)
          ? previousTheme
          : nextTheme
      ));
      return nextTheme;
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    refreshTheme();
  }, [refreshTheme]);

  React.useEffect(() => subscribeTheme(setThemeState), []);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleThemeEvent = (event) => {
      if (event?.detail) {
        setThemeState(resolveLayoutAppearance(event.detail));
      }
    };

    const handleStorage = (event) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed?.theme) {
          setThemeState(resolveLayoutAppearance(parsed.theme));
        }
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    };

    const handleWindowFocus = () => {
      refreshTheme({ force: true, silent: true });
    };

    const handlePageShow = () => {
      refreshTheme({ force: true, silent: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshTheme({ force: true, silent: true });
      }
    };

    window.addEventListener(THEME_EVENT, handleThemeEvent);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener(THEME_EVENT, handleThemeEvent);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshTheme]);

  return {
    theme,
    setTheme,
    refreshTheme,
    isLoading,
  };
}
