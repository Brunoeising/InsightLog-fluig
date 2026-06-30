/*
# Adicao de coluna in_analysis_count em environment_analyses

## Objetivo
Adicionar suporte ao novo status "EM_ANALISE" da Matriz de Portabilidade do Fluig.
Este status representa itens cujas homologacoes estao em andamento pela TOTVS (ex: Windows Server 2025,
Nginx 1.24/1.26/1.28). A coluna rastreia quantos itens do inventario estao neste estado.

## Mudancas

### Tabela: environment_analyses
- Adicao da coluna `in_analysis_count` (integer, default 0): contador de itens com status EM_ANALISE.
  Complementa os campos existentes `non_homologated_count` e `attention_count` para dar visibilidade
  granular sobre itens em analise pela fabricante, distintos de itens em validacao interna.

### Sem mudancas em RLS
As politicas RLS existentes na tabela ja cobrem a nova coluna — nenhuma alteracao necessaria.

## Notas
- Idempotente: usa DO $$ IF NOT EXISTS para nao falhar se a coluna ja existir.
- Valores historicos ficam em 0 (default), o que e correto pois analises anteriores
  nao tinham essa categoria.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'environment_analyses'
      AND column_name = 'in_analysis_count'
  ) THEN
    ALTER TABLE environment_analyses
      ADD COLUMN in_analysis_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;
