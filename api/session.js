// =============================================================================
// OPENHUB v2.0 - VERCEL SERVERLESS FUNCTION: ACTIVE SESSION TRACKER
// Quản lý phiên duy nhất (Single Session): Đăng nhập bên này -> đá văng bên kia
// =============================================================================
const fs = require("fs");
const path = require("path");
const os = require("os");

const TMP_FILE = path.join(os.tmpdir(), "openhub_active_sessions.json");

function loadSessions() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, "utf8");
      return JSON.parse(raw) || {};
    }
  } catch (e) {}
  return global.__openhub_active_sessions || {};
}

function saveSessions(data) {
  global.__openhub_active_sessions = data;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(data), "utf8");
  } catch (e) {}
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const sessions = loadSessions();

  if (req.method === "GET") {
    const { username } = req.query || {};
    if (!username) {
      return res.status(200).json({ sessions });
    }
    const cleanUser = String(username).toLowerCase().trim();
    const current = sessions[cleanUser] || null;
    return res.status(200).json({
      username: cleanUser,
      activeSessionToken: current ? current.sessionToken : null,
      lastLoginAt: current ? current.loginTime : null
    });
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const { username, sessionToken } = body || {};
    if (!username || !sessionToken) {
      return res.status(400).json({ error: "MISSING_USERNAME_OR_TOKEN" });
    }
    const cleanUser = String(username).toLowerCase().trim();
    sessions[cleanUser] = {
      sessionToken: String(sessionToken),
      loginTime: Date.now(),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1"
    };
    saveSessions(sessions);
    return res.status(200).json({
      success: true,
      username: cleanUser,
      activeSessionToken: String(sessionToken)
    });
  }

  return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
};
