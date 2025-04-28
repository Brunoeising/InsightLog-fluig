/*
  # Adicionar suporte para warnings

  1. Alterações
    - Adiciona coluna `level` na tabela `log_errors` se não existir
    - Renomeia a tabela para `log_entries` para melhor refletir seu propósito
    - Atualiza as políticas de segurança
*/

-- Primeiro, verificar e adicionar a coluna level se necessário
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'log_errors' AND column_name = 'level'
  ) THEN
    ALTER TABLE log_errors ADD COLUMN level text NOT NULL DEFAULT 'ERROR';
  END IF;
END $$;

-- Renomear a tabela para um nome mais apropriado
ALTER TABLE IF EXISTS log_errors RENAME TO log_entries;

-- Atualizar as políticas existentes para a nova tabela
DROP POLICY IF EXISTS "Users can view errors from own analyses" ON log_entries;
DROP POLICY IF EXISTS "Users can insert errors for own analyses" ON log_entries;

-- Criar novas políticas
CREATE POLICY "Users can view entries from own analyses"
  ON log_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_entries.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert entries for own analyses"
  ON log_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_entries.analysis_id
      AND log_analyses.user_id = auth.uid()
    )
  );