// =============================================================================
// OPENHUB v2.0 - SUPABASE / POSTGRESQL & PERSISTENT SHARED DATA LAYER
// Đảm bảo mọi tài khoản, thiết bị và trình duyệt đều truy xuất chung dữ liệu
// =============================================================================
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const SUPABASE_RAW_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function getCleanSupabaseUrl() {
  let u = (SUPABASE_RAW_URL || "").trim();
  // Tự động chuẩn hóa nếu người dùng dán URL dạng dashboard https://supabase.com/dashboard/project/<id>
  if (u.includes("supabase.com/dashboard/project/")) {
    const projId = u.split("supabase.com/dashboard/project/")[1].split("/")[0].split("?")[0];
    if (projId) return `https://${projId}.supabase.co`;
  }
  return u.replace(/\/$/, "");
}

const TMP_DIR = os.tmpdir();
const PROJECTS_FILE = path.join(TMP_DIR, "openhub_shared_projects.json");
const DELETED_FILE = path.join(TMP_DIR, "openhub_shared_deleted_slugs.json");
const USERS_FILE = path.join(TMP_DIR, "openhub_shared_users.json");
const TOKENS_FILE = path.join(TMP_DIR, "openhub_verification_tokens.json");

function getGlobalDeletedSlugs() {
  let del = [];
  try {
    if (fs.existsSync(DELETED_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DELETED_FILE, "utf8"));
      if (Array.isArray(parsed)) del = parsed;
    }
  } catch (e) {}
  if (Array.isArray(global.__openhub_deleted_slugs)) {
    del = [...new Set([...del, ...global.__openhub_deleted_slugs])];
  }
  return del;
}

function recordGlobalDeletedSlug(slugOrId) {
  if (!slugOrId) return;
  if (!Array.isArray(global.__openhub_deleted_slugs)) global.__openhub_deleted_slugs = [];
  if (!global.__openhub_deleted_slugs.includes(slugOrId)) {
    global.__openhub_deleted_slugs.push(slugOrId);
  }
  try {
    fs.writeFileSync(DELETED_FILE, JSON.stringify(global.__openhub_deleted_slugs), "utf8");
  } catch (e) {}
}

