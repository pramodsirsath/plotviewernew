const trimTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const hasWindow = typeof window !== "undefined";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const configuredApiBase = import.meta.env.VITE_API_URL?.trim() || "";
const useDevProxy = import.meta.env.DEV && !configuredApiBase;

const ensureApiSuffix = (value) => {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const getBrowserOrigin = () => {
  if (!hasWindow) {
    return "http://localhost:5173";
  }

  return trimTrailingSlash(window.location.origin);
};

const getDefaultApiBase = () => {
  if (import.meta.env.DEV) {
    return "/api";
  }

  return `${getBrowserOrigin()}/api`;
};

const toAbsoluteOrigin = (value) => {
  const withoutApi = value.replace(/\/api$/, "");

  if (/^https?:\/\//i.test(withoutApi)) {
    return trimTrailingSlash(withoutApi);
  }

  return trimTrailingSlash(new URL(withoutApi || "/", getBrowserOrigin()).toString());
};

const rawApiBase = configuredApiBase
  ? ensureApiSuffix(configuredApiBase)
  : getDefaultApiBase();

export const API_BASE_URL = rawApiBase;
export const API_ORIGIN = toAbsoluteOrigin(API_BASE_URL);

const getUploadsPath = (value) => {
  const uploadsIndex = value.indexOf("/uploads/");
  if (uploadsIndex === -1) {
    return null;
  }

  return value.slice(uploadsIndex);
};

export const resolveServerUrl = (value) => {
  if (!value || typeof value !== "string") {
    return value;
  }

  const uploadsPath = getUploadsPath(value);

  if (useDevProxy && uploadsPath) {
    return uploadsPath;
  }

  try {
    const resolvedUrl = new URL(value, API_ORIGIN);

    if (
      hasWindow &&
      !LOCAL_HOSTS.has(window.location.hostname) &&
      LOCAL_HOSTS.has(resolvedUrl.hostname) &&
      uploadsPath
    ) {
      return `${API_ORIGIN}${uploadsPath}`;
    }

    return resolvedUrl.toString();
  } catch {
    return uploadsPath || value;
  }
};
