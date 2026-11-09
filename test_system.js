/**
 * ============================================================================
 * OPENHUB v2.0 — AUTOMATED QA & EDGE-CASE TEST SUITE (test_system.js)
 * Kiểm thử tự động toàn diện 10 Luồng Nghiệp Vụ & 15 Edge Cases (EC-01 -> EC-15)
 * + Tích hợp End-to-End HTTP RESTful Server (/api/v1/*)
 * ============================================================================
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  WEBHOOK_SECRET,
  OpenHubPlatform,
  SecurityScannerWorker,
  normalizeAndSanitizeFilePath,
  safePercentChange,
  formatMiddleEllipsis,
  formatCompactMetric,
  detectDeviceProfile,
  rewriteExternalImagesToProxy
} = require("./core");
const { createAppServer } = require("./server");

async function runAllTests() {
  console.log("======================================================================");
  console.log("🚀 CHẠY BỘ KIỂM THỬ TỰ ĐỘNG OPENHUB v2.0 (10 LUỒNG & 15 EDGE CASES)");
  console.log("======================================================================\n");

  let passed = 0;
  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error("     Chi tiết lỗi:", err.message);
      process.exitCode = 1;
      throw err;
    }
  }

  const platform = new OpenHubPlatform();

  // --------------------------------------------------------------------------
  // 1. LUỒNG 1 & EC-01: ĐĂNG KÝ, IDEMPOTENCY KEY, USERNAME CHECK & OTP KÉP
  // --------------------------------------------------------------------------
  await test("Luồng 1 & EC-01: Kiểm tra Username/Password, Idempotency-Key chống đăng ký trùng & Xác thực OTP nguyên tử", async () => {
    const reserved = platform.checkUsernameAvailability("admin");
    assert.equal(reserved.available, false);
    assert.equal(reserved.reason, "RESERVED_WORD");

    const weakPwd = platform.evaluatePasswordStrength("12345678", "hoang_dev", "hoang@dev.vn");
    assert.equal(weakPwd.valid, false);

    // EC-01: Bấm nút Đăng ký nhiều lần liên tục cùng Idempotency-Key
    const idemKey = "idem-register-hoang-2026";
    const reg1 = platform.registerUser(
      {
        username: "hoang_dev_2026",
        email: "hoang@dev.vn",
        password: "UltraSecure#2026",
        display_name: "Hoàng Developer"
      },
      { idempotencyKey: idemKey }
    );
    assert.equal(reg1.statusCode, 201);
    assert.equal(reg1.user.status, "pending");

    const regReplay = platform.registerUser(
      {
        username: "hoang_dev_2026",
        email: "hoang@dev.vn",
        password: "UltraSecure#2026"
      },
      { idempotencyKey: idemKey }
    );
    assert.equal(regReplay.statusCode, 201);
    assert.equal(regReplay.idempotentReplay, true);
    assert.equal(regReplay.user.id, reg1.user.id);

    // Xác thực OTP 6 chữ số thành công
    const ver1 = platform.verifyEmailRegistration({
      email: "hoang@dev.vn",
      otp_code: reg1.verification.demoOtpCode
    });
    assert.equal(ver1.statusCode, 200);
    assert.equal(ver1.user.status, "active");
    assert.ok(ver1.accessToken);
    assert.ok(ver1.refreshToken);

    // EC-01: Tab thứ 2 gửi lại cùng mã OTP đã dùng -> Từ chối 409 TOKEN_ALREADY_CONSUMED
    const verDup = platform.verifyEmailRegistration({
      email: "hoang@dev.vn",
      otp_code: reg1.verification.demoOtpCode
    });
    assert.equal(verDup.statusCode, 409);
    assert.equal(verDup.error, "TOKEN_ALREADY_CONSUMED");
  });

  // --------------------------------------------------------------------------
  // 2. LUỒNG 2 & CHỐT 1.1, 2.1, 2.2: BRUTE-FORCE LOCKOUT, 2FA TOTP & XOAY VÒNG REFRESH TOKEN
  // --------------------------------------------------------------------------
  await test("Luồng 2 & Chốt 2.1, 2.2: Chống Brute-Force 5 lần khóa 15p, Bảo mật 2FA & Phát hiện đánh cắp Refresh Token", async () => {
    // Sai mật khẩu 3 lần -> đòi Captcha; Sai 5 lần -> Khóa tạm thời 15 phút (423 ACCOUNT_TEMP_LOCKED)
    for (let i = 1; i <= 5; i++) {
      platform.loginUser({
        identifier: "hoang_dev_2026",
        password: "WrongPassword@999",
        ip: "198.51.100.77",
        captchaSolved: true
      });
    }
    const lockedRes = platform.loginUser({
      identifier: "hoang_dev_2026",
      password: "UltraSecure#2026",
      ip: "198.51.100.77",
      captchaSolved: true
    });
    assert.equal(lockedRes.statusCode, 423);
    assert.equal(lockedRes.error, "ACCOUNT_TEMP_LOCKED");

    // Đăng nhập từ IP hợp lệ và kiểm tra Xoay vòng Refresh Token (Refresh Token Rotation)
    const loginOk = platform.loginUser({
      identifier: "hoang_dev_2026",
      password: "UltraSecure#2026",
      ip: "127.0.0.1"
    });
    assert.equal(loginOk.statusCode, 200);
    const oldRt = loginOk.refreshToken;

    const rotated = platform.refreshAuthSession(oldRt);
    assert.equal(rotated.statusCode, 200);
    assert.notEqual(rotated.refreshToken, oldRt);

    // Chốt 2.2: Đem Refresh Token cũ đã xoay vòng ra dùng lại -> Phát hiện đánh cắp & Thu hồi toàn bộ phiên!
    const reuseAttack = platform.refreshAuthSession(oldRt);
    assert.equal(reuseAttack.statusCode, 401);
    assert.equal(reuseAttack.error, "REFRESH_TOKEN_REUSE_DETECTED");
    assert.ok(reuseAttack.revokedSessionsCount >= 1);

    // Bật 2FA + 10 Backup Recovery Codes + PAT
    const twofa = platform.enableTwoFactor(loginOk.user.id);
    assert.equal(twofa.statusCode, 200);
    assert.equal(twofa.backupRecoveryCodes.length, 10);

    const login2faStep1 = platform.loginUser({
      identifier: "hoang_dev_2026",
      password: "UltraSecure#2026",
      ip: "127.0.0.1"
    });
    assert.equal(login2faStep1.statusCode, 202);
    assert.equal(login2faStep1.requires2FA, true);

    const login2faStep2 = platform.verifyTwoFactorLogin({
      preAuthTicket: login2faStep1.preAuthTicket,
      code: twofa.backupRecoveryCodes[0]
    });
    assert.equal(login2faStep2.statusCode, 200);
    assert.ok(login2faStep2.accessToken);
  });

  // --------------------------------------------------------------------------
  // 3. LUỒNG 3 & CHỐT 3.1: QUÊN MẬT KHẨU, CHỐNG TRÙNG MẬT KHẨU CŨ & THU HỒI PHIÊN
  // --------------------------------------------------------------------------
  await test("Luồng 3 & Chốt 3.1: Đặt lại mật khẩu chặn trùng mật khẩu cũ & Tự động thu hồi toàn bộ phiên", async () => {
    const reqReset = platform.requestPasswordReset("hoang@dev.vn");
    assert.equal(reqReset.statusCode, 200);
    assert.ok(reqReset.demoResetToken);

    // Chốt 3.1: Đặt lại trùng mật khẩu cũ bị từ chối
    const samePwd = platform.resetPassword({
      reset_token: reqReset.demoResetToken,
      new_password: "UltraSecure#2026"
    });
    assert.equal(samePwd.statusCode, 400);
    assert.equal(samePwd.error, "PASSWORD_SAME_AS_OLD");

    // Đặt mật khẩu mới hợp lệ -> thành công & thu hồi toàn bộ phiên
    const okReset = platform.resetPassword({
      reset_token: reqReset.demoResetToken,
      new_password: "NextGenVault#2027"
    });
    assert.equal(okReset.statusCode, 200);
    assert.ok(okReset.revokedSessions >= 1);
  });

  // --------------------------------------------------------------------------
  // 4. LUỒNG 5 & EC-05 -> EC-10, EC-12: WORKER QUÉT AN TOÀN 4 TẦNG & HEALTH SCORE
  // --------------------------------------------------------------------------
  await test("Luồng 5 & EC-05..EC-10, EC-12: Chặn Zip Bomb, Zip Slip, Lộ khóa AWS/.env, Dọn node_modules & Chấm Health Score", async () => {
    const scanner = new SecurityScannerWorker();

    // EC-05: Zip Bomb tỷ lệ nén > 100:1
    const bombRes = scanner.inspectAndSanitizeArchive([
      { path: "bomb.bin", content: "0".repeat(20000), uncompressedSize: 500000, compressedSize: 100 }
    ]);
    assert.equal(bombRes.scanStatus, "failed");
    assert.equal(bombRes.reasonCode, "ZIP_BOMB_RATIO_EXCEEDED");

    // EC-06: Path Traversal (Zip Slip)
    const slipRes = scanner.inspectAndSanitizeArchive([
      { path: "../../etc/passwd", content: "root:x:0:0" }
    ]);
    assert.equal(slipRes.scanStatus, "failed");
    assert.equal(slipRes.reasonCode, "PATH_TRAVERSAL_DETECTED");

    // EC-07: Lộ khóa bí mật AWS Access Key & tệp .env thật
    const secretRes = scanner.inspectAndSanitizeArchive([
      { path: "README.md", content: "# App" },
      { path: ".env", content: "STRIPE_SECRET=sk_live_99887766554433221100" },
      { path: "src/config.js", content: 'const aws = "AKIAIOSFODNN7EXAMPLE";\n' }
    ]);
    assert.equal(secretRes.scanStatus, "flagged");
    assert.equal(secretRes.reasonCode, "LEAKED_SECRET_DETECTED");
    assert.ok(secretRes.secretFindings.length >= 2);

    // EC-08 & EC-12: Tự động dọn node_modules/.DS_Store & Chuẩn hóa UTF-8 NFC / Ký tự cấm Windows
    const cleanPath = normalizeAndSanitizeFilePath("thư_mục/tệp:kiểm*thử?.ts");
    assert.equal(cleanPath, "thư_mục/tệp-kiểm-thử-.ts");

    const cleanRes = scanner.inspectAndSanitizeArchive([
      { path: "README.md", content: "# Clean Project\n".repeat(15) },
      { path: "node_modules/react/index.js", content: "module.exports = {};" },
      { path: ".DS_Store", content: "junk" },
      { path: ".env.example", content: "PORT=3000\n" },
      { path: "package.json", content: '{"name":"demo","dependencies":{"express":"^4.19.0"}}' },
      { path: "src/server.ts", content: "console.log('server');\n".repeat(60) }
    ]);
    assert.equal(cleanRes.scanStatus, "clean");
    assert.equal(cleanRes.removedJunkPaths.length, 2);
    assert.equal(cleanRes.envSchemaJson[0].key, "PORT");

    // EC-10: Sanitize XSS & Bọc ảnh ngoài qua Image Proxy
    const proxiedMd = rewriteExternalImagesToProxy('Hello <script>alert(1)</script> ![Diagram](https://evil.tracker.com/pixel.png)');
    assert.ok(!proxiedMd.includes("<script>"));
    assert.ok(proxiedMd.includes("/api/v1/image-proxy?url="));
  });

  // --------------------------------------------------------------------------
  // 5. LUỒNG 4, 6 & EC-02, EC-03, EC-04, EC-13, EC-15: TẢI SUBFOLDER, .ENV, DIFF, ROLLBACK, RANGE 206 & GIỎ BUNDLE
  // --------------------------------------------------------------------------
  await test("Luồng 4, 6 & EC-02..04, EC-13, EC-15: Tải Subfolder, .env Builder, Diff Viewer, Rollback, HTTP 206 Range & Bundle Cart", async () => {
    const slug = "vietrag-studio-tro-ly-ai-truy-xuat-tai-lieu-noi-bo";

    // So sánh Version Diff giữa v1.0.0 và v1.1.0
    const diff = platform.compareProjectVersions(slug, "1.0.0", "1.1.0");
    assert.ok(diff);
    assert.ok(diff.summary.addedCount >= 1);
    assert.ok(diff.summary.modifiedCount >= 1);

    // EC-13: Tải lên trùng phiên bản 1.1.0 trả về 409 Conflict
    const creator = platform.users.get("u-contributor-1");
    const detail = platform.getProjectDetailBySlug(slug, { incrementView: false });
    const dupVer = platform.uploadAndScanVersion(creator, detail.id, {
      version_number: "1.1.0",
      entries: [{ path: "README.md", content: "# Dup" }]
    });
    assert.equal(dupVer.statusCode, 409);
    assert.equal(dupVer.error, "VERSION_ALREADY_EXISTS");

    // Tải thư mục con (subfolder) & Tải kèm .env tùy chỉnh
    const subDl = platform.requestDownload(slug, "1.1.0", {
      downloadType: "subfolder",
      folderPath: "src",
      ip: "10.0.0.1"
    });
    assert.equal(subDl.statusCode, 200);
    assert.ok(subDl.signedUrl.startsWith("/api/v1/download/signed/"));

    const envDl = platform.requestDownload(slug, "1.1.0", {
      customEnvValues: { PORT: "9000", ENABLE_RERANKER: "true" },
      ip: "10.0.0.2"
    });
    assert.equal(envDl.statusCode, 200);
    assert.ok(envDl.filename.endsWith("-with-env.zip"));

    // EC-03: Kiểm tra Resume Download HTTP 206 Partial Content
    const token = envDl.signedUrl.split("/").pop();
    const verifiedToken = platform.storage.verifySignedDownloadToken(token);
    assert.equal(verifiedToken.valid, true);
    const partialResp = platform.storage.serveBufferWithRange(
      verifiedToken.data.storageKey,
      verifiedToken.data.filename,
      "bytes=0-15"
    );
    assert.equal(partialResp.statusCode, 206);
    assert.equal(partialResp.body.length, 16);
    assert.ok(partialResp.headers["Content-Range"].startsWith("bytes 0-15/"));

    // EC-15: Giỏ Dự Án (Project Bundle Cart) tự động loại bỏ dự án không tồn tại/đang cách ly và đóng gói các dự án hợp lệ
    const bundleRes = platform.downloadProjectBundleCart([
      slug,
      "du-an-khong-ton-tai-999"
    ]);
    assert.equal(bundleRes.statusCode, 200);
    assert.equal(bundleRes.includedCount, 1);
    assert.equal(bundleRes.excludedProjects.length, 1);
    assert.ok(bundleRes.manifestText.includes("OPENHUB PROJECT BUNDLE MANIFEST"));
  });

  // --------------------------------------------------------------------------
  // 6. LUỒNG 7, 8, 9, 10 & EC-14: CỘNG ĐỒNG, DASHBOARD (CHỐNG NaN%), GITHUB WEBHOOK & AUTO-QUARANTINE
  // --------------------------------------------------------------------------
  await test("Luồng 7, 8, 9, 10 & EC-14: Đánh giá Verified Downloader, Dashboard chống NaN%, GitHub Webhook & Auto-Quarantine", async () => {
    // EC-14: Tài khoản mới 0 dự án không bao giờ sinh ra NaN% hoặc Infinity%
    assert.equal(safePercentChange(0, 0), 0);
    assert.equal(safePercentChange(15, 0), 100);
    const emptyDash = platform.getDashboardAnalytics({ rangeDays: 7, ownerId: "new-empty-user" });
    assert.equal(emptyDash.isOnboardingEmpty, true);
    assert.equal(emptyDash.kpiCards[0].changePercent, 0);

    const mainDash = platform.getDashboardAnalytics({ rangeDays: 30 });
    assert.equal(mainDash.isOnboardingEmpty, false);
    assert.equal(mainDash.kpiCards.length, 4);
    assert.equal(mainDash.bentoExtraCards.length, 4);

    // Luồng 9: Đồng bộ GitHub & Xác thực chữ ký Webhook X-Hub-Signature-256
    const creator = platform.users.get("u-contributor-1");
    const gitImp = platform.importProjectFromGitRepo(creator, {
      repo_url: "https://github.com/minh_architect/ai-agent-hub",
      title: "AI Agent Hub Synced"
    });
    assert.equal(gitImp.statusCode, 201);

    const webhookBody = JSON.stringify({ tag_name: "v1.2.0", body: "Auto release via GitHub Webhook" });
    const validSig = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(webhookBody).digest("hex");
    const whOk = platform.handleGitHubReleaseWebhook(gitImp.project.id, webhookBody, validSig);
    assert.equal(whOk.statusCode, 201);
    assert.equal(whOk.version.version_number, "1.2.0");

    // Luồng 10: Cầu chì tự động cách ly (Auto-Quarantine) khi nhận 5 báo cáo từ 5 IP độc lập trong 1 giờ
    const targetSlug = gitImp.project.slug;
    for (let i = 1; i <= 5; i++) {
      const rep = platform.submitAbuseReport(
        targetSlug,
        { reason_category: "malware", description: `Phát hiện mã nghi ngờ từ IP #${i}` },
        { ip: `203.0.113.${50 + i}` }
      );
      if (i < 5) assert.equal(rep.autoQuarantined, false);
      if (i === 5) assert.equal(rep.autoQuarantined, true);
    }

    // Kiểm duyệt viên khôi phục (Restore) -> tăng ngưỡng chống report फेक lên +5 (tức 10)
    const admin = platform.users.get("u-admin-1");
    const modRestore = platform.moderateProject(admin, gitImp.project.id, {
      action: "restore",
      note: "Đã kiểm tra mã nguồn sạch, khôi phục hiển thị"
    });
    assert.equal(modRestore.statusCode, 200);
    assert.equal(modRestore.project.visibility_status, "published");
    assert.equal(modRestore.project.quarantine_threshold, 10);
  });

  // --------------------------------------------------------------------------
  // 7. KIỂM THỬ TÍCH HỢP MÁY CHỦ HTTP RESTFUL END-TO-END
  // --------------------------------------------------------------------------
  await test("Tích hợp End-to-End HTTP Server (/api/v1/dashboard/analytics, /api/v1/projects & /api/v1/users/:u/portfolio)", async () => {
    const { server } = createAppServer(platform);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    try {
      const dashRes = await fetch(`http://127.0.0.1:${port}/api/v1/dashboard/analytics?rangeDays=7`);
      assert.equal(dashRes.status, 200);
      const dashData = await dashRes.json();
      assert.equal(dashData.kpiCards.length, 4);

      const portRes = await fetch(`http://127.0.0.1:${port}/api/v1/users/minh_architect/portfolio`);
      assert.equal(portRes.status, 200);
      const portData = await portRes.json();
      assert.equal(portData.heatmapWeeks.length, 52);

      const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(htmlRes.status, 200);
      assert.equal(htmlRes.headers.get("x-device-type"), "desktop");
      const htmlText = await htmlRes.text();
      assert.ok(htmlText.includes("OpenHub"));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // --------------------------------------------------------------------------
  // 8. MÔ-ĐUN BỔ SUNG: CÂN BẰNG GIAO DIỆN ĐA THIẾT BỊ (PC & ĐIỆN THOẠI) — CD-01 -> CD-12
  // --------------------------------------------------------------------------
  await test("Mô-đun Đa Thiết Bị (CD-01..CD-12 & Luồng 1..5): Client Hints, Middle Ellipsis, Compact KPI, Mobile-to-PC Handoff & CSS Anti-Breakage", async () => {
    // Luồng 1: Nhận diện thiết bị qua Sec-CH-UA-Mobile & User-Agent
    const mobProfile = detectDeviceProfile({
      "sec-ch-ua-mobile": "?1",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    });
    assert.equal(mobProfile.deviceType, "mobile");
    assert.equal(mobProfile.isMobile, true);
    assert.equal(mobProfile.zeroClsHint, true);

    const tabProfile = detectDeviceProfile({
      "user-agent": "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"
    });
    assert.equal(tabProfile.deviceType, "tablet");
    assert.equal(tabProfile.isTablet, true);

    const pcProfile = detectDeviceProfile({
      "sec-ch-ua-mobile": "?0",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    });
    assert.equal(pcProfile.deviceType, "desktop");
    assert.equal(pcProfile.isDesktop, true);

    // CD-08: Cắt chuỗi thông minh ở giữa (Middle Ellipsis) cho mã SHA-256 64 ký tự
    const fullSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const truncatedMobileSha = formatMiddleEllipsis(fullSha, true, 19);
    assert.equal(truncatedMobileSha, "e3b0c442...7852b855");
    assert.equal(formatMiddleEllipsis(fullSha, false), fullSha);

    // CD-03: Định dạng số KPI thông minh trên điện thoại (Compact Metric)
    assert.equal(formatCompactMetric(1420500, true), "1.42M");
    assert.equal(formatCompactMetric(28470, true), "28.5K");
    assert.equal(formatCompactMetric(1420500, false), "1,420,500");

    // Luồng 4 & CD-12: Tạo Mã kết nối nhanh 6 ký tự (HUB-XXX / PRO-XXX) từ Điện thoại & Giải mã trên PC
    const slug = "vietrag-studio-tro-ly-ai-truy-xuat-tai-lieu-noi-bo";
    const handoff = platform.createCrossDeviceHandoff({
      slug,
      bundleSlugs: [slug],
      userId: "u-contributor-1",
      sourceDevice: "mobile"
    });
    assert.equal(handoff.statusCode, 201);
    assert.match(handoff.pairCode, /^(HUB|PRO)-[0-9]{3}$/);
    assert.equal(handoff.projects[0].slug, slug);
    assert.ok(handoff.qrSvg.includes("<svg"));
    assert.ok(handoff.shareLinks.telegram.includes("t.me/share/url"));

    // Giải mã trên PC thành công
    const resolved = platform.resolveCrossDeviceHandoff(handoff.pairCode);
    assert.equal(resolved.statusCode, 200);
    assert.equal(resolved.projects[0].slug, slug);
    assert.equal(resolved.bundleDownload.statusCode, 200);

    // Kiểm tra mã hết hạn sau 24 giờ
    const expiredCheck = platform.resolveCrossDeviceHandoff(handoff.pairCode, Date.now() + 25 * 3600 * 1000);
    assert.equal(expiredCheck.statusCode, 410);
    assert.equal(expiredCheck.error, "PAIR_CODE_EXPIRED");

    // Kiểm tra các chốt CSS & HTML chống vỡ khung (CD-01, CD-02, CD-06, CD-09, CD-10, CD-11)
    const cssText = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
    const htmlText = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const tsxText = fs.readFileSync(path.join(__dirname, "components", "AdaptiveAppShell.tsx"), "utf8");

    assert.ok(cssText.includes("overflow-x: clip"), "CD-01: Phải có overflow-x: clip chống tràn ngang");
    assert.ok(cssText.includes("100dvh"), "CD-10: Phải sử dụng 100dvh");
    assert.ok(cssText.includes("env(safe-area-inset-bottom"), "CD-10: Phải tôn trọng safe-area-inset-bottom");
    assert.ok(cssText.includes("font-size: 16px !important"), "CD-09: Phải ép font-size >= 16px trên input mobile chống iOS Safari auto-zoom");
    assert.ok(cssText.includes("@media (hover: hover) and (pointer: fine)"), "CD-11: Phải bọc hiệu ứng hover trong media query");
    assert.ok(htmlText.includes('inputmode="numeric"'), "CD-09: Ô OTP phải có inputmode=numeric");
    assert.ok(htmlText.includes('id="mobileBottomNav"'), "CD-10: Phải có thanh điều hướng đáy 5 mục trên mobile");
    assert.ok(htmlText.includes('id="mobileFileTreeSheet"'), "CD-06: Phải có Bottom Sheet cây thư mục trên mobile");
    assert.ok(tsxText.includes("useResponsiveDevice"), "Phải có hook useResponsiveDevice trong AdaptiveAppShell.tsx");
  });

  // --------------------------------------------------------------------------
  // 9. GIAO DIỆN DASHBOARD NEXAPANEL DARK NEON (E-COMMERCE & DEVELOPER HUB)
  // --------------------------------------------------------------------------
  await test("Giao Diện Dashboard NexaPanel Dark Neon: Hero Motivational Banner, 4 KPI Sparklines, Sales Spline Chart & Responsive PC/Mobile", async () => {
    const cssText = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
    const htmlText = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    const jsText = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
    const statsTsx = fs.readFileSync(path.join(__dirname, "components", "StatsCard.tsx"), "utf8");
    const shellTsx = fs.readFileSync(path.join(__dirname, "components", "AdaptiveAppShell.tsx"), "utf8");

    // 1. Kiểm tra bảng màu NexaPanel Dark Neon (#0B0F19, #0E1322, #111827, #8B5CF6, #6366F1)
    assert.ok(cssText.includes("#0B0F19") && cssText.includes("#111827"), "app.css: Phải có bảng màu chuẩn NexaPanel (#0B0F19 Canvas & #111827 Surface)");
    assert.ok(cssText.includes("#8B5CF6") && cssText.includes("#6366F1"), "app.css: Phải có màu tím neon #8B5CF6 và indigo #6366F1");

    // 2. Kiểm tra Brand, Header & Profile Widget
    assert.ok(htmlText.includes("NexaPanel"), "index.html: Phải có thương hiệu NexaPanel");
    assert.ok(htmlText.includes("E-commerce Admin"), "index.html: Phải có phân mục E-commerce Admin");
    assert.ok(htmlText.includes("Search products, orders, customers..."), "index.html: Thanh tìm kiếm phải chuẩn NexaPanel");
    assert.ok(htmlText.includes("Jisan Ahmed"), "index.html: Phải có thông tin người dùng Jisan Ahmed (Admin)");

    // 3. Kiểm tra Hero Welcome Banner & Motivational Quote Card
    assert.ok(htmlText.includes("Good Morning, Jisan Ahmed"), "index.html: Phải có lời chào buổi sáng Good Morning");
    assert.ok(htmlText.includes("Live Store"), "index.html: Phải có nhãn Live Store kèm chấm xanh");
    assert.ok(htmlText.includes("Small steps every day lead to big results"), "index.html: Phải có thẻ trích dẫn truyền cảm hứng 'Small steps every day lead to big results.'");

    // 4. Kiểm tra 4 Thẻ KPI với hộp icon màu & đường sparkline sóng
    assert.ok(jsText.includes("Total Orders") && jsText.includes("2,847"), "app.js: Phải có thẻ KPI Total Orders (2,847)");
    assert.ok(jsText.includes("Total Customers") && jsText.includes("1,936"), "app.js: Phải có thẻ KPI Total Customers (1,936)");
    assert.ok(jsText.includes("Total Revenue") && jsText.includes("$25,842"), "app.js: Phải có thẻ KPI Total Revenue ($25,842)");
    assert.ok(jsText.includes("Pending Orders") && jsText.includes("12"), "app.js: Phải có thẻ KPI Pending Orders (12)");
    assert.ok(jsText.includes("generateSparklineSvg"), "app.js: Phải có hàm sinh đường sparkline cho thẻ KPI");
    assert.ok(statsTsx.includes("StatsCardProps"), "StatsCard.tsx: Phải hỗ trợ các props của thẻ thống kê");

    // 5. Kiểm tra biểu đồ Sales Overview & 4 chỉ số tóm tắt
    assert.ok(htmlText.includes("Sales Overview"), "index.html: Phải có khối Sales Overview");
    assert.ok(jsText.includes("Average Order Value") && jsText.includes("Conversion Rate"), "app.js: Phải có 4 chỉ số tóm tắt dưới biểu đồ");
    assert.ok(jsText.includes("renderSplineChart"), "app.js: Phải có hàm renderSplineChart vẽ đường cong tím neon");

    // 6. Kiểm tra Top Customers, Recent Activities, Top Selling Products & Donut Chart
    assert.ok(htmlText.includes("Top Customers") && jsText.includes("Rafsan Ahmed"), "Phải có danh sách Top Customers");
    assert.ok(htmlText.includes("Recent Activities") && jsText.includes("New order received"), "Phải có danh sách Recent Activities");
    assert.ok(htmlText.includes("Top Selling Products") && jsText.includes("Wireless Headphones"), "Phải có bảng Top Selling Products");
    assert.ok(htmlText.includes("Revenue Breakdown") && jsText.includes("renderDonutBreakdown"), "Phải có biểu đồ Donut phân bổ doanh thu");

    // 7. Cân bằng trên cả PC và Mobile (CD-01..CD-12)
    assert.ok(cssText.includes("overflow-x: clip"), "CD-01: Phải có overflow-x: clip chống vỡ khung màn hình");
    assert.ok(cssText.includes("100dvh"), "CD-10: Phải dùng 100dvh cho toàn màn hình");
    assert.ok(htmlText.includes("mobileBottomNav"), "CD-10: Phải có thanh điều hướng đáy trên điện thoại");
    assert.ok(cssText.includes(".mobile-stacked-cards"), "CD-05: Bảng tự chuyển thành thẻ xếp chồng trên điện thoại");
    assert.ok(shellTsx.includes("useResponsiveDevice"), "AdaptiveAppShell.tsx: Phải hỗ trợ nhận diện thiết bị responsive");

    // 8. Chốt Bảo Mật: Hộp thoại Đăng nhập / Đăng ký (Auth Gate & Modal)
    assert.ok(htmlText.includes('id="authModal"'), "index.html: Phải có hộp thoại Auth Modal");
    assert.ok(htmlText.includes('id="topGuestAuthButtons"') && htmlText.includes('id="topUserAuthWidget"'), "index.html: Phải có cụm nút Đăng nhập cho khách và widget cho tài khoản đăng nhập");
    assert.ok(htmlText.includes('id="authLoginIdentifier"') && htmlText.includes('id="authRegUsername"'), "index.html: Phải có form đăng nhập và form đăng ký tài khoản mới");
    assert.ok(jsText.includes("requireAuth") && jsText.includes("openAuthModal"), "app.js: Phải có hàm requireAuth và openAuthModal");
    assert.ok(jsText.includes("submitLoginFromModal") && jsText.includes("submitRegisterFromModal"), "app.js: Phải xử lý đăng nhập và đăng ký");
    assert.ok(jsText.includes('navigateView("explore")'), "app.js: Mặc định trang chủ khi mới truy cập là explore");
  });

  console.log("\n======================================================================");
  console.log(`HOÀN TẤT: TOÀN BỘ ${passed}/9 NHÓM KIỂM THỬ (v2.0 + ĐA THIẾT BỊ + NEXAPANEL DASHBOARD) ĐẠT 100%!`);
  console.log("======================================================================");
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
