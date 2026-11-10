// =============================================================================
// OPENHUB v2.0 - VERCEL SERVERLESS FUNCTION: SHARED PROJECTS API
// Đồng bộ dự án dùng chung cho mọi tài khoản và thiết bị trên Web
// =============================================================================
const db = require("./db");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 1. GET: Lấy danh sách dự án dùng chung (hỗ trợ tìm kiếm, lọc, phân loại)
  if (req.method === "GET") {
    try {
      const all = await db.getAllProjects();
      const { q = "", category = "", tags = "", license = "", sort = "downloads", hasDemo = "" } = req.query || {};

      let items = [...all];
      const query = String(q || "").toLowerCase().trim();
      if (query) {
        items = items.filter(
          (p) =>
            (p.title && p.title.toLowerCase().includes(query)) ||
            (p.short_description && p.short_description.toLowerCase().includes(query)) ||
            (Array.isArray(p.tags) && p.tags.some((t) => String(t).toLowerCase().includes(query)))
        );
      }

      if (category) {
        items = items.filter((p) => String(p.category_id) === String(category) || p.category_name === category);
      }

      if (tags) {
        const tagList = tags.split(",").map((t) => t.trim().toLowerCase());
        items = items.filter((p) => Array.isArray(p.tags) && tagList.some((t) => p.tags.map((x) => String(x).toLowerCase()).includes(t)));
      }

      if (license) {
        items = items.filter((p) => (p.license_type || p.license) === license);
      }

      if (hasDemo === "true") {
        items = items.filter((p) => Boolean(p.demo_url));
      }

      if (sort === "downloads") {
        items.sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
      } else if (sort === "stars") {
        items.sort((a, b) => (b.star_count || 0) - (a.star_count || 0));
      } else if (sort === "health") {
        items.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
      } else if (sort === "price_asc") {
        items.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      } else if (sort === "price_desc") {
        items.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      } else if (sort === "newest") {
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      }

      return res.status(200).json({
        total: items.length,
        items
      });
    } catch (e) {
      console.error("Projects GET error:", e);
      return res.status(500).json({ error: "Lỗi truy xuất danh sách dự án: " + e.message });
    }
  }

  // 2. POST: Thêm mới hoặc cập nhật dự án vào CSDL dùng chung
  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (err) { body = {}; }
      }

      const projectData = body.project || body;
      if (!projectData.title) {
        return res.status(400).json({ error: "Thiếu tiêu đề dự án (title)." });
      }

      if (!projectData.id) {
        projectData.id = "p-custom-" + Date.now();
      }
      if (!projectData.slug) {
        projectData.slug = String(projectData.title)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") + "-" + Date.now().toString().slice(-4);
      }

      const saved = await db.saveProject(projectData);
      return res.status(200).json({
        success: true,
        project: saved
      });
    } catch (e) {
      console.error("Projects POST error:", e);
      return res.status(500).json({ error: "Lỗi lưu dự án: " + e.message });
    }
  }

  // 3. DELETE: Xóa dự án khỏi CSDL dùng chung (mọi tài khoản đều không thấy nữa)
  if (req.method === "DELETE") {
    try {
      let body = req.body || {};
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (err) { body = {}; }
      }
      let pathId = "";
      const pathParts = (req.url || "").split("?")[0].split("/");
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart !== "projects" && lastPart !== "projects.js") {
        pathId = decodeURIComponent(lastPart);
      }
      const id = req.query?.id || body.id || pathId;
      const slug = req.query?.slug || body.slug || (pathId.includes("-") ? pathId : null);

      if (!id && !slug) {
        return res.status(400).json({ error: "Vui lòng cung cấp id hoặc slug dự án cần xóa." });
      }

      await db.deleteProject(id, slug);
      return res.status(200).json({
        success: true,
        message: "Đã xóa dự án thành công khỏi hệ thống chung.",
        deleted: id || slug
      });
    } catch (e) {
      console.error("Projects DELETE error:", e);
      return res.status(500).json({ error: "Lỗi xóa dự án: " + e.message });
    }
  }

  return res.status(405).json({ error: "Phương thức không được hỗ trợ" });
};
