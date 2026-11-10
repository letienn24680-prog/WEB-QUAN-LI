// =============================================================================
// OPENHUB v2.0 - VERCEL SERVERLESS FUNCTION: AUTH & EMAIL OTP VERIFICATION
// Đăng ký, đăng nhập & Gửi mã OTP xác thực thực sự về Email người dùng qua Resend
// =============================================================================
const crypto = require("crypto");
const db = require("./db");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "OpenHub <onboarding@resend.dev>";

async function sendOtpEmail(toEmail, otpCode, displayName) {
  if (!RESEND_API_KEY) {
    console.warn("[WARN] RESEND_API_KEY chưa được cấu hình. Mã OTP tạo ra:", otpCode);
    return { sent: false, reason: "NO_API_KEY" };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0F172A; color: #F8FAFC; margin: 0; padding: 24px; }
        .card { max-width: 520px; margin: 0 auto; background: #1E293B; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.3); padding: 32px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .logo { font-size: 24px; font-weight: 800; color: #8B5CF6; letter-spacing: -0.5px; margin-bottom: 20px; text-align: center; }
        .title { font-size: 18px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; text-align: center; }
        .desc { font-size: 14px; color: #94A3B8; line-height: 1.6; margin-bottom: 24px; text-align: center; }
        .otp-box { background: rgba(139, 92, 246, 0.12); border: 2px dashed #8B5CF6; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #10B981; font-family: monospace; }
        .footer { font-size: 12px; color: #64748B; text-align: center; margin-top: 24px; line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚡ OpenHub</div>
        <div class="title">Xác Thực Tài Khoản Đăng Ký</div>
        <div class="desc">
          Xin chào <strong>${displayName || "Lập trình viên"}</strong>,<br>
          Cảm ơn bạn đã đăng ký tài khoản trên Nền tảng chia sẻ mã nguồn OpenHub. Dưới đây là mã xác thực OTP của bạn:
        </div>
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div style="font-size: 12px; color: #A78BFA; margin-top: 6px;">Mã có hiệu lực trong vòng 5 phút</div>
        </div>
        <div class="desc" style="font-size: 13px;">
          Vui lòng không chia sẻ mã này cho bất kỳ ai. Nếu bạn không yêu cầu đăng ký tài khoản, vui lòng bỏ qua email này.
        </div>
        <div class="footer">
          © 2026 OpenHub - Nền tảng Chia Sẻ Mã Nguồn & Định Giá Dự Án Tự Động.<br>
          Hệ thống bảo vệ mã nguồn 4 tầng an toàn.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [toEmail],
        subject: `[OpenHub] Mã xác thực OTP đăng ký tài khoản: ${otpCode}`,
        html: htmlContent
      })
    });
    const resData = await res.json();
    return { sent: res.ok, data: resData };
  } catch (err) {
    console.error("Resend API send error:", err);
    return { sent: false, error: err.message };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const url = req.url || "";
  let action = (req.query?.action || "").toLowerCase();
  if (!action) {
    if (url.includes("/register")) action = "register";
    else if (url.includes("/verify-otp") || url.includes("/verify")) action = "verify-otp";
    else if (url.includes("/login")) action = "login";
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  // ---------------------------------------------------------------------------
  // 1. ĐĂNG KÝ (REGISTER) -> Gửi mã OTP về Email qua Resend
  // ---------------------------------------------------------------------------
  if (action === "register" || req.method === "POST" && url.endsWith("/register")) {
    const { username, email, password, display_name, displayName } = body;
    const finalDisplayName = display_name || displayName || username;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Vui lòng điền đầy đủ tên đăng nhập, email và mật khẩu." });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanUser = String(username).toLowerCase().trim();

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      return res.status(400).json({ message: "Địa chỉ email không đúng định dạng." });
    }

    // Sinh mã ngẫu nhiên 6 chữ số
    const otpCode = String(crypto.randomInt(100000, 999999));

    // Lưu token và dữ liệu chờ kích hoạt vào database
    await db.saveVerificationToken(cleanEmail, otpCode, {
      username: cleanUser,
      displayName: finalDisplayName,
      password: String(password)
    });

    // Gửi email thực sự qua Resend
    const sendRes = await sendOtpEmail(cleanEmail, otpCode, finalDisplayName);

    // Lưu ý bảo mật: KHÔNG BAO GIỜ trả mã OTP về frontend!
    return res.status(200).json({
      success: true,
      message: `Mã OTP xác thực đã được gửi về địa chỉ email: ${cleanEmail}. Vui lòng kiểm tra hộp thư đến (Inbox) hoặc Thư rác (Spam).`,
      email: cleanEmail,
      emailSent: sendRes.sent
    });
  }

  // ---------------------------------------------------------------------------
  // 2. XÁC THỰC OTP (VERIFY-OTP) -> Kích hoạt tài khoản vào Database
  // ---------------------------------------------------------------------------
  if (action === "verify-otp" || req.method === "POST" && (url.endsWith("/verify-otp") || url.endsWith("/verify"))) {
    const { email, otp_code, otp } = body;
    const finalOtp = String(otp_code || otp || "").trim();
    const cleanEmail = String(email || "").toLowerCase().trim();

    if (!cleanEmail || !finalOtp) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ email và mã OTP 6 chữ số." });
    }

    const result = await db.verifyTokenAndActivateUser(cleanEmail, finalOtp);
    if (!result.success) {
      return res.status(400).json({ message: result.error || "Mã OTP không hợp lệ hoặc đã hết hạn." });
    }

    return res.status(200).json({
      success: true,
      message: "Xác thực tài khoản thành công!",
      user: result.user,
      accessToken: "token-" + crypto.randomBytes(16).toString("hex")
    });
  }

  // ---------------------------------------------------------------------------
  // 3. ĐĂNG NHẬP (LOGIN)
  // ---------------------------------------------------------------------------
  if (action === "login" || req.method === "POST" && url.endsWith("/login")) {
    const { identifier, password } = body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Vui lòng nhập tên đăng nhập và mật khẩu." });
    }

    const cleanId = String(identifier).toLowerCase().trim();
    const cleanPwd = String(password);

    // Quản trị viên Admin mặc định
    if (
      (cleanId === "admin" || cleanId === "admin@openhub.vn") &&
      (cleanPwd === "admin1109@#" || cleanPwd === "Admin@12345" || cleanPwd === "admin")
    ) {
      return res.status(200).json({
        success: true,
        user: {
          id: "u-admin-root",
          username: "admin",
          display_name: "Quản Trị Viên (Admin)",
          email: "admin@openhub.vn",
          role: "admin",
          balance: 999999999
        },
        accessToken: "admin-jwt-" + crypto.randomBytes(16).toString("hex")
      });
    }

    // Tài khoản người dùng Tiến Lê (hỗ trợ cả mật khẩu thường và mã băm SHA-256)
    const hashedCleanPwd = crypto.createHash("sha256").update(cleanPwd).digest("hex");
    if (
      (cleanId === "tienle100" || cleanId === "tienle100@gmail.com") &&
      (cleanPwd === "Tien1109@#" || hashedCleanPwd === "c5fdec98fbdd0ffe5a8e0ac07e9b0e05aeb262a3ac2d77132ee9dd8e954d09ae")
    ) {
      return res.status(200).json({
        success: true,
        user: {
          id: "usr-tienle100",
          username: "Tienle100",
          display_name: "Tiến Lê",
          email: "tienle100@gmail.com",
          role: "developer",
          balance: 0
        },
        accessToken: "user-jwt-" + crypto.randomBytes(16).toString("hex")
      });
    }

    const user = await db.findUserByIdentifier(cleanId, cleanPwd);
    if (user) {
      return res.status(200).json({
        success: true,
        user,
        accessToken: "user-jwt-" + crypto.randomBytes(16).toString("hex")
      });
    }

    return res.status(401).json({ message: "Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại." });
  }

  return res.status(405).json({ message: "Phương thức không được hỗ trợ." });
};
