const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const getDefaultApiOrigin = () => {
  if (typeof window === "undefined") {
    return "http://localhost:5000";
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";

  return `${protocol}//${hostname}:5000`;
};

const rawApiBase = trimTrailingSlash(
  import.meta.env.VITE_API_URL || `${getDefaultApiOrigin()}/api`
);

export const API_BASE_URL = rawApiBase.endsWith("/api")
  ? rawApiBase
  : `${rawApiBase}/api`;

export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export const resolveServerUrl = (value) => {
  if (!value) {
    return value;
  }

  try {
    const resolvedUrl = new URL(value, API_ORIGIN);

    if (
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(resolvedUrl.hostname) &&
      !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ) {
      const apiOrigin = new URL(API_ORIGIN);
      resolvedUrl.protocol = apiOrigin.protocol;
      resolvedUrl.host = apiOrigin.host;
    }

    return resolvedUrl.toString();
  } catch {
    return value;
  }
};
