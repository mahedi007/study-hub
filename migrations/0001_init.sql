-- Study Hub schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  handle        TEXT UNIQUE,
  role          TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  quota_bytes   INTEGER NOT NULL DEFAULT 0,      -- 0 = unlimited
  password_hash TEXT,
  google_sub    TEXT UNIQUE,
  session_version INTEGER NOT NULL DEFAULT 1,
  bio           TEXT NOT NULL DEFAULT '',
  avatar_asset  TEXT,
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS materials (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL,          -- pdf | doc | slides | sheet | audio | video | image | html | embed | note | file
  icon          TEXT NOT NULL DEFAULT '',
  audio_file    TEXT,                   -- optional lecture audio stored at _audio/<name> inside the material folder
  file_name     TEXT,                   -- main file path inside the material folder
  entry_path    TEXT,                   -- html bundle entry (e.g. index.html)
  mime          TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  file_count    INTEGER NOT NULL DEFAULT 0,
  embed_url     TEXT,
  body_md       TEXT,
  subject       TEXT NOT NULL DEFAULT '',
  class_level   TEXT NOT NULL DEFAULT '',
  tags          TEXT NOT NULL DEFAULT '[]',
  cover_asset   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'unlisted', 'published')),
  allow_download INTEGER NOT NULL DEFAULT 1,
  view_count    INTEGER NOT NULL DEFAULT 0,
  ready         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_owner ON materials(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_asset TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'unlisted', 'published')),
  view_count  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  material_id   TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  section       TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_items_material ON collection_items(material_id);

CREATE TABLE IF NOT EXISTS share_links (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  owner_id       TEXT NOT NULL REFERENCES users(id),
  target_type    TEXT NOT NULL CHECK (target_type IN ('material', 'collection', 'page')),
  target_id      TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  passcode_hash  TEXT,
  expires_at     INTEGER,
  active         INTEGER NOT NULL DEFAULT 1,
  allow_download INTEGER,               -- NULL = inherit from material
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_owner ON share_links(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_target ON share_links(target_type, target_id);

CREATE TABLE IF NOT EXISTS page_designs (
  owner_id       TEXT PRIMARY KEY REFERENCES users(id),
  draft_json     TEXT NOT NULL,
  published_json TEXT,
  updated_at     INTEGER NOT NULL,
  published_at   INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  mime       TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body_md    TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_owner ON announcements(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_views (
  owner_id TEXT NOT NULL,
  day      TEXT NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, day)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,
  actor_email TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  meta       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

-- One-time links for invitations and password resets (only the SHA-256 of the token is stored)
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Brute-force protection for password sign-in
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  updated_at   INTEGER NOT NULL
);