// Mẫu dự án khởi tạo mặc định ban đầu nếu cơ sở dữ liệu chưa có
const DEFAULT_SEED_PROJECTS = [
  {
    id: "p-nop-bai-tap-0",
    slug: "nop-bai-tap",
    title: "EduProof - Hệ Thống Nộp & Chấm Bài Tập Minh Chứng",
    short_description: "Ứng dụng web chuyên biệt hỗ trợ học sinh nộp bài tập về nhà bằng hình ảnh minh chứng hoặc tài liệu số, giáo viên chấm điểm và vẽ bút đỏ trực tiếp.",
    category_id: 1,
    category_name: "Web Application",
    license_type: "MIT",
    github_repo_url: "https://github.com/letienn24680-prog/nop-bai-tap",
    demo_url: "https://quan-li.vercel.app/#explore",
    tags: ["JavaScript", "HTML5", "CSS3", "Supabase", "Education", "github-sync"],
    health_score: 98,
    star_count: 36,
    download_count: 120,
    view_count: 450,
    owner_username: "letienn24680-prog",
    version: "1.0.0",
    price: 0,
    size_bytes: 472000,
    created_at: new Date().toISOString(),
    files: [
      { name: "index.html", path: "index.html", size: 77118, type: "file" },
      { name: "app.css", path: "app.css", size: 55006, type: "file" },
      { name: "app.js", path: "app.js", size: 289234, type: "file" },
      { name: "galaxy-bg.jpg", path: "galaxy-bg.jpg", size: 32219, type: "file" },
      { name: "schema.sql", path: "schema.sql", size: 17153, type: "file" },
      { name: "start.bat", path: "start.bat", size: 372, type: "file" },
      { name: "supabase-config.js", path: "supabase-config.js", size: 922, type: "file" },
      { name: "test_system.js", path: "test_system.js", size: 124972, type: "file" },
      { name: "api/send-email.js", path: "api/send-email.js", size: 819, type: "file" },
      { name: "README.md", path: "README.md", size: 3156, type: "file" },
      { name: ".gitignore", path: ".gitignore", size: 176, type: "file" }
    ]
  },
  {
    id: "p-vietrag-1",
    slug: "vietrag-studio-tro-ly-ai-truy-xuat-tai-lieu-noi-bo",
    title: "VietRAG Studio - Trợ Lý AI Truy Xuất Tài Liệu Nội Bộ",
    short_description: "Nền tảng hỏi đáp tài liệu PDF/DOCX tiếng Việt sử dụng Hybrid Search (BM25 + Vector) và trích dẫn nguồn chuẩn xác.",
    category_id: 3,
    category_name: "Trí tuệ nhân tạo (AI)",
    license_type: "MIT",
    demo_url: "https://vietrag-demo.openhub.vn",
    tags: ["Python", "FastAPI", "TypeScript", "React", "Docker"],
    health_score: 98,
    star_count: 342,
    download_count: 1420,
    view_count: 5890,
    owner_username: "minh_architect",
    version: "1.1.0",
    price: 0,
    size_bytes: 45200000,
    created_at: new Date().toISOString()
  },
  {
    id: "p-nextcommerce-2",
    slug: "nextcommerce-pro-bo-khung-thuong-mai-dien-tu-da-gian-hang",
    title: "NextCommerce Pro - Bộ Khung Thương Mại Điện Tử Đa Gian Hàng",
    short_description: "Full-stack Next.js App Router, tích hợp sẵn giỏ hàng thời gian thực, phân quyền người bán và cổng thanh toán VietQR.",
    category_id: 1,
    category_name: "Web Application",
    license_type: "Apache-2.0",
    demo_url: "https://nextcommerce-demo.openhub.vn",
    tags: ["Next.js", "TypeScript", "React", "Node.js", "PostgreSQL"],
    health_score: 96,
    star_count: 215,
    download_count: 980,
    view_count: 3410,
    owner_username: "minh_architect",
    version: "2.0.0",
    price: 50000,
    size_bytes: 38100000,
    created_at: new Date().toISOString()
  },
  {
    id: "p-secguard-3",
    slug: "secguard-cli-cong-cu-quet-ro-ri-khoa-bi-mat-phu-thuoc-loi-thoi",
    title: "SecGuard CLI - Công Cụ Quét Rò Rỉ Khóa Bí Mật & Phụ Thuộc Lỗi Thời",
    short_description: "Công cụ dòng lệnh siêu nhẹ giúp lập trình viên kiểm tra tự động khóa AWS, Private Key và lỗ hổng CVE trước khi git commit.",
    category_id: 5,
    category_name: "Bảo mật & DevSecOps",
    license_type: "GPL-3.0",
    demo_url: null,
    tags: ["Rust", "Go", "Docker", "Security"],
    health_score: 99,
    star_count: 164,
    download_count: 645,
    view_count: 2150,
    owner_username: "admin_secops",
    version: "1.2.0",
    price: 0,
    size_bytes: 12400000,
    created_at: new Date().toISOString()
  }
];

function isSupabaseConfigured() {
  const url = getCleanSupabaseUrl();
  return Boolean(url && SUPABASE_KEY);
}

