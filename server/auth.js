// Token-based authentication for Claudeck
// Zero external dependencies — uses Node.js built-in crypto
import crypto from "crypto";

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getToken() {
  return process.env.CLAUDECK_TOKEN || null;
}

export function isAuthEnabled() {
  if (process.env.CLAUDECK_AUTH === "false") return false;
  if (process.env.CLAUDECK_AUTH === "true") return true;
  if (process.env.CLAUDECK_TOKEN) return true;
  return false;
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}

export function validateToken(candidate) {
  const stored = getToken();
  if (!stored || !candidate) return false;
  try {
    const a = Buffer.from(String(candidate));
    const b = Buffer.from(String(stored));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // 2. Cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.claudeck_token) {
    return cookies.claudeck_token;
  }
  // 3. Query parameter (for edge cases)
  const url = new URL(req.url, "http://localhost");
  const qToken = url.searchParams.get("token");
  if (qToken) return qToken;

  return null;
}

function isLocalhost(req) {
  // If request has proxy headers, it's being tunneled — not truly local
  if (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) return false;
  const addr = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export function authMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  // Localhost bypass (default on, set CLAUDECK_AUTH_LOCALHOST=true to require auth even on localhost)
  if (process.env.CLAUDECK_AUTH_LOCALHOST !== "true" && isLocalhost(req)) {
    return next();
  }

  const token = extractToken(req);
  if (token && validateToken(token)) return next();

  // For page navigations, redirect to login
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    return res.redirect("/login");
  }

  // For API/asset requests, return 401
  return res.status(401).json({ error: "Unauthorized" });
}

export function verifyWsClient(info, callback) {
  if (!isAuthEnabled()) return callback(true);

  // Localhost bypass (skip if proxied)
  const addr = info.req.socket?.remoteAddress || "";
  const isProxied = info.req.headers["x-forwarded-for"] || info.req.headers["x-real-ip"];
  if (process.env.CLAUDECK_AUTH_LOCALHOST !== "true" && !isProxied) {
    if (addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1") {
      return callback(true);
    }
  }

  // Check cookie on the upgrade request
  const cookies = parseCookies(info.req.headers.cookie);
  if (cookies.claudeck_token && validateToken(cookies.claudeck_token)) {
    return callback(true);
  }

  // Check query string (ws://host/ws?token=xxx)
  try {
    const url = new URL(info.req.url, "http://localhost");
    const qToken = url.searchParams.get("token");
    if (qToken && validateToken(qToken)) {
      return callback(true);
    }
  } catch {}

  callback(false, 401, "Unauthorized");
}

export function loginHandler(req, res) {
  if (!isAuthEnabled()) return res.json({ ok: true });
  const { token } = req.body || {};
  if (!validateToken(token)) {
    return res.status(401).json({ error: "Invalid token" });
  }
  res.cookie("claudeck_token", token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    secure: req.protocol === "https",
  });
  res.json({ ok: true });
}

export function statusHandler(_req, res) {
  res.json({ authEnabled: isAuthEnabled() });
}
