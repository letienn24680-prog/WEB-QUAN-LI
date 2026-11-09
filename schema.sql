-- =============================================================================
-- OPENHUB v2.0 - HỆ THỐNG LƯU TRỮ, CHIA SẺ DỰ ÁN, TÀI KHOẢN & SIÊU DASHBOARD
-- Mô-đun 1: Cơ sở dữ liệu PostgreSQL Chuẩn hóa (Đầy đủ 14 Bảng, GIN/B-Tree Index)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. KHỞI TẠO CÁC KIỂU ENUM CHUẨN HÓA
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'creator', 'contributor', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'pending', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE oauth_provider AS ENUM ('github', 'google', 'gitlab', 'discord');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_token_type AS ENUM ('email_otp', 'magic_link', 'password_reset', '2fa_backup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_visibility AS ENUM ('draft', 'pending_scan', 'published', 'unlisted', 'quarantined', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE version_scan_status AS ENUM ('queued', 'scanning', 'clean', 'flagged', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE watch_level_enum AS ENUM ('none', 'releases_only', 'all_activity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tested_os_enum AS ENUM ('windows', 'macos', 'linux', 'docker');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE issue_type_enum AS ENUM ('question', 'setup_error', 'bug', 'suggestion', 'general_comment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE issue_status_enum AS ENUM ('open', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE download_type_enum AS ENUM ('full_archive', 'single_file', 'subfolder', 'bundle_cart', 'cli_clone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_reason_enum AS ENUM ('malware', 'broken_archive', 'copyright', 'leaked_secret', 'spam');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status_enum AS ENUM ('open', 'investigating', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- BẢNG 1: users (Tài khoản, Hồ sơ năng lực Portfolio, Bảo mật 2FA & Điểm uy tín)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  avatar_url TEXT,
  cover_url TEXT,
  bio TEXT DEFAULT '',
  skills_array TEXT[] NOT NULL DEFAULT '{}',
  social_links_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  role user_role NOT NULL DEFAULT 'creator',
  email_verified_at TIMESTAMPTZ,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret_enc TEXT,
  reputation_points INT NOT NULL DEFAULT 0,
  status user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_username ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email));

-- =============================================================================
-- BẢNG 2: oauth_accounts (Liên kết Đăng nhập 1 chạm GitHub, Google, GitLab, Discord)
-- =============================================================================
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider oauth_provider NOT NULL,
  provider_account_id VARCHAR(128) NOT NULL,
  access_token_enc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_oauth_provider_account UNIQUE (provider, provider_account_id)
);

-- =============================================================================
-- BẢNG 3: user_sessions (Quản lý Thiết bị đăng nhập & Xoay vòng Refresh Token)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  device_name VARCHAR(120) NOT NULL DEFAULT 'Desktop Web',
  os_name VARCHAR(64) NOT NULL DEFAULT 'Windows',
  browser_name VARCHAR(64) NOT NULL DEFAULT 'Chrome',
  ip_address INET,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_revoked ON user_sessions (user_id, is_revoked);

-- =============================================================================
-- BẢNG 4: verification_tokens (Xác thực Email Kép OTP 6 số + Magic Link, Reset Password & 2FA)
-- =============================================================================
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token_type verification_token_type NOT NULL,
  otp_code_hash CHAR(64),
  token_hash CHAR(64),
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count <= 5),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_lookup ON verification_tokens (email, token_type, consumed_at);

-- =============================================================================
-- BẢNG 5: personal_access_tokens (Khóa truy cập API cá nhân cho CLI & CI/CD)
-- =============================================================================
CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  token_prefix VARCHAR(12) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{read:projects}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- BẢNG 6: categories, tags & project_tags (Danh mục & Thẻ công nghệ)
-- =============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  icon_name VARCHAR(32) NOT NULL DEFAULT '📦',
  project_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  slug VARCHAR(64) NOT NULL UNIQUE,
  color_hex VARCHAR(16) NOT NULL DEFAULT '#6366F1'
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags (slug);

