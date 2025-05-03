/*
  # Add default error categories and user customization

  1. New Tables
    - `default_error_categories` - Stores system default categories
    - Add is_default column to error_categories
    
  2. Changes
    - Populate default categories
    - Add function to copy defaults for new users
    
  3. Security
    - Only authenticated users can access
*/

-- Create default categories table
CREATE TABLE IF NOT EXISTS default_error_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  terms text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add is_default column to error_categories
ALTER TABLE error_categories 
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- Insert default categories
INSERT INTO default_error_categories (name, description, terms) VALUES
  (
    'DATABASE',
    'Problemas relacionados ao banco de dados',
    ARRAY['sql', 'database', 'db', 'jdbc', 'connection pool', 'deadlock', 'timeout sql', 'ora-', 'pg_', 'mysql', 'mongodb', 'connection refused']
  ),
  (
    'PERMISSION',
    'Problemas de permissão e autorização',
    ARRAY['permission', 'access', 'unauthorized', 'denied', 'forbidden', 'security', 'authentication', 'authorization', 'role', 'privilege', 'credential']
  ),
  (
    'WORKFLOW',
    'Problemas relacionados ao workflow do Fluig',
    ARRAY['workflow', 'process', 'fluig', 'bpm', 'task', 'state', 'transition', 'approval', 'step', 'sequence', 'activity']
  ),
  (
    'PERFORMANCE',
    'Problemas de performance e recursos',
    ARRAY['timeout', 'slow', 'performance', 'memory', 'leak', 'heap', 'gc', 'garbage', 'delay', 'latency', 'throughput', 'cpu', 'load', 'capacity']
  ),
  (
    'NETWORK',
    'Problemas de rede e conectividade',
    ARRAY['network', 'connection', 'http', 'url', 'uri', 'endpoint', 'api', 'rest', 'soap', 'request', 'response', 'socket', 'tcp', 'dns', 'timeout connect']
  ),
  (
    'INFRASTRUCTURE',
    'Problemas de infraestrutura',
    ARRAY['disk', 'space', 'storage', 'filesystem', 'mount', 'volume', 'server', 'host', 'node', 'cluster', 'infrastructure', 'hardware']
  );

-- Function to copy default categories for new users
CREATE OR REPLACE FUNCTION copy_default_categories_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO error_categories (
    name,
    description,
    terms,
    user_id,
    is_default
  )
  SELECT 
    name,
    description,
    terms,
    NEW.id,
    true
  FROM default_error_categories;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to copy defaults for new users
DROP TRIGGER IF EXISTS copy_defaults_for_new_user ON auth.users;
CREATE TRIGGER copy_defaults_for_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION copy_default_categories_for_user();

-- Copy defaults for existing users
INSERT INTO error_categories (
  name,
  description,
  terms,
  user_id,
  is_default
)
SELECT 
  d.name,
  d.description,
  d.terms,
  u.id,
  true
FROM auth.users u
CROSS JOIN default_error_categories d
WHERE NOT EXISTS (
  SELECT 1 
  FROM error_categories e 
  WHERE e.user_id = u.id AND e.is_default = true
);