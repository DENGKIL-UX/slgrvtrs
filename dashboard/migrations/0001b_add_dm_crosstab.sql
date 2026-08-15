-- Add gender×race cross-tab columns required by frontend DM filter
-- These fields allow server-side demographic sub-count queries
-- without client-side computation.

ALTER TABLE dms ADD COLUMN male_malay    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_chinese  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_indian   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN male_other    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_malay    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_chinese  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_indian   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dms ADD COLUMN female_other    INTEGER NOT NULL DEFAULT 0;

-- Index for DUN-based DM queries (used by drill-down filtering)
CREATE INDEX IF NOT EXISTS idx_dms_dun_prefix ON dms(dun_prefix);

-- Index for Parliament-based DM queries
CREATE INDEX IF NOT EXISTS idx_dms_parlimen_prefix ON dms(voter_prefix);