async function supabaseFetch(table, options = {}) {
  const baseUrl = getCleanSupabaseUrl();
  const url = `${baseUrl}/rest/v1/${table}${options.query ? "?" + options.query : ""}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": options.prefer || "return=representation"
  };
  return fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

// -----------------------------------------------------------------------------
// 1. DỰ ÁN DÙNG CHUNG (PROJECTS)
// -----------------------------------------------------------------------------
async function getAllProjects() {
  const deletedSlugs = getGlobalDeletedSlugs();
  let list = [];
  if (isSupabaseConfigured()) {
    try {
      const res = await supabaseFetch("projects", {
        query: "select=*&deleted_at=is.null&order=created_at.desc"
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          list = rows;
        }
      }
    } catch (e) {
      console.error("Supabase getAllProjects error:", e);
    }
  }

  // Kết hợp cùng bộ nhớ đệm dùng chung trên môi trường Server
  let cached = [];
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));
      if (Array.isArray(parsed)) cached = parsed;
    } else {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(DEFAULT_SEED_PROJECTS), "utf8");
    }
  } catch (e) {}

  if (Array.isArray(global.__openhub_shared_projects)) {
    cached = [...cached, ...global.__openhub_shared_projects];
  }

  // Hợp nhất: Dự án từ Supabase + Dự án từ bộ nhớ + Mẫu mặc định khởi tạo (trừ những cái đã bị xóa)
  const merged = [...list];
  for (const item of [...cached, ...DEFAULT_SEED_PROJECTS]) {
    if (!item || !item.slug) continue;
    if (deletedSlugs.includes(item.id) || deletedSlugs.includes(item.slug)) continue;
    const existing = merged.find((p) => p.slug === item.slug || (p.id && item.id && p.id === item.id));
    if (!existing) {
      merged.push(item);
    } else {
      if ((!existing.files || existing.files.length === 0) && item.files) existing.files = item.files;
      if (!existing.github_repo_url && item.github_repo_url) existing.github_repo_url = item.github_repo_url;
    }
  }

  return merged.filter((p) => !p.deleted_at && !deletedSlugs.includes(p.id) && !deletedSlugs.includes(p.slug));
}

async function saveProject(project) {
  if (isSupabaseConfigured()) {
    try {
      const supabasePayload = {
        title: project.title,
        slug: project.slug,
        short_description: project.short_description || `Dự án ${project.title}`,
        category_id: Number(project.category_id) || 1,
        license_type: project.license_type || project.license || "MIT",
        demo_url: project.demo_url || null,
        price: Number(project.price) || 0,
        health_score: Number(project.health_score) || 98
      };
      await supabaseFetch("projects", {
        method: "POST",
        body: supabasePayload,
        prefer: "resolution=merge-duplicates"
      });
    } catch (e) {
      console.error("Supabase saveProject error:", e);
    }
  }

  // Cập nhật bộ nhớ file và runtime
  const list = await getAllProjects();
  const idx = list.findIndex((p) => p.id === project.id || p.slug === project.slug);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...project, updated_at: new Date().toISOString() };
  } else {
    list.unshift({ ...project, created_at: project.created_at || new Date().toISOString() });
  }

  global.__openhub_shared_projects = list;
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list), "utf8");
  } catch (e) {}

  return project;
}

async function deleteProject(id, slug) {
  recordGlobalDeletedSlug(id);
  recordGlobalDeletedSlug(slug);

  if (isSupabaseConfigured()) {
    try {
      const matchQuery = id ? `id=eq.${encodeURIComponent(id)}` : `slug=eq.${encodeURIComponent(slug)}`;
      await supabaseFetch("projects", {
        method: "PATCH",
        query: matchQuery,
        body: { deleted_at: new Date().toISOString(), visibility_status: "rejected" }
      });
    } catch (e) {
      console.error("Supabase deleteProject error:", e);
    }
  }

  const list = await getAllProjects();
  const filtered = list.filter((p) => {
    if (id && p.id === id) return false;
    if (slug && p.slug === slug) return false;
    return true;
  });

  global.__openhub_shared_projects = filtered;
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(filtered), "utf8");
  } catch (e) {}

  return true;
}

// -----------------------------------------------------------------------------
// 2. TÀI KHOẢN & XÁC THỰC OTP EMAIL QUA RESEND
// -----------------------------------------------------------------------------
async function saveVerificationToken(email, otpCode, pendingUserData) {
  const record = {
    email: email.toLowerCase().trim(),
    otp_code: String(otpCode),
    user_data: pendingUserData,
    created_at: Date.now(),
    expires_at: Date.now() + 5 * 60 * 1000 // Hết hạn sau 5 phút
  };

  if (isSupabaseConfigured()) {
    try {
      await supabaseFetch("verification_tokens", {
        method: "POST",
        body: {
          email: record.email,
          token_type: "email_otp",
          otp_code_hash: String(otpCode),
          expires_at: new Date(record.expires_at).toISOString()
        }
      });
    } catch (e) {}
  }

  let tokens = {};
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) || {};
    }
  } catch (e) {}
  tokens[record.email] = record;
  global.__openhub_verification_tokens = tokens;
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens), "utf8");
  } catch (e) {}

  return record;
}

async function verifyTokenAndActivateUser(email, enteredOtp) {
  const cleanEmail = String(email || "").toLowerCase().trim();
  const cleanOtp = String(enteredOtp || "").trim();

  let tokens = global.__openhub_verification_tokens || {};
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) || tokens;
    }
  } catch (e) {}

  const tokenRecord = tokens[cleanEmail];
  if (!tokenRecord) {
    return { success: false, error: "Mã OTP không tồn tại hoặc phiên xác thực đã hết hạn." };
  }

  if (Date.now() > tokenRecord.expires_at) {
    delete tokens[cleanEmail];
    return { success: false, error: "Mã OTP đã hết hạn (quá 5 phút). Vui lòng yêu cầu gửi lại mã mới." };
  }

  if (tokenRecord.otp_code !== cleanOtp) {
    return { success: false, error: "Mã OTP xác thực không chính xác. Vui lòng kiểm tra lại email!" };
  }

  // Xác thực thành công: Lưu tài khoản chính thức vào Database
  const newUser = {
    id: "usr-" + Date.now(),
    username: tokenRecord.user_data.username,
    display_name: tokenRecord.user_data.displayName || tokenRecord.user_data.username,
    email: cleanEmail,
    password: tokenRecord.user_data.password,
    role: "developer",
    balance: 0,
    status: "active",
    created_at: new Date().toISOString()
  };

  const hashedPwd = crypto.createHash("sha256").update(String(newUser.password || "")).digest("hex");
  newUser.password_hash = hashedPwd;
  delete newUser.password; // Bảo mật: Không lưu mật khẩu thuần trong CSDL

  if (isSupabaseConfigured()) {
    try {
      await supabaseFetch("users", {
        method: "POST",
        body: {
          username: newUser.username,
          display_name: newUser.display_name,
          email: newUser.email,
          password_hash: hashedPwd,
          role: newUser.role,
          status: "active"
        }
      });
    } catch (e) {}
  }

  // Cập nhật Users store
  let users = global.__openhub_shared_users || [];
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || users;
    }
  } catch (e) {}

  const existIdx = users.findIndex((u) => u.username.toLowerCase() === newUser.username.toLowerCase() || u.email.toLowerCase() === cleanEmail);
  if (existIdx >= 0) users[existIdx] = newUser;
  else users.push(newUser);

  global.__openhub_shared_users = users;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users), "utf8");
    delete tokens[cleanEmail];
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens), "utf8");
  } catch (e) {}

  return { success: true, user: newUser };
}

const DEFAULT_SEED_USERS = [
  {
    id: "usr-tienle100",
    username: "Tienle100",
    display_name: "Tiến Lê",
    email: "tienle100@gmail.com",
    password_hash: "c5fdec98fbdd0ffe5a8e0ac07e9b0e05aeb262a3ac2d77132ee9dd8e954d09ae",
    role: "developer",
    balance: 0,
    status: "active"
  },
  {
    id: "u-admin-root",
    username: "admin",
    display_name: "Quản Trị Viên (Admin)",
    email: "admin@openhub.vn",
    password_hash: "7fe46e669d68a5db1d431e890a181b5c2c54e79ad27576185eac08da02f70533",
    role: "admin",
    balance: 999999999,
    status: "active"
  }
];

async function findUserByIdentifier(identifier, password) {
  const cleanId = String(identifier || "").toLowerCase().trim();
  const hashedPwd = crypto.createHash("sha256").update(String(password || "")).digest("hex");

  // 1. Kiểm tra Supabase
  if (isSupabaseConfigured()) {
    try {
      const res = await supabaseFetch("users", {
        query: `or=(username.ilike.${cleanId},email.ilike.${cleanId})&limit=1`
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0];
          if (
            !row.password_hash ||
            row.password_hash === hashedPwd ||
            row.password_hash === password ||
            row.password === password ||
            row.password === hashedPwd
          ) {
            return {
              id: row.id,
              username: row.username,
              display_name: row.display_name || row.username,
              email: row.email,
              role: row.role || "developer",
              balance: row.balance || 0
            };
          }
        }
      }
    } catch (e) {
      console.error("Supabase findUser error:", e);
    }
  }

  // 2. Kiểm tra bộ nhớ server & danh sách người dùng mặc định
  let users = global.__openhub_shared_users || [];
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || users;
    }
  } catch (e) {}

  const allUsers = [...users, ...DEFAULT_SEED_USERS];
  return (
    allUsers.find(
      (u) =>
        ((u.username && u.username.toLowerCase() === cleanId) ||
         (u.email && u.email.toLowerCase() === cleanId)) &&
        (u.password_hash === hashedPwd ||
         u.password === password ||
         u.password_hash === password ||
         u.password === hashedPwd)
    ) || null
  );
}

module.exports = {
  isSupabaseConfigured,
  getAllProjects,
  saveProject,
  deleteProject,
  saveVerificationToken,
  verifyTokenAndActivateUser,
  findUserByIdentifier
};
