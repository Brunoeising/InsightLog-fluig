/*
  # Add file storage columns to log_analyses

  1. Changes
    - Add `file_path` column to `log_analyses` table
    - Add `file_url` column to `log_analyses` table
    
  2. Notes
    - These columns are required for storing file location information
    - Both columns are nullable since they might not be needed for all analyses
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'log_analyses' AND column_name = 'file_path'
  ) THEN
    ALTER TABLE log_analyses ADD COLUMN file_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'log_analyses' AND column_name = 'file_url'
  ) THEN
    ALTER TABLE log_analyses ADD COLUMN file_url text;
  END IF;
END $$;