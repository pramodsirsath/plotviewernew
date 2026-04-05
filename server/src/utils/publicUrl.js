const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value, fallback) => {
  const source = value && value.trim() ? value.trim() : fallback;
  return trimTrailingSlash(source);
};

const getServerBaseUrl = (req) => {
  if (process.env.SERVER_PUBLIC_URL) {
    return trimTrailingSlash(process.env.SERVER_PUBLIC_URL);
  }

  const protocol = req ? req.protocol : "http";
  const host = req ? req.get("host") : `localhost:${process.env.PORT || 5000}`;

  // Strip port 5000 in production to avoid ERR_CONNECTION_TIMED_OUT
  const isProduction = process.env.NODE_ENV === "production";
  const cleanHost = isProduction ? host.split(":")[0] : host;

  return `${protocol}://${cleanHost}`;
};

const getClientBaseUrl = (req) =>
  normalizeBaseUrl(
    process.env.CLIENT_PUBLIC_URL,
    req?.headers.origin || "http://localhost:5173"
  );

const buildPublicUrl = (baseUrl, path) =>
  `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;

module.exports = {
  getServerBaseUrl,
  getClientBaseUrl,
  buildPublicUrl,
};
