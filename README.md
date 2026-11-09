# 📦 NexaPanel & OpenHub v2.0 — E-commerce Admin & Developer Hub Dashboard

Hệ thống lưu trữ, chia sẻ dự án mã nguồn mở & bảng điều khiển thương mại điện tử chuyên nghiệp (Production-Ready), kết hợp **Zero-Friction Public Retrieval** (tải tự do không bắt buộc đăng nhập), **IAM / Authentication & 2FA**, **Worker Quét An Toàn 4 Tầng**, **Cân Bằng Đa Thiết Bị PC & Mobile**, và **Giao Diện NexaPanel Dark Neon Đẳng Cấp**.

---

## 🏗️ Cấu Trúc 5 Mô-đun Bàn Giao

1. **[schema.sql](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/schema.sql)**, **[components/StatsCard.tsx](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/components/StatsCard.tsx)**, **[components/AdaptiveAppShell.tsx](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/components/AdaptiveAppShell.tsx)** & **[components/MotionPrimitives.tsx](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/components/MotionPrimitives.tsx)**:
   - Lược đồ PostgreSQL 16 gồm **14 bảng chuẩn hóa** (`users`, `oauth_accounts`, `user_sessions`, `verification_tokens`, `personal_access_tokens`, `categories`, `tags`, `project_tags`, `projects`, `project_versions`, `project_files`, `project_stars_watches`, `project_reviews`, `project_issues_comments`, `collections_bundles`, `analytics_daily_rollups`, `download_logs`, `abuse_reports`, `audit_logs`) kèm chỉ mục GIN Full-Text Search & B-Tree.
   - Bộ Component chuẩn hóa: `StatsCard.tsx` (thẻ KPI với hộp icon màu và wavy sparkline), `AdaptiveAppShell.tsx` (khung bố cục tự biến hình PC ↔ Điện thoại) và `MotionPrimitives.tsx` (`MOTION_SPRINGS`, `AnimatedCounter`, `SpotlightGlassCard`, `MorphingDownloadButton`, `MorphingCopyButton`).
2. **[core.js](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/core.js)** & **[server.js](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/server.js)**:
   - Động cơ xử lý trung tâm (`OpenHubPlatform`, `SecurityScannerWorker`, `DualBucketObjectStorage`, `TwoTierTokenBucketRateLimiter`, `detectDeviceProfile`, `createCrossDeviceHandoff`, `resolveCrossDeviceHandoff`) và máy chủ RESTful API (`/api/v1/*`) chạy độc lập bằng thư viện chuẩn Node.js (0 dependency ngoài).