-- =============================================================================
-- BẢNG 7: projects (Bảng trung tâm quản lý Dự án, Điểm sức khỏe Health Score & Thống kê)
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug VARCHAR(140) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  short_description VARCHAR(500) NOT NULL,
  readme_markdown TEXT NOT NULL DEFAULT '',
  readme_content TEXT NOT NULL DEFAULT '',
  quick_start_guide TEXT NOT NULL DEFAULT '',
  env_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id INT NOT NULL DEFAULT 1,
  license_spdx VARCHAR(40) NOT NULL DEFAULT 'MIT',
  license_type VARCHAR(40) NOT NULL DEFAULT 'MIT',
  live_demo_url TEXT,
  demo_url TEXT,
  source_repo_url TEXT,
  screenshots_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  health_score SMALLINT NOT NULL DEFAULT 0 CHECK (health_score >= 0 AND health_score <= 100),
  visibility_status project_visibility NOT NULL DEFAULT 'draft',
  latest_version_id UUID,
  download_count BIGINT NOT NULL DEFAULT 0,
  view_count BIGINT NOT NULL DEFAULT 0,
  star_count INT NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  rating_count INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  quarantine_threshold INT NOT NULL DEFAULT 5,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_project_tags_tag_id ON project_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);
CREATE INDEX IF NOT EXISTS idx_projects_visibility_category ON projects (visibility_status, category_id, created_at DESC, download_count DESC);

-- Chỉ mục GIN phục vụ Tìm kiếm toàn văn (Full-Text Search)
CREATE INDEX IF NOT EXISTS idx_projects_fts_gin ON projects USING GIN (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(readme_markdown, ''))
);

-- =============================================================================
-- BẢNG 8: project_versions (Phiên bản phát hành, Cây thư mục JSONB & Phụ thuộc)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number VARCHAR(32) NOT NULL,
  release_title VARCHAR(120) NOT NULL DEFAULT '',
  changelog_markdown TEXT NOT NULL DEFAULT '',
  changelog TEXT NOT NULL DEFAULT '',
  archive_storage_key TEXT NOT NULL,
  archive_size_bytes BIGINT NOT NULL CHECK (archive_size_bytes > 0),
  uncompressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  file_count INT NOT NULL DEFAULT 0,
  sha256_checksum CHAR(64) NOT NULL,
  file_tree_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  scan_status version_scan_status NOT NULL DEFAULT 'queued',
  scan_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_latest BOOLEAN NOT NULL DEFAULT FALSE,
  download_count BIGINT NOT NULL DEFAULT 0,
  purge_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_version_number UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_latest ON project_versions (project_id, is_latest);

