import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We re-import the module per test group since functions read process.env at call time.
// No mocks needed — auth.js is pure logic with zero side effects.

let auth;

async function loadAuth() {
  return import("../../../server/auth.js");
}

// ── Helpers ──────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    headers: {},
    url: "/",
    ip: "192.168.1.100",
    connection: { remoteAddress: "192.168.1.100" },
    socket: { remoteAddress: "192.168.1.100" },
    protocol: "http",
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    _redirect: null,
    _cookie: null,
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    redirect(url) { res._redirect = url; return res; },
    cookie(name, val, opts) { res._cookie = { name, val, opts }; return res; },
    protocol: "http",
  };
  return res;
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  delete process.env.CLAUDECK_AUTH;
  delete process.env.CLAUDECK_TOKEN;
  delete process.env.CLAUDECK_AUTH_LOCALHOST;
  auth = await loadAuth();
});

// ── generateToken ────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("returns a 64-char hex string", () => {
    const token = auth.generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    const a = auth.generateToken();
    const b = auth.generateToken();
    expect(a).not.toBe(b);
  });
});

// ── getToken ─────────────────────────────────────────────────────────────

describe("getToken", () => {
  it("returns null when no token is set", () => {
    expect(auth.getToken()).toBeNull();
  });

  it("returns token from env", () => {
    process.env.CLAUDECK_TOKEN = "abc123";
    expect(auth.getToken()).toBe("abc123");
  });
});

// ── isAuthEnabled ────────────────────────────────────────────────────────

describe("isAuthEnabled", () => {
  it("returns false by default (no env vars)", () => {
    expect(auth.isAuthEnabled()).toBe(false);
  });

  it("returns true when CLAUDECK_AUTH=true", () => {
    process.env.CLAUDECK_AUTH = "true";
    expect(auth.isAuthEnabled()).toBe(true);
  });

  it("returns false when CLAUDECK_AUTH=false", () => {
    process.env.CLAUDECK_AUTH = "false";
    expect(auth.isAuthEnabled()).toBe(false);
  });

  it("returns false when CLAUDECK_AUTH=false even with token set", () => {
    process.env.CLAUDECK_AUTH = "false";
    process.env.CLAUDECK_TOKEN = "sometoken";
    expect(auth.isAuthEnabled()).toBe(false);
  });

  it("returns true when CLAUDECK_TOKEN is set (implicit enable)", () => {
    process.env.CLAUDECK_TOKEN = "mytoken";
    expect(auth.isAuthEnabled()).toBe(true);
  });
});

// ── parseCookies ─────────────────────────────────────────────────────────

describe("parseCookies", () => {
  it("returns empty object for null/undefined", () => {
    expect(auth.parseCookies(null)).toEqual({});
    expect(auth.parseCookies(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(auth.parseCookies("")).toEqual({});
  });

  it("parses a single cookie", () => {
    expect(auth.parseCookies("name=value")).toEqual({ name: "value" });
  });

  it("parses multiple cookies", () => {
    const result = auth.parseCookies("claudeck_token=abc123; theme=dark; lang=en");
    expect(result).toEqual({ claudeck_token: "abc123", theme: "dark", lang: "en" });
  });

  it("handles cookies with = in value", () => {
    const result = auth.parseCookies("data=a=b=c");
    expect(result).toEqual({ data: "a=b=c" });
  });

  it("trims whitespace around keys and values", () => {
    const result = auth.parseCookies("  key  =  val  ");
    expect(result).toEqual({ key: "val" });
  });

  it("skips malformed pairs without =", () => {
    const result = auth.parseCookies("good=val; badpair; another=ok");
    expect(result).toEqual({ good: "val", another: "ok" });
  });
});

// ── validateToken ────────────────────────────────────────────────────────

describe("validateToken", () => {
  beforeEach(() => {
    process.env.CLAUDECK_TOKEN = "correcttoken123";
  });

  it("returns true for matching token", () => {
    expect(auth.validateToken("correcttoken123")).toBe(true);
  });

  it("returns false for wrong token", () => {
    expect(auth.validateToken("wrongtoken")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(auth.validateToken("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(auth.validateToken(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(auth.validateToken(undefined)).toBe(false);
  });

  it("returns false when no stored token", () => {
    delete process.env.CLAUDECK_TOKEN;
    expect(auth.validateToken("anything")).toBe(false);
  });

  it("returns false for different length token", () => {
    expect(auth.validateToken("short")).toBe(false);
  });

  it("handles numeric input gracefully", () => {
    expect(auth.validateToken(12345)).toBe(false);
  });
});

// ── extractToken ─────────────────────────────────────────────────────────

describe("extractToken", () => {
  it("extracts from Authorization Bearer header", () => {
    const req = mockReq({ headers: { authorization: "Bearer mytoken" } });
    expect(auth.extractToken(req)).toBe("mytoken");
  });

  it("extracts from cookie", () => {
    const req = mockReq({ headers: { cookie: "claudeck_token=cookietoken; other=val" } });
    expect(auth.extractToken(req)).toBe("cookietoken");
  });

  it("extracts from query parameter", () => {
    const req = mockReq({ url: "/ws?token=querytoken" });
    expect(auth.extractToken(req)).toBe("querytoken");
  });

  it("prefers Bearer header over cookie", () => {
    const req = mockReq({
      headers: {
        authorization: "Bearer headertoken",
        cookie: "claudeck_token=cookietoken",
      },
    });
    expect(auth.extractToken(req)).toBe("headertoken");
  });

  it("prefers cookie over query parameter", () => {
    const req = mockReq({
      headers: { cookie: "claudeck_token=cookietoken" },
      url: "/ws?token=querytoken",
    });
    expect(auth.extractToken(req)).toBe("cookietoken");
  });

  it("returns null when no token anywhere", () => {
    const req = mockReq();
    expect(auth.extractToken(req)).toBeNull();
  });

  it("ignores non-Bearer auth headers", () => {
    const req = mockReq({ headers: { authorization: "Basic abc123" } });
    expect(auth.extractToken(req)).toBeNull();
  });
});

// ── authMiddleware ───────────────────────────────────────────────────────

describe("authMiddleware", () => {
  it("calls next() when auth is disabled", () => {
    const next = vi.fn();
    auth.authMiddleware(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() for localhost when auth is enabled", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ ip: "127.0.0.1" });
    auth.authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() for ::1 (IPv6 localhost)", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ ip: "::1" });
    auth.authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() for ::ffff:127.0.0.1 (IPv4-mapped)", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ ip: "::ffff:127.0.0.1" });
    auth.authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks localhost when CLAUDECK_AUTH_LOCALHOST=true", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    process.env.CLAUDECK_AUTH_LOCALHOST = "true";
    const next = vi.fn();
    const req = mockReq({ ip: "127.0.0.1", headers: { accept: "application/json" } });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it("blocks localhost with X-Forwarded-For (proxied via ngrok/tunnel)", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({
      ip: "127.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.50", accept: "application/json" },
    });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it("blocks localhost with X-Real-IP (proxied via reverse proxy)", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({
      ip: "127.0.0.1",
      headers: { "x-real-ip": "203.0.113.50", accept: "application/json" },
    });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it("calls next() with valid Bearer token from remote", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ headers: { authorization: "Bearer secret" } });
    auth.authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() with valid cookie token from remote", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ headers: { cookie: "claudeck_token=secret" } });
    auth.authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 JSON for API requests without token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ headers: { accept: "application/json" } });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: "Unauthorized" });
  });

  it("redirects to /login for HTML requests without token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ headers: { accept: "text/html,application/xhtml+xml" } });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._redirect).toBe("/login");
  });

  it("returns 401 for wrong token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const next = vi.fn();
    const req = mockReq({ headers: { authorization: "Bearer wrong" } });
    const res = mockRes();
    auth.authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

// ── verifyWsClient ───────────────────────────────────────────────────────

describe("verifyWsClient", () => {
  function wsInfo(overrides = {}) {
    return {
      req: {
        headers: {},
        url: "/ws",
        socket: { remoteAddress: "192.168.1.100" },
        ...overrides,
      },
    };
  }

  it("allows connection when auth is disabled", () => {
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo(), cb);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it("allows localhost when auth is enabled", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({ socket: { remoteAddress: "127.0.0.1" } }), cb);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it("allows valid cookie token from remote", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({ headers: { cookie: "claudeck_token=secret" } }), cb);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it("allows valid query token from remote", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({ url: "/ws?token=secret" }), cb);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it("rejects remote connection without token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo(), cb);
    expect(cb).toHaveBeenCalledWith(false, 401, "Unauthorized");
  });

  it("rejects remote connection with wrong cookie", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({ headers: { cookie: "claudeck_token=wrong" } }), cb);
    expect(cb).toHaveBeenCalledWith(false, 401, "Unauthorized");
  });

  it("blocks localhost when CLAUDECK_AUTH_LOCALHOST=true", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    process.env.CLAUDECK_AUTH_LOCALHOST = "true";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({ socket: { remoteAddress: "127.0.0.1" } }), cb);
    expect(cb).toHaveBeenCalledWith(false, 401, "Unauthorized");
  });

  it("blocks localhost WebSocket with X-Forwarded-For (proxied)", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const cb = vi.fn();
    auth.verifyWsClient(wsInfo({
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "203.0.113.50" },
    }), cb);
    expect(cb).toHaveBeenCalledWith(false, 401, "Unauthorized");
  });
});

// ── loginHandler ─────────────────────────────────────────────────────────

describe("loginHandler", () => {
  it("returns ok when auth is disabled", () => {
    const res = mockRes();
    auth.loginHandler(mockReq(), res);
    expect(res._json).toEqual({ ok: true });
  });

  it("sets cookie and returns ok with valid token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const req = mockReq({ body: { token: "secret" } });
    const res = mockRes();
    auth.loginHandler(req, res);
    expect(res._json).toEqual({ ok: true });
    expect(res._cookie).not.toBeNull();
    expect(res._cookie.name).toBe("claudeck_token");
    expect(res._cookie.val).toBe("secret");
    expect(res._cookie.opts.httpOnly).toBe(true);
    expect(res._cookie.opts.sameSite).toBe("strict");
    expect(res._cookie.opts.path).toBe("/");
  });

  it("returns 401 with invalid token", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const req = mockReq({ body: { token: "wrong" } });
    const res = mockRes();
    auth.loginHandler(req, res);
    expect(res._status).toBe(401);
    expect(res._json).toEqual({ error: "Invalid token" });
    expect(res._cookie).toBeNull();
  });

  it("returns 401 with missing body", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const req = mockReq({ body: undefined });
    const res = mockRes();
    auth.loginHandler(req, res);
    expect(res._status).toBe(401);
  });

  it("sets secure flag when protocol is https", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const req = mockReq({ body: { token: "secret" }, protocol: "https" });
    const res = mockRes();
    auth.loginHandler(req, res);
    expect(res._cookie.opts.secure).toBe(true);
  });

  it("does not set secure flag for http", () => {
    process.env.CLAUDECK_AUTH = "true";
    process.env.CLAUDECK_TOKEN = "secret";
    const req = mockReq({ body: { token: "secret" }, protocol: "http" });
    const res = mockRes();
    auth.loginHandler(req, res);
    expect(res._cookie.opts.secure).toBe(false);
  });
});

// ── statusHandler ────────────────────────────────────────────────────────

describe("statusHandler", () => {
  it("returns authEnabled: false when disabled", () => {
    const res = mockRes();
    auth.statusHandler(mockReq(), res);
    expect(res._json).toEqual({ authEnabled: false });
  });

  it("returns authEnabled: true when enabled", () => {
    process.env.CLAUDECK_AUTH = "true";
    const res = mockRes();
    auth.statusHandler(mockReq(), res);
    expect(res._json).toEqual({ authEnabled: true });
  });
});
