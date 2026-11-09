// =============================================================================
// OPENHUB v2.0 - VERCEL SERVERLESS FUNCTION: SEPAY IPN WEBHOOK ENDPOINT
// Endpoint: https://quan-li.vercel.app/api/sepay/ipn
// Merchant ID: SP-LIVE-LT796453
// =============================================================================

// Lưu trữ các giao dịch đã nhận trong bộ nhớ runtime và temp file của serverless
const fs = require("fs");
const path = require("path");
const os = require("os");

const SEPAY_SECRET_KEY = "spsk_live_kF2iAxsSMpf5Ug2r4yerL59nZ677eDZ9";
const TMP_FILE = path.join(os.tmpdir(), "sepay_transactions.json");

function loadTransactions() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_FILE, "utf8"));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return global.__sepay_transactions || [];
}

function saveTransactions(list) {
  global.__sepay_transactions = list;
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(list), "utf8");
  } catch (e) {}
}

module.exports = async (req, res) => {
  const completedTransactions = loadTransactions();
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sepay-Signature");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ---------------------------------------------------------------------------
  // 1. GET: Dùng cho SePay kiểm tra tính sẵn sàng hoặc Frontend Polling kiểm tra
  // ---------------------------------------------------------------------------
  if (req.method === "GET") {
    const { check, username, list } = req.query || {};

    if (list === "true") {
      return res.status(200).json({
        success: true,
        total: completedTransactions.length,
        items: completedTransactions.slice(0, 20)
      });
    }

    if (check) {
      const cleanCheck = String(check).toLowerCase().replace(/[^a-z0-9]/g, "");
      const matched = completedTransactions.find((t) => {
        const c1 = String(t.content || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const c2 = String(t.orderCode || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return c1.includes(cleanCheck) || c2.includes(cleanCheck);
      });

      if (matched) {
        return res.status(200).json({
          success: true,
          paid: true,
          transaction: matched
        });
      }

      return res.status(200).json({
        success: true,
        paid: false,
        message: "Đang chờ khách hàng chuyển khoản..."
      });
    }

    // Health check cho SePay hoặc xem trực tiếp trên trình duyệt
    return res.status(200).json({
      status: "ok",
      gateway: "SePay",
      merchantId: "SP-LIVE-LT796453",
      endpoint: "https://quan-li.vercel.app/api/sepay/ipn",
      message: "SePay Webhook IPN Endpoint đang hoạt động sẵn sàng nhận dữ liệu giao dịch."
    });
  }

  // ---------------------------------------------------------------------------
  // 2. POST: SePay bắn Webhook IPN khi có khách hàng chuyển khoản thành công
  // ---------------------------------------------------------------------------
  if (req.method === "POST") {
    try {
      let body = req.body || {};
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (e) {
          body = {};
        }
      }

      // Hỗ trợ cả 2 chuẩn dữ liệu của SePay:
      // Chuẩn 1 (Bank Webhook): transferAmount, content, transferType, gateway, accountNumber
      // Chuẩn 2 (Payment Gateway): order_amount, order_invoice_number, payment_status
      const amount = Number(body.transferAmount || body.order_amount || body.amount || 0);
      const content = String(body.content || body.order_invoice_number || body.order_description || body.description || "").trim();
      const gateway = body.gateway || "MBBank";
      const transferType = body.transferType || "in";
      const transactionId = body.id || body.referenceCode || ("TX-" + Date.now());

      // Chỉ xử lý giao dịch tiền vào (nạp tiền)
      if (transferType === "in" && amount > 0) {
        const txRecord = {
          id: transactionId,
          amount,
          content,
          gateway,
          accountNumber: body.accountNumber || "7897895757",
          transactionDate: body.transactionDate || new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        // Lưu vào danh sách giao dịch gần nhất
        completedTransactions.unshift(txRecord);
        if (completedTransactions.length > 200) completedTransactions.pop();
        saveTransactions(completedTransactions);

        console.log(`[SePay Webhook SUCCESS] Đã nhận ${amount} VNĐ - Nội dung: "${content}" - Mã GD: ${transactionId}`);

        return res.status(200).json({
          success: true,
          message: "Đã ghi nhận giao dịch nạp tiền thành công",
          received: {
            transactionId,
            amount,
            content
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: "Bỏ qua giao dịch không phải tiền vào"
      });
    } catch (err) {
      console.error("[SePay Webhook Error]", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Internal server error"
      });
    }
  }

  return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
};