DO $$ BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT fk_projects_latest_version
    FOREIGN KEY (latest_version_id) REFERENCES project_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- BẢNG 9: project_files (Tệp tin mã nguồn chi tiết trong từng phiên bản)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  extension VARCHAR(32) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  line_count INT NOT NULL DEFAULT 0,
  is_binary BOOLEAN NOT NULL DEFAULT FALSE,
  storage_key TEXT NOT NULL,
  text_content TEXT,
  content_preview TEXT,
  sha256_hash CHAR(64),
  CONSTRAINT uq_version_relative_path UNIQUE (version_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_project_files_version_path ON project_files (version_id, relative_path);

-- =============================================================================
-- BẢNG 10: project_stars_watches (Thả sao & Theo dõi nhận thông báo Release mới)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_stars_watches (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_starred BOOLEAN NOT NULL DEFAULT TRUE,
  watch_level watch_level_enum NOT NULL DEFAULT 'releases_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

-- =============================================================================
-- BẢNG 11: project_reviews (Đánh giá Đa tiêu chí & Xác nhận Đã chạy thử thành công)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
  rating_overall SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_code_quality SMALLINT NOT NULL DEFAULT 5 CHECK (rating_code_quality BETWEEN 1 AND 5),
  rating_docs SMALLINT NOT NULL DEFAULT 5 CHECK (rating_docs BETWEEN 1 AND 5),
  rating_setup SMALLINT NOT NULL DEFAULT 5 CHECK (rating_setup BETWEEN 1 AND 5),
  tested_os tested_os_enum NOT NULL DEFAULT 'windows',
  works_as_expected BOOLEAN NOT NULL DEFAULT TRUE,
  comment_text TEXT NOT NULL DEFAULT '',
  helpful_votes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_review_per_user UNIQUE (project_id, user_id)
);

-- =============================================================================
-- BẢNG 12: project_issues_comments (Hỏi đáp Cài đặt, Báo lỗi Bug & Thảo luận phân cấp)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_issues_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES project_issues_comments(id) ON DELETE CASCADE,
  issue_type issue_type_enum NOT NULL DEFAULT 'question',
  title VARCHAR(200) NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL,
  status issue_status_enum NOT NULL DEFAULT 'open',
  is_pinned_answer BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- BẢNG 13: collections_bundles (Giỏ Dự Án — Tải Hàng Loạt & Chia sẻ Bộ sưu tập)
-- =============================================================================
CREATE TABLE IF NOT EXISTS collections_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  share_code VARCHAR(24) NOT NULL UNIQUE,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  project_ids_array UUID[] NOT NULL DEFAULT '{}',
  download_bundle_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- BẢNG 14: analytics_daily_rollups, download_logs, abuse_reports & audit_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS analytics_daily_rollups (
  date_day DATE NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  views_count BIGINT NOT NULL DEFAULT 0,
  unique_visitors BIGINT NOT NULL DEFAULT 0,
  downloads_full BIGINT NOT NULL DEFAULT 0,
  downloads_single_file BIGINT NOT NULL DEFAULT 0,
  bandwidth_bytes BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (date_day, project_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_project_date ON analytics_daily_rollups (project_id, date_day DESC);

CREATE TABLE IF NOT EXISTS download_logs (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  download_type download_type_enum NOT NULL DEFAULT 'full_archive',
  ip_hash CHAR(64) NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_logs_dedup ON download_logs (project_id, version_id, ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reporter_ip_hash CHAR(64) NOT NULL,
  reason_category report_reason_enum NOT NULL,
  description TEXT NOT NULL,
  status report_status_enum NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_abuse_report_per_ip UNIQUE (project_id, reporter_ip_hash)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action_type VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL DEFAULT 'project',
  target_id UUID,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HÀM GIAO DỊCH NGUYÊN TỬ CHUYỂN ĐỔI PHIÊN BẢN MỚI NHẤT (Zero-Downtime Release)
CREATE OR REPLACE FUNCTION switch_project_latest_version(
  p_project_id UUID,
  p_new_version_id UUID,
  p_new_readme TEXT
) RETURNS VOID AS $$
DECLARE
  v_scan_status version_scan_status;
BEGIN
  SELECT scan_status INTO v_scan_status
  FROM project_versions
  WHERE id = p_new_version_id AND project_id = p_project_id;

  IF v_scan_status IS DISTINCT FROM 'clean' THEN
    RAISE EXCEPTION 'Phiên bản chưa vượt qua bước quét an toàn (scan_status = %)', v_scan_status;
  END IF;

  UPDATE project_versions
  SET is_latest = FALSE
  WHERE project_id = p_project_id AND is_latest = TRUE;

  UPDATE project_versions
  SET is_latest = TRUE
  WHERE id = p_new_version_id AND project_id = p_project_id;

  UPDATE projects
  SET latest_version_id = p_new_version_id,
      readme_markdown = COALESCE(p_new_readme, readme_markdown),
      readme_content = COALESCE(p_new_readme, readme_content),
      visibility_status = 'published',
      updated_at = NOW()
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;