3. **[index.html](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/index.html)**, **[app.css](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/app.css)** & **[app.js](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/app.js)**:
   - **Giao Diện Dashboard Chuẩn NexaPanel Dark Neon**:
     - **Thanh bên (Sidebar)**: Logo tím NexaPanel, nút `Dashboard` gradient tím neon phát sáng (`linear-gradient(90deg, #6366F1, #8B5CF6)`), menu đa dạng kèm huy hiệu số lượng (`Orders` 12, `Email` 8, `Chat` 3, `Products`, `Customers`, `Analytics`, `Marketing`, `Finance`, `Inventory`, `Settings`, `Help Center`, `Logout`).
     - **Thanh tiêu đề (Header)**: Ô tìm kiếm bo tròn `Search products, orders, customers... (Ctrl + K)`, nút đổi giao diện mặt trăng, chuông thông báo có huy hiệu đỏ `5`, chọn ngôn ngữ `English`, widget người dùng `Jisan Ahmed` (Admin) với chấm xanh trực tuyến.
     - **Biểu ngữ chào mừng (Hero Banner)**: Lời chào `Good Morning, Jisan Ahmed 👋`, nhãn `📅 Oct 20, 2025` và `🟢 Live Store`, cùng thẻ trích dẫn truyền cảm hứng gradient tím hồng `"Small steps every day lead to big results."` kèm hình ảnh túi mua sắm / hộp quà 3D.
     - **4 Thẻ KPI Đẳng Cấp**:
       - `Total Orders`: Hộp icon tím 🛒, giá trị `2,847`, xu hướng `+ 12.5% vs last 7 days`, đường sparkline tím neon.
       - `Total Customers`: Hộp icon xanh lục 👥, giá trị `1,936`, xu hướng `+ 8.3% vs last 7 days`, đường sparkline xanh ngọc.
       - `Total Revenue`: Hộp icon xanh dương 💳, giá trị `$25,842`, xu hướng `+ 15.6% vs last 7 days`, đường sparkline cyan.
       - `Pending Orders`: Hộp icon cam 📦, giá trị `12`, xu hướng `- 25.0% vs last 7 days`, đường sparkline cam.
     - **Biểu đồ Sales Overview (2/3)**: Đường cong tím neon mềm mại `#8B5CF6`, vùng tô gradient tím trong suốt, các chấm dữ liệu phát sáng, thẻ tooltip động (`Oct 20, 2025 · $6,428`), bộ lọc `7 Days` / `30 Days` / `90 Days`, và 4 chỉ số tóm tắt (Total Sales, Total Orders, Average Order Value, Conversion Rate).
     - **Khối bên phải (1/3)**:
       - `Top Customers`: Danh sách 5 khách hàng hàng đầu (Rafsan Ahmed, Nusrat Jahan, Fahim Islam, Mehedi Hasan, Tania Akter) với huy hiệu thứ hạng màu sắc và số tiền chi tiêu.
       - `Recent Activities`: Dòng thời gian 5 hoạt động gần đây với các biểu tượng tròn phân màu (đơn hàng mới, đăng ký mới, thanh toán Stripe, cảnh báo kho, hoàn tiền).
     - **Khối dưới cùng**:
       - `Top Selling Products`: Bảng sản phẩm bán chạy (Tai nghe không dây, Đồng hồ thông minh, Giày chạy bộ, Chuột gaming) với trạng thái `In Stock` / `Low Stock`.
       - `Revenue Breakdown`: Biểu đồ Donut phân bổ doanh thu với văn bản trung tâm `$25.8K Total Revenue` và chú thích các ngành hàng.
   - **Đồng Bộ Giao Diện Đẹp Mắt Cho Toàn Bộ Các Phần Khác**:
     - **Khám phá (Explore)**: Thẻ dự án phát sáng khi rê chuột, huy hiệu danh mục, điểm sức khỏe, chip công nghệ, số sao và nút thêm vào giỏ.
     - **Chi tiết dự án (Detail)**: Nút tải 1 chạm gradient tím, xem trước README Markdown, cây thư mục tương tác, xem mã nguồn, so sánh phiên bản Diff, đánh giá và thảo luận.
     - **Tài khoản & Bảo mật (IAM)**: Form đăng ký/đăng nhập hiện đại, đo độ mạnh mật khẩu 4 vạch, 6 ô nhập mã OTP xác thực, cấu hình 2FA TOTP và thu hồi phiên từ xa.
     - **Hồ sơ lập trình viên (Portfolio)**: Biểu đồ nhiệt đóng góp 365 ngày màu xanh neon, huy hiệu danh hiệu, thống kê uy tín và dự án tiêu biểu.
     - **Thuật sĩ đăng tải (Upload Wizard)**: 4 bước trực quan, tự động dọn rác và quét mã độc.
     - **Kiểm duyệt (Admin)**: Quản lý trạng thái, cầu chì Auto-Quarantine và nhật ký kiểm toán.
   - **Cân Bằng Hoàn Hảo Trên Cả PC và Điện Thoại (`CD-01` → `CD-12`)**:
     - Trên PC: Bố cục lưới đa cột rộng rãi, thanh bên cố định, biểu đồ và bảng dữ liệu hiển thị đầy đủ, hiệu ứng hover mượt mà (`@media (hover: hover)`).
     - Trên Điện thoại (< 768px): Khóa tràn ngang tuyệt đối (`overflow-x: clip`, `max-width: 100vw`), thanh bên chuyển thành ngăn kéo trượt (Drawer), thanh điều hướng đáy 5 mục cố định (`mobileBottomNav`), thẻ KPI co giãn lưới 2x2 cân đối, biểu đồ hỗ trợ chạm kéo ngang (Touch Scrubbing), bảng chuyển thành thẻ xếp chồng (`.mobile-stacked-cards`), tôn trọng vùng an toàn (`env(safe-area-inset-bottom)`), cỡ chữ ô nhập `>= 16px` chống zoom Safari.
4. **[test_system.js](file:///c:/Users/KaigeGM/Documents/chia-se-du-an/test_system.js)**:
   - Bộ kiểm thử tự động xác minh toàn bộ **10 Luồng Nghiệp Vụ**, **15 Trường Hợp Biên (`EC-01` → `EC-15`)**, **12 Tiêu Chí Đa Thiết Bị (`CD-01` → `CD-12`)** và **Giao Diện Dashboard NexaPanel Dark Neon**.

---

## 🚀 Hướng Dẫn Chạy Nhanh

### 1. Chạy bộ kiểm thử tự động
```bash
node test_system.js
```

### 2. Khởi chạy máy chủ Web & REST API
```bash
node server.js
```
Sau đó mở trình duyệt tại địa chỉ: `http://localhost:8080`
