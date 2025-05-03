/*
  # Create error categories table and policies

  1. New Tables
    - error_categories
      - id (uuid, primary key)
      - user_id (uuid, foreign key)
      - name (text)
      - description (text)
      - terms (text array)
      - created_at (timestamp)
      - updated_at (timestamp)
      - is_default (boolean)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create error categories table
CREATE TABLE IF NOT EXISTS error_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  terms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_default boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own categories"
  ON error_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_error_categories_updated_at
    BEFORE UPDATE ON error_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create default categories table
CREATE TABLE IF NOT EXISTS default_error_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  terms text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

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