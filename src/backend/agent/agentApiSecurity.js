const crypto = require("crypto");

const COOKIE_NAME = "freeflow_agent_session";

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    })
  );
}

function isLoopbackHost(value = "") {
  const host = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function sameOriginRequest(req) {
  const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = String(req.get("origin") || "").trim();
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const requestHost = String(req.get("host") || "").toLowerCase();
    return parsed.protocol === "http:" && isLoopbackHost(parsed.hostname) && parsed.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createAgentApiSecurity() {
  const capability = crypto.randomBytes(32).toString("base64url");

  function assertRequestBoundary(req) {
    if (!isLoopbackHost(req.hostname) || !sameOriginRequest(req)) {
      const error = new Error("Agent API request origin is not allowed");
      error.statusCode = 403;
      throw error;
    }
  }

  function bootstrap(req, res) {
    try {
      assertRequestBoundary(req);
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(capability)}; HttpOnly; SameSite=Strict; Path=/api/agent`
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true });
    } catch (error) {
      res.status(error.statusCode || 403).json({ ok: false, error: error.message });
    }
  }

  function requireAuth(req, res, next) {
    try {
      assertRequestBoundary(req);
      const cookieToken = parseCookies(req.get("cookie"))[COOKIE_NAME];
      if (!safeEqual(cookieToken, capability)) {
        res.status(401).json({ ok: false, error: "Agent API authentication required", code: "AGENT_AUTH_REQUIRED" });
        return;
      }
      next();
    } catch (error) {
      res.status(error.statusCode || 403).json({ ok: false, error: error.message, code: "AGENT_ORIGIN_REJECTED" });
    }
  }

  return { bootstrap, requireAuth };
}

module.exports = { COOKIE_NAME, createAgentApiSecurity, isLoopbackHost, parseCookies, sameOriginRequest };
