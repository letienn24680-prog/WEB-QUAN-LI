// =============================================================================
// OPENHUB v2.0 - RESTFUL HTTP API SERVER, IAM/AUTH, BUNDLE CART & DASHBOARD API
// Mô-đun 2: Cung cấp đầy đủ Endpoints cho 10 Luồng Nghiệp Vụ & 15 Edge Cases
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { OpenHubPlatform, CATEGORIES, LICENSES, escapeHtml, detectDeviceProfile } = require("./core");

function createAppServer(platformInstance) {
  const platform = platformInstance || new OpenHubPlatform();

  function sendJson(res, statusCode, data, extraHeaders = {}) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Role, X-User-Id, X-Forwarded-For, Idempotency-Key, X-Hub-Signature-256, Range",
      ...extraHeaders
    });
    res.end(body);
  }

  function readRawAndJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let totalBytes = 0;
      req.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > 25 * 1024 * 1024) {
          reject(new Error("PAYLOAD_TOO_LARGE"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (chunks.length === 0) return resolve({ raw: "", json: {} });
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ raw, json: JSON.parse(raw) });
        } catch (err) {
          reject(new Error("INVALID_JSON"));
        }
      });
      req.on("error", reject);
    });
  }

  function resolveActingUser(req) {
    const customUserId = req.headers["x-user-id"];
    if (customUserId && platform.users.has(customUserId)) {
      return platform.users.get(customUserId);
    }
    const roleHeader = String(req.headers["x-role"] || "contributor").toLowerCase();
    if (roleHeader === "admin" || roleHeader === "moderator") {
      return platform.users.get("u-admin-1");
    }
    if (roleHeader === "contributor" || roleHeader === "creator") {
      return platform.users.get("u-contributor-1");
    }
    return null;
  }

  function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
    return req.socket.remoteAddress || "127.0.0.1";
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Role, X-User-Id, X-Forwarded-For, Idempotency-Key, X-Hub-Signature-256, Range"
      });
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost:8080"}`);
    const pathname = parsedUrl.pathname;

    try {
      // =======================================================================
      // NHÓM API 1: HỆ THỐNG ĐĂNG KÝ, ĐĂNG NHẬP, OTP, 2FA, PHIÊN & PAT (Luồng 1, 2, 3)
      // =======================================================================

      if (req.method === "GET" && pathname === "/api/v1/auth/check-username") {
        const u = parsedUrl.searchParams.get("u") || "";
        return sendJson(res, 200, platform.checkUsernameAvailability(u));
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/password-strength") {
        const { json } = await readRawAndJsonBody(req);
        return sendJson(res, 200, platform.evaluatePasswordStrength(json.password, json.username, json.email));
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/register") {
        const { json } = await readRawAndJsonBody(req);
        const idempotencyKey = req.headers["idempotency-key"] || json.idempotency_key || null;
        const result = platform.registerUser(json, { idempotencyKey });
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/verify-email") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.verifyEmailRegistration(json);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/login") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.loginUser({ ...json, ip: getClientIp(req), userAgent: req.headers["user-agent"] });
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/2fa/enable") {
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const result = platform.enableTwoFactor(user.id);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/2fa/verify") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.verifyTwoFactorLogin(json);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/refresh") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.refreshAuthSession(json.refresh_token);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/forgot-password") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.requestPasswordReset(json.email);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/reset-password") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.resetPassword(json);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "GET" && pathname === "/api/v1/auth/sessions") {
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        return sendJson(res, 200, {
          sessions: platform.listUserSessions(user.id),
          tokens: Array.from(platform.personalAccessTokens.values()).filter((t) => t.user_id === user.id)
        });
      }

      const revokeSessMatch = pathname.match(/^\/api\/v1\/auth\/sessions\/([^/]+)$/);
      if (req.method === "DELETE" && revokeSessMatch) {
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const sessionId = decodeURIComponent(revokeSessMatch[1]);
        const result = platform.revokeUserSession(user.id, sessionId);
        return sendJson(res, result.statusCode, result);
      }

      if (req.method === "POST" && pathname === "/api/v1/auth/pat") {
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const { json } = await readRawAndJsonBody(req);
        const result = platform.createPersonalAccessToken(user.id, json);
        return sendJson(res, result.statusCode, result);
      }

      // =======================================================================
      // NHÓM API 2: DASHBOARD NEXAPANEL / GLASSMORPHISM & DEVELOPER PORTFOLIO (Luồng 8)
      // =======================================================================

      if (req.method === "GET" && pathname === "/api/v1/dashboard/analytics") {
        const rangeDays = Number(parsedUrl.searchParams.get("rangeDays")) || 7;
        const ownerId = parsedUrl.searchParams.get("ownerId") || null;
        return sendJson(res, 200, platform.getDashboardAnalytics({ rangeDays, ownerId }));
      }

      const portfolioMatch = pathname.match(/^\/api\/v1\/users\/([^/]+)\/portfolio$/);
      if (req.method === "GET" && portfolioMatch) {
        const username = decodeURIComponent(portfolioMatch[1]);
        const portfolio = platform.getDeveloperPortfolio(username);
        if (!portfolio) return sendJson(res, 404, { error: "USER_NOT_FOUND" });
        return sendJson(res, 200, portfolio);
      }

      // =======================================================================
      // NHÓM API 3: KHÁM PHÁ, CHI TIẾT, DIFF, GIỎ DỰ ÁN & CỘNG ĐỒNG (Luồng 4, 5, 6, 7, 9, 10)
      // =======================================================================

      if (req.method === "GET" && pathname === "/api/v1/meta") {
        return sendJson(res, 200, {
          categories: CATEGORIES,
          licenses: LICENSES,
          tags: Array.from(platform.tags.values())
        });
      }

      if (req.method === "GET" && pathname === "/api/v1/projects/autocomplete") {
        const q = parsedUrl.searchParams.get("q") || "";
        return sendJson(res, 200, { suggestions: platform.getAutocompleteSuggestions(q) });
      }

      if (req.method === "GET" && pathname === "/api/v1/projects") {
        const searchRes = platform.searchProjects({
          q: parsedUrl.searchParams.get("q") || "",
          category: parsedUrl.searchParams.get("category") || "",
          tags: parsedUrl.searchParams.get("tags") || "",
          license: parsedUrl.searchParams.get("license") || "",
          hasDemo: parsedUrl.searchParams.get("hasDemo") || "",
          maxSizeMb: parsedUrl.searchParams.get("maxSizeMb") || "",
          sort: parsedUrl.searchParams.get("sort") || "newest",
          cursor: parsedUrl.searchParams.get("cursor") || 0,
          limit: parsedUrl.searchParams.get("limit") || 20
        });
        return sendJson(res, 200, searchRes, { "X-Cache": searchRes.cacheHit ? "HIT" : "MISS" });
      }

      if (req.method === "POST" && pathname === "/api/v1/projects") {
        const user = resolveActingUser(req);
        const { json } = await readRawAndJsonBody(req);
        const created = platform.createProject(user, json);
        return sendJson(res, created.statusCode, created);
      }

      // Nhập dự án từ GitHub/GitLab (Luồng 9)
      if (req.method === "POST" && pathname === "/api/v1/projects/import-git") {
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const { json } = await readRawAndJsonBody(req);
        const result = platform.importProjectFromGitRepo(user, json);
        return sendJson(res, result.statusCode, result);
      }

      // GitHub Release Webhook có chữ ký X-Hub-Signature-256 (Luồng 9)
      const webhookMatch = pathname.match(/^\/api\/v1\/webhooks\/github\/([^/]+)$/);
      if (req.method === "POST" && webhookMatch) {
        const projectId = decodeURIComponent(webhookMatch[1]);
        const { raw } = await readRawAndJsonBody(req);
        const sig = req.headers["x-hub-signature-256"] || "";
        const result = platform.handleGitHubReleaseWebhook(projectId, raw, sig);
        return sendJson(res, result.statusCode, result);
      }

      // Tải Giỏ Dự Án — Project Bundle Cart (Luồng 4 & EC-15)
      if (req.method === "POST" && pathname === "/api/v1/bundles/download") {
        const { json } = await readRawAndJsonBody(req);
        const result = platform.downloadProjectBundleCart(json.project_ids || json.slugs || []);
        return sendJson(res, result.statusCode, result);
      }

      // Luồng 1 (Cross-Device): Nhận diện thiết bị ở tầng Server/Edge (Sec-CH-UA-Mobile & User-Agent)
      if (req.method === "GET" && pathname === "/api/v1/device-profile") {
        return sendJson(res, 200, detectDeviceProfile(req.headers));
      }

      // Luồng 4 (Cross-Device) & CD-12: Tạo Mã Kết Nối Nhanh 6 Ký Tự (Mobile-to-PC Handoff)
      if (req.method === "POST" && pathname === "/api/v1/handoff/pair") {
        const user = resolveActingUser(req);
        const { json } = await readRawAndJsonBody(req);
        const result = platform.createCrossDeviceHandoff({
          ...json,
          userId: json.userId !== undefined ? json.userId : (user ? user.id : null)
        });
        return sendJson(res, result.statusCode, result);
      }

      // Giải mã Mã Kết Nối Nhanh 6 Ký Tự hoặc Giỏ đồng bộ đám mây trên PC
      const pairMatch = pathname.match(/^\/api\/v1\/handoff\/pair\/([^/]+)$/);
      if (req.method === "GET" && pairMatch) {
        const code = decodeURIComponent(pairMatch[1]);
        const result = platform.resolveCrossDeviceHandoff(code);
        return sendJson(res, result.statusCode, result);
      }

      const uploadMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/upload-url$/);
      if (req.method === "POST" && uploadMatch) {
        const projectId = decodeURIComponent(uploadMatch[1]);
        const user = resolveActingUser(req);
        const { json } = await readRawAndJsonBody(req);
        const result = platform.uploadAndScanVersion(user, projectId, json);
        return sendJson(res, result.statusCode, result);
      }

      const rollbackMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/([^/]+)\/rollback$/);
      if (req.method === "POST" && rollbackMatch) {
        const projectId = decodeURIComponent(rollbackMatch[1]);
        const versionNumber = decodeURIComponent(rollbackMatch[2]);
        const user = resolveActingUser(req);
        const result = platform.rollbackProjectVersion(user, projectId, versionNumber);
        return sendJson(res, result.statusCode, result);
      }

      // So sánh sự khác biệt giữa 2 phiên bản (Version Diff Viewer - Luồng 6)
      const diffMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/diff$/);
      if (req.method === "GET" && diffMatch) {
        const slug = decodeURIComponent(diffMatch[1]);
        const baseVer = parsedUrl.searchParams.get("base") || "1.0.0";
        const compVer = parsedUrl.searchParams.get("compare") || "latest";
        const diffData = platform.compareProjectVersions(slug, baseVer, compVer);
        if (!diffData) return sendJson(res, 404, { error: "DIFF_NOT_FOUND" });
        return sendJson(res, 200, diffData);
      }

      // Thả sao / Theo dõi dự án (Luồng 7)
      const starMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/star$/);
      if (req.method === "POST" && starMatch) {
        const slug = decodeURIComponent(starMatch[1]);
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const { json } = await readRawAndJsonBody(req);
        const result = platform.toggleStarAndWatch(user, slug, json);
        return sendJson(res, result.statusCode, result);
      }

      // Gửi đánh giá đa tiêu chí (Luồng 7)
      const reviewMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/reviews$/);
      if (req.method === "POST" && reviewMatch) {
        const slug = decodeURIComponent(reviewMatch[1]);
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const { json } = await readRawAndJsonBody(req);
        const result = platform.submitProjectReview(user, slug, json, { ip: getClientIp(req) });
        return sendJson(res, result.statusCode, result);
      }

      // Đăng câu hỏi / Báo lỗi cài đặt (Luồng 7)
      const issueMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/issues$/);
      if (req.method === "POST" && issueMatch) {
        const slug = decodeURIComponent(issueMatch[1]);
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const { json } = await readRawAndJsonBody(req);
        const result = platform.createProjectIssue(user, slug, json);
        return sendJson(res, result.statusCode, result);
      }

      const resolveIssueMatch = pathname.match(/^\/api\/v1\/issues\/([^/]+)\/resolve$/);
      if (req.method === "POST" && resolveIssueMatch) {
        const issueId = decodeURIComponent(resolveIssueMatch[1]);
        const user = resolveActingUser(req) || platform.users.get("u-contributor-1");
        const result = platform.resolveProjectIssue(user, issueId);
        return sendJson(res, result.statusCode, result);
      }

      const deleteMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (req.method === "DELETE" && deleteMatch) {
        const projectId = decodeURIComponent(deleteMatch[1]);
        const user = resolveActingUser(req);
        const result = platform.softDeleteProject(user, projectId);
        return sendJson(res, result.statusCode, result);
      }

      const treeMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/([^/]+)\/tree$/);
      if (req.method === "GET" && treeMatch) {
        const slug = decodeURIComponent(treeMatch[1]);
        const version = decodeURIComponent(treeMatch[2]);
        const treeData = platform.getVersionTree(slug, version);
        if (!treeData) return sendJson(res, 404, { error: "TREE_NOT_FOUND" });
        return sendJson(res, 200, treeData);
      }

      const fileMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/([^/]+)\/file$/);
      if (req.method === "GET" && fileMatch) {
        const slug = decodeURIComponent(fileMatch[1]);
        const version = decodeURIComponent(fileMatch[2]);
        const filePath = parsedUrl.searchParams.get("path") || "";
        const fileData = platform.getVersionFilePreview(slug, version, filePath);
        if (!fileData) return sendJson(res, 404, { error: "FILE_NOT_FOUND" });
        return sendJson(res, 200, fileData);
      }

      const downloadReqMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/([^/]+)\/download$/);
      if (req.method === "POST" && downloadReqMatch) {
        const slug = decodeURIComponent(downloadReqMatch[1]);
        const version = decodeURIComponent(downloadReqMatch[2]);
        const { json } = await readRawAndJsonBody(req);
        const dlResult = platform.requestDownload(slug, version, {
          ip: getClientIp(req),
          userAgent: req.headers["user-agent"],
          downloadType: json.download_type || "full_archive",
          filePath: json.file_path || null,
          folderPath: json.folder_path || null,
          customEnvValues: json.custom_env_values || null,
          captchaVerified: Boolean(json.captcha_verified)
        });
        return sendJson(res, dlResult.statusCode, dlResult);
      }

      const signedDlMatch = pathname.match(/^\/api\/v1\/download\/signed\/([^/]+)$/);
      if (req.method === "GET" && signedDlMatch) {
        const token = decodeURIComponent(signedDlMatch[1]);
        const verified = platform.storage.verifySignedDownloadToken(token);
        if (!verified.valid) {
          return sendJson(res, 403, {
            error: verified.reason,
            message: "Đường dẫn tải xuống đã hết hạn (15 phút) hoặc chữ ký không hợp lệ."
          });
        }
        const { storageKey, filename } = verified.data;
        const rangeHeader = req.headers["range"];
        const served = platform.storage.serveBufferWithRange(storageKey, filename, rangeHeader);
        res.writeHead(served.statusCode, {
          "Access-Control-Allow-Origin": "*",
          ...served.headers
        });
        return res.end(served.body);
      }

      const reportMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/report$/);
      if (req.method === "POST" && reportMatch) {
        const slug = decodeURIComponent(reportMatch[1]);
        const { json } = await readRawAndJsonBody(req);
        const repRes = platform.submitAbuseReport(slug, json, { ip: getClientIp(req) });
        return sendJson(res, repRes.statusCode, repRes);
      }

      const detailMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (req.method === "GET" && detailMatch) {
        const slug = decodeURIComponent(detailMatch[1]);
        const detail = platform.getProjectDetailBySlug(slug);
        if (!detail) return sendJson(res, 404, { error: "PROJECT_NOT_FOUND" });
        return sendJson(res, 200, detail);
      }

      if (req.method === "GET" && pathname === "/api/v1/admin/overview") {
        const allProjects = Array.from(platform.projects.values()).map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          health_score: p.health_score || 95,
          visibility_status: p.visibility_status,
          download_count: p.download_count,
          view_count: p.view_count,
          quarantine_threshold: p.quarantine_threshold,
          updated_at: p.updated_at
        }));
        const flaggedVersions = Array.from(platform.projectVersions.values()).filter(
          (v) => v.scan_status === "flagged" || v.scan_status === "failed"
        );
        return sendJson(res, 200, {
          projects: allProjects,
          reports: platform.abuseReports,
          flaggedVersions,
          auditLogs: platform.auditLogs
        });
      }

      const modMatch = pathname.match(/^\/api\/v1\/admin\/projects\/([^/]+)\/moderate$/);
      if (req.method === "POST" && modMatch) {
        const projectId = decodeURIComponent(modMatch[1]);
        const user = platform.users.get("u-admin-1");
        const { json } = await readRawAndJsonBody(req);
        const modRes = platform.moderateProject(user, projectId, json);
        return sendJson(res, modRes.statusCode, modRes);
      }

      if (req.method === "GET" && pathname === "/api/v1/image-proxy") {
        const targetUrl = parsedUrl.searchParams.get("url") || "";
        const safeLabel = escapeHtml(targetUrl.slice(0, 65));
        const svgPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="220" viewBox="0 0 680 220">
          <rect width="680" height="220" rx="12" fill="#0F172A"/>
          <rect x="16" y="16" width="648" height="188" rx="8" fill="#1E293B" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="6 4"/>
          <text x="340" y="95" fill="#38BDF8" font-family="system-ui, sans-serif" font-size="16" font-weight="700" text-anchor="middle">🛡️ OpenHub Privacy Image Proxy (Đã ẩn IP người xem)</text>
          <text x="340" y="130" fill="#94A3B8" font-family="monospace" font-size="12" text-anchor="middle">Nguồn gốc: ${safeLabel}</text>
        </svg>`;
        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
          "X-Privacy-Proxy": "OpenHub-Shield"
        });
        return res.end(svgPlaceholder);
      }

      let staticFile = pathname === "/" ? "/index.html" : pathname;
      const safeRelative = path.normalize(staticFile).replace(/^(\.\.(\/|\\|$))+/, "");
      const fullPath = path.join(__dirname, safeRelative);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mimeMap = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
          ".ico": "image/x-icon"
        };
        const devProfile = detectDeviceProfile(req.headers);
        res.writeHead(200, {
          "Content-Type": mimeMap[ext] || "text/plain; charset=utf-8",
          "X-Device-Type": devProfile.deviceType,
          "Vary": "Sec-CH-UA-Mobile, User-Agent"
        });
        return res.end(fs.readFileSync(fullPath));
      }

      return sendJson(res, 404, { error: "NOT_FOUND", message: "Đường dẫn không tồn tại." });
    } catch (err) {
      return sendJson(res, 500, { error: "INTERNAL_ERROR", message: err.message || "Lỗi máy chủ nội bộ." });
    }
  });

  return { server, platform };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const { server } = createAppServer();
  server.listen(port, () => {
    console.log(`🚀 OpenHub v2.0 Server đang chạy tại: http://localhost:${port}`);
  });
}

module.exports = { createAppServer };
