-- Add weight column to error_categories and default_error_categories
-- Moves the CATEGORY_WEIGHT constant from lib/ai-error-context.ts into the DB
-- so category severity ranking can be tuned without redeploying.

ALTER TABLE default_error_categories
  ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 10;

ALTER TABLE error_categories
  ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 10;

-- Populate default weights matching current hardcoded values
UPDATE default_error_categories SET weight = 20 WHERE upper(name) = 'DATABASE';
UPDATE default_error_categories SET weight = 18 WHERE upper(name) = 'PERFORMANCE';
UPDATE default_error_categories SET weight = 16 WHERE upper(name) IN ('BPM', 'INT');
UPDATE default_error_categories SET weight = 14 WHERE upper(name) IN ('INFRASTRUCTURE', 'WCM');
UPDATE default_error_categories SET weight = 12 WHERE upper(name) IN ('ECM', 'FDN', 'WORKFLOW');
UPDATE default_error_categories SET weight = 10 WHERE upper(name) IN ('PERMISSION', 'NETWORK');
UPDATE default_error_categories SET weight = 4  WHERE upper(name) = 'OTHER';
