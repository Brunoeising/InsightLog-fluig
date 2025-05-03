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

-
-- 1. Criar tabela de categorias padrão (independente)
CREATE TABLE IF NOT EXISTS default_error_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  terms text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Inserir categorias padrão (se não existirem)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM default_error_categories LIMIT 1) THEN
    INSERT INTO default_error_categories (name, description, terms) VALUES
      ('DATABASE', 'Problemas relacionados ao banco de dados', ARRAY['sql', 'database', 'db', 'jdbc', 'connection pool', 'deadlock', 'timeout sql', 'ora-', 'pg_', 'mysql', 'mongodb', 'connection refused']),
      ('PERMISSION', 'Problemas de permissão e autorização', ARRAY['permission', 'access', 'unauthorized', 'denied', 'forbidden', 'security', 'authentication', 'authorization', 'role', 'privilege', 'credential']),
      ('WORKFLOW', 'Problemas relacionados ao workflow do Fluig', ARRAY['workflow', 'process', 'fluig', 'bpm', 'task', 'state', 'transition', 'approval', 'step', 'sequence', 'activity']),
      ('PERFORMANCE', 'Problemas de performance e recursos', ARRAY['timeout', 'slow', 'performance', 'memory', 'leak', 'heap', 'gc', 'garbage', 'delay', 'latency', 'throughput', 'cpu', 'load', 'capacity']),
      ('NETWORK', 'Problemas de rede e conectividade', ARRAY['network', 'connection', 'http', 'url', 'uri', 'endpoint', 'api', 'rest', 'soap', 'request', 'response', 'socket', 'tcp', 'dns', 'timeout connect']),
      ('INFRASTRUCTURE', 'Problemas de infraestrutura', ARRAY['disk', 'space', 'storage', 'filesystem', 'mount', 'volume', 'server', 'host', 'node', 'cluster', 'infrastructure', 'hardware']);
  END IF;
END $$;

-- 3. Criar tabela de categorias de usuário
CREATE TABLE IF NOT EXISTS error_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  terms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_custom boolean DEFAULT false,
  original_category_id uuid REFERENCES default_error_categories(id) ON DELETE SET NULL
);

-- 4. Configurar Row Level Security
ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own categories" 
  ON error_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Criar função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

CREATE TRIGGER update_error_categories_updated_at
    BEFORE UPDATE ON error_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


##########################################################

-- 6. Criar função para configurar categorias (executar após a Parte 1)
CREATE OR REPLACE FUNCTION public.setup_user_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.error_categories (
    user_id,
    name,
    description,
    terms,
    original_category_id
  )
  SELECT 
    NEW.id,
    name,
    description,
    terms,
    id
  FROM public.default_error_categories;
  
  RETURN NEW;
END;
$$;

-- 7. Criar trigger (executar por último)
DROP TRIGGER IF EXISTS on_new_user_create_categories ON auth.users;
CREATE TRIGGER on_new_user_create_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.setup_user_categories();


######################################

-- Migração para usuários existentes
DO $$
BEGIN
  INSERT INTO error_categories (
    user_id,
    name,
    description,
    terms,
    original_category_id
  )
  SELECT 
    u.id,
    d.name,
    d.description,
    d.terms,
    d.id
  FROM auth.users u
  CROSS JOIN default_error_categories d
  WHERE NOT EXISTS (
    SELECT 1 
    FROM error_categories e 
    WHERE e.user_id = u.id AND e.original_category_id = d.id
  );
  
  RAISE NOTICE 'Migração concluída para % usuários existentes', (SELECT COUNT(DISTINCT user_id) FROM error_categories);
END $$;



-- Adicionar coluna na tabela de categorias padrão
ALTER TABLE default_error_categories
ADD COLUMN color TEXT NOT NULL DEFAULT 'hsl(var(--muted))';

-- Adicionar coluna na tabela de categorias de usuário
ALTER TABLE error_categories
ADD COLUMN color TEXT DEFAULT 'hsl(var(--muted))';


-- Atualizar cores das categorias padrão
UPDATE default_error_categories SET
  color = CASE 
    WHEN name = 'DATABASE' THEN 'hsl(var(--chart-1))'
    WHEN name = 'PERMISSION' THEN 'hsl(var(--chart-2))'
    WHEN name = 'WORKFLOW' THEN 'hsl(var(--chart-3))'
    WHEN name = 'PERFORMANCE' THEN 'hsl(var(--chart-4))'
    WHEN name = 'NETWORK' THEN 'hsl(var(--chart-5))'
    WHEN name = 'INFRASTRUCTURE' THEN 'hsl(var(--chart-6))'
    ELSE 'hsl(var(--muted))'
  END;

