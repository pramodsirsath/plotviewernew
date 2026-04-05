const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const getDefaultApiOrigin = () => {
  if (typeof window === "undefined") {
    return "http://localhost:5000";
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  const isLocal = ["localhost", "127.0.0.1"].includes(hostname);

  return isLocal ? `${protocol}//${hostname}:5000` : `${protocol}//${hostname}`;
};

const rawApiBase = trimTrailingSlash(
  import.meta.env.VITE_API_URL || `${getDefaultApiOrigin()}/api`
);

export const API_BASE_URL = rawApiBase.endsWith("/api")
  ? rawApiBase
  : `${rawApiBase}/api`;

export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export const resolveServerUrl = (value) => {
  if (!value || typeof value !== "string") {
    return value;
  }

  const isDeployed = typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname);

  // If it's a legacy hardcoded localhost URL and we're deployed, redirect to our real API_ORIGIN
  if (isDeployed && (value.includes("localhost:") || value.includes("127.0.0.1:"))) {
    try {
      const url = new URL(value);
      return `${trimTrailingSlash(API_ORIGIN)}${url.pathname}`;
    } catch (e) {
      // If parsing fails, fall back to simple string replacement for common uploads path
      const uploadsIndex = value.indexOf("/uploads/");
      if (uploadsIndex !== -1) {
        return `${trimTrailingSlash(API_ORIGIN)}${value.substring(uploadsIndex)}`;
      }
    }
  }

  try {
    const resolvedUrl = new URL(value, API_ORIGIN);

    // If we're deployed but the URL still has a port 5000 (e.g. from an absolute URL), strip it
    if (isDeployed && resolvedUrl.port === "5000") {
      resolvedUrl.port = "";
    }

    return resolvedUrl.toString();
  } catch {
    return value;
  }
};
