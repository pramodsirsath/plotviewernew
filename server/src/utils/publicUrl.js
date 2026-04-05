const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value, fallback) => {
  const source = value && value.trim() ? value.trim() : fallback;
  return trimTrailingSlash(source);
};

const getServerBaseUrl = (req) => {
  if (process.env.SERVER_PUBLIC_URL) {
    return trimTrailingSlash(process.env.SERVER_PUBLIC_URL);
  }

  // Use x-forwarded-proto if behind a proxy (like Render/Heroku)
  const xForwardedProto = req?.headers?.["x-forwarded-proto"];
  const protocol = xForwardedProto || (req ? req.protocol : "http");
  const host = req ? req.get("host") : `localhost:${process.env.PORT || 5000}`;

  // Strip port in production if it's explicitly set to 5000 or the app port, 
  // but only if we are not on localhost.
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  let cleanHost = host;

  if (process.env.NODE_ENV === "production" && !isLocal && host.includes(":")) {
    const [hostname, port] = host.split(":");
    if (port === "5000" || port === String(process.env.PORT)) {
      cleanHost = hostname;
    }
  }

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
