const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const normalizeBaseUrl = (value, fallback) => {
  const source = value && value.trim() ? value.trim() : fallback;
  return trimTrailingSlash(source);
};

const getServerBaseUrl = (req) =>
  normalizeBaseUrl(
    process.env.SERVER_PUBLIC_URL,
    req ? `${req.protocol}://${req.get("host")}` : `http://localhost:${process.env.PORT || 5000}`
  );

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
