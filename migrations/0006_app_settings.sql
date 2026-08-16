-- SLGRVTRS D1 App Settings -- Migration 0006
-- Key-value store for application settings (export password hash, etc.)
--
-- Apply: npx wrangler d1 execute slgrvtrs-voters --remote --file=./migrations/0006_app_settings.sql
-- Verify: npx wrangler d1 execute slgrvtrs-voters --remote --command="SELECT * FROM app_settings"

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed: empty password hash indicates password not yet set
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('export_password_hash', '');