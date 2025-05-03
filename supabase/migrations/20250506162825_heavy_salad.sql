/*
  # Add color support for error categories

  1. Changes
    - Add color column to error_categories and default_error_categories
    - Update default categories with predefined colors
    
  2. Notes
    - Colors are stored as HSL values to match the theme system
    - Default colors match the existing chart colors
*/

-- Add color column to tables
ALTER TABLE error_categories 
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'hsl(var(--muted))';

ALTER TABLE default_error_categories 
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'hsl(var(--muted))';

-- Update default categories with colors
UPDATE default_error_categories 
SET color = CASE name
  WHEN 'DATABASE' THEN 'hsl(var(--chart-1))'
  WHEN 'PERMISSION' THEN 'hsl(var(--chart-2))'
  WHEN 'WORKFLOW' THEN 'hsl(var(--chart-3))'
  WHEN 'PERFORMANCE' THEN 'hsl(var(--chart-4))'
  WHEN 'NETWORK' THEN 'hsl(var(--chart-5))'
  WHEN 'INFRASTRUCTURE' THEN 'hsl(var(--chart-6))'
  ELSE 'hsl(var(--muted))'
END;

-- Update existing categories for all users
UPDATE error_categories e
SET color = d.color
FROM default_error_categories d
WHERE e.name = d.name AND e.is_default = true;