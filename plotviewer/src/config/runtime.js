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

const resolveApiUrl = (value) => {
  const apiRelativePath = value.replace(/^\/api\/?/, "");
  return new URL(apiRelativePath, `${API_ORIGIN}/api/`).toString();
};

const getUploadsPath = (value) => {
  const uploadsIndex = value.indexOf("/uploads/");
  if (uploadsIndex === -1) {
    return null;
  }

  return value.slice(uploadsIndex);
};

const getFirebaseModelProxyPath = (value) => {
  try {
    const url = new URL(value);
    let objectPath = "";

    if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      objectPath = decodeURIComponent(parts.slice(1).join("/"));
    } else if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
      objectPath = match ? decodeURIComponent(match[1]) : "";
    }

    if (!objectPath.startsWith("models/")) {
      return null;
    }

    return `/api/model-file/${encodeURIComponent(objectPath)}`;
  } catch {
    return null;
  }
};

export const resolveServerUrl = (value) => {
  if (!value || typeof value !== "string") {
    return value;
  }

  const modelProxyPath = getFirebaseModelProxyPath(value);

  if (modelProxyPath) {
    return resolveApiUrl(modelProxyPath);
  }

  if (value.startsWith("/api/")) {
    return resolveApiUrl(value);
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
