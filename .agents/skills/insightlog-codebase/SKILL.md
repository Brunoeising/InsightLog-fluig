---
name: insightlog-codebase
description: "Use when: analisando o projeto InsightLog-fluig, corrigindo bugs, implementando novas funcionalidades, refatorando código, revisando arquitetura, evitando duplicidades. Carrega o mapa completo da base de código antes de qualquer alteração."
argument-hint: "descreva o que deseja implementar ou corrigir"
---

# InsightLog-fluig — Mapa de Codebase e Workflow de Desenvolvimento

## Objetivo

Antes de qualquer alteração, bug fix ou nova feature, carregar este mapa mental do projeto para:
1. Evitar duplicidades e redundâncias
2. Reutilizar serviços e utilitários já existentes
3. Entender dependências cruzadas e riscos de quebra
4. Identificar padrões já estabelecidos no projeto

---

## Arquitetura Geral

| Camada | Localização | Responsabilidade |
|---|---|---|
| Pages/UI | `app/` | Rotas Next.js 15 App Router |
| Components | `components/` | UI reutilizável (custom + shadcn/ui) |
| Services | `lib/` | Lógica de negócio, parsers, clientes |
| API Routes | `app/api/` | Endpoints server-side |
| Workers | `workers/` | Processamento pesado off-thread |
| AI Agents | `lynn-agents/` | Definições dos agentes LYNN |
| Knowledge Base | `lib/installation-kb/` e `lib/portability-matrix/` | Dados de referência |

**Stack**: Next.js 15 · TypeScript · Supabase · Tailwind CSS · shadcn/ui (Radix UI) · LYNN AI

---

## Mapa de Serviços (`lib/`)

### Clientes Supabase — ATENÇÃO: redundância conhecida

| Arquivo | Tipo | Uso correto |
|---|---|---|
| `lib/supabase-client.ts` | **Primário** — tipado com `Database`, auth completo | Usar em TODOS os novos componentes e server actions |
| `lib/supabase.ts` | **Legado** — sem tipos genéricos, fallback hardcoded | NÃO usar em código novo; migrar gradualmente |

> **Bug conhecido**: `lib/supabase.ts` possui fallback `'YOUR_SUPABASE_URL'` em vez de falhar explicitamente. Preferir `lib/supabase-client.ts`.

### Serviços de IA

| Arquivo | Responsabilidade |
|---|---|
| `lib/lynn-service.ts` | Comunicação com a API LYNN (agentes especializados) |
| `lib/ai-client.ts` | Cliente de IA genérico (wraps sobre lynn-service) |
| `lib/ai-error-context.ts` | Contexto de erros para prompts de IA |

**Variáveis de ambiente obrigatórias**: `LYNN_API_URL`, `LYNN_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Parsers e Análise de Logs

| Arquivo | Responsabilidade |
|---|---|
| `lib/log-parser.ts` | Parser principal de logs Fluig |
| `lib/log-parser-chunked.ts` | Parser para arquivos grandes (chunking) |
| `lib/log-categorizer.ts` | Categorização de entradas de log |
| `lib/rule-engine.ts` | Motor de regras para diagnósticos |
| `lib/performance-detector.ts` | Detecção de problemas de performance |
| `lib/sizing-engine.ts` | Engine de sizing de ambiente |
| `workers/log-parser.worker.ts` | Web Worker para parsing off-thread |

> Nunca duplicar lógica de parsing. Extender `log-parser.ts` ou adicionar regras em `rule-engine.ts`.

### Outros Serviços

| Arquivo | Responsabilidade |
|---|---|
| `lib/environment-service.ts` | CRUD de ambientes Fluig |
| `lib/analysis-prefetch-cache.ts` | Cache de análises (prefetch) |
| `lib/types.ts` | Tipos de domínio do negócio |
| `lib/database.types.ts` | Tipos gerados do schema Supabase |
| `lib/utils.ts` | Utilitários gerais (`cn()`, formatações) |

---

## Mapa de Rotas (`app/`)

| Rota | Arquivo | Descrição |
|---|---|---|
| `/` | `app/page.tsx` | Landing/Home |
| `/auth` | `app/auth/page.tsx` | Autenticação |
| `/auth/login` | `app/auth/login/` | Login |
| `/auth/register` | `app/auth/register/` | Cadastro |
| `/analysis/[id]` | `app/analysis/[id]/page.tsx` | Detalhe de análise |
| `/environment/[id]` | `app/environment/[id]/` | Detalhe de ambiente |
| `/environment/new` | `app/environment/new/` | Novo ambiente |
| `/environment/history` | `app/environment/history/` | Histórico de ambientes |
| `/history` | `app/history/page.tsx` | Histórico geral |
| `/installation` | `app/installation/page.tsx` | Guia de instalação |
| `/settings` | `app/settings/page.tsx` | Configurações |

### API Routes

| Rota | Localização | Função |
|---|---|---|
| `/api/ai/analyze` | `app/api/ai/analyze/` | Análise via LYNN |
| `/api/ai/question` | `app/api/ai/question/` | Pergunta ao agente |
| `/api/ai/install-guide` | `app/api/ai/install-guide/` | Guia de instalação |
| `/api/ai/regenerate-summary` | `app/api/ai/regenerate-summary/` | Regenerar resumo |
| `/api/logs/analyze` | `app/api/logs/analyze/` | Upload e análise de log |
| `/api/logs/categories` | `app/api/logs/categories/` | Categorias de log |

---

## Mapa de Componentes (`components/`)

### Componentes Customizados

| Componente | Responsabilidade |
|---|---|
| `app-shell.tsx` | Layout principal autenticado (sidebar + nav) |
| `NavBar.tsx` | Barra de navegação |
| `user-nav.tsx` | Menu do usuário (avatar, logout) |
| `upload-button.tsx` | Botão de upload de logs |
| `ai-chat.tsx` | Interface de chat com IA |
| `ai-response.tsx` | Renderização de resposta da IA |
| `auth-form.tsx` | Formulário de autenticação compartilhado |
| `error-details.tsx` | Exibição detalhada de erros |
| `performance-details.tsx` | Métricas de performance |
| `system-info.tsx` | Informações do sistema/ambiente |
| `how-it-works.tsx` | Seção explicativa (marketing) |
| `theme-provider.tsx` | Provedor de tema (dark/light) |
| `theme-toggle.tsx` | Botão de alternância de tema |

### UI (shadcn/ui)
Todos em `components/ui/`. Não criar componentes que duplicam os existentes. Verificar antes de criar: `button`, `card`, `dialog`, `input`, `badge`, `alert`, `table`, `tabs`, `select`, `form`, `toast`.

---

## Agentes LYNN (`lynn-agents/`)

### Orquestrador
| Arquivo | Função |
|---|---|
| `Logs_fluig.json` | Recebe input do app, roteia para especialistas, consolida JSON de resposta |

### Especialistas (chamados como tools pelo orquestrador)

| Arquivo | Nome da tool | Especialidade |
|---|---|---|
| `fluig_log_parsing_specialist.json` | `estruturacao_logs` | Normalização de log bruto WildFly/JBoss, separação de threads, extração de exception raiz |
| `fluig_error_classification_specialist.json` | `categorazacao_erros_comuns` | Classificação por BPM/WCM/ECM/FDN/INT/DATABASE/INFRASTRUCTURE/SECURITY com dicionário Fluig |
| `fluig_database_diagnostics_specialist.json` | `Especialista-banco-de-dados-fluig` | Deadlock, pool, anti-padrão FluigDS/FluigDSRO, queries de diagnóstico Oracle/SQL Server/MySQL |
| `fluig_integration_diagnostics_specialist.json` | `Especialista-em-integracao` | REST/SOAP, OAuth, TLS, impersonation, Protheus/RM/Datasul |
| `fluig_performance_diagnostics_specialist.json` | `Especialista-em-analise-de-performance` | JSChronos, thread dumps, GC, heap, cenários de uso (9 scenarios mapeados) |

### Regras de roteamento (resumo)
- **Log bagunçado/intercalado** → `estruturacao_logs` primeiro, depois `categorazacao_erros_comuns`
- **Exception identificável** → `categorazacao_erros_comuns` direto
- **Lentidão / JSChronos** → `Especialista-em-analise-de-performance`
- **Pool / deadlock / banco** → `Especialista-banco-de-dados-fluig` (+ performance se associado)
- **REST/SOAP/OAuth/TLS** → `Especialista-em-integracao`
- **Múltiplas camadas** → especialistas em paralelo, consolidar em `specialists[]` separados

### Estrutura JSON de resposta (campos obrigatórios)
```json
{
  "format_version": "1.0",
  "has_question": false,
  "question": null,
  "message": "Resumo do diagnóstico.",
  "specialists": [{
    "agent": "nome_da_tool",
    "type": "diagnosis|classification|validation|recommendation",
    "summary": "...",
    "findings": [{
      "category": "database|integration|workflow|performance|installation|security|bpm|wcm|ecm|fdn|int|network|infrastructure|permission|other",
      "severity": "critical|high|medium|low",
      "root_cause": "...",
      "evidence": "trecho exato do log",
      "suggested_actions": ["..."],
      "confidence": "high|medium|low",
      "requires_additional_logs": false,
      "scenario": "pagina_inicial|publicacao_documento|visualizacao_documento|inicializacao_processo|abertura_movimentacao|envio_movimentacao|sincronizacao_dataset|connection_pool|jvm_memory|null",
      "observation": null
    }]
  }]
}
```

### Anti-padrão crítico sempre priorizado
`FluigDS` ou `FluigDSRO` em customização de cliente → severity=critical, independente de outros sintomas.

---

## Procedimento: Análise de Bugs

1. **Localizar o sintoma**: identificar em qual camada (UI, API, lib, worker) o bug ocorre
2. **Ler o arquivo afetado** com contexto de ±30 linhas ao redor do problema
3. **Checar dependências**: quem chama este módulo? (`vscode_listCodeUsages`)
4. **Verificar se há lógica duplicada**: o bug pode estar em `supabase.ts` vs `supabase-client.ts`, em `log-parser.ts` vs `log-parser-chunked.ts`, etc.
5. **Corrigir na camada correta**: não criar workarounds em UI se o bug é no service
6. **Verificar tipos**: rodar `tsc --noEmit` após qualquer alteração de tipos
7. **Checar erros compilação**: usar `get_errors` para validar

### Bugs Conhecidos e Dívidas Técnicas

| Item | Local | Descrição |
|---|---|---|
| Dual Supabase client | `lib/supabase.ts` vs `lib/supabase-client.ts` | `supabase.ts` é legado sem tipos; novo código deve usar `supabase-client.ts` |
| Fallback hardcoded | `lib/supabase.ts` linha 6-7 | `'YOUR_SUPABASE_URL'` deve lançar erro explícito como em `supabase-client.ts` |
| Middleware vazio | `middleware.ts` | Nenhuma proteção de rotas por autenticação implementada |
| Fontes duplicadas | `app/layout.tsx` | Google Fonts via `<link>` e `@fontsource/inter` via npm instalados juntos |

---

## Procedimento: Nova Funcionalidade

1. **Definir camada**: UI-only? Precisa de API route? Precisa de novo serviço em `lib/`?
2. **Verificar tipos existentes**: consultar `lib/types.ts` e `lib/database.types.ts` antes de criar novos
3. **Verificar componentes existentes**: checar `components/` e `components/ui/` antes de criar
4. **Verificar serviços existentes**: checar `lib/` antes de criar novo módulo
5. **Padrão de autenticação**: usar `supabase-client.ts` > `getCurrentUser()` para obter usuário autenticado
6. **Padrão de API route**: seguir estrutura de `app/api/logs/shared.ts` para lógica compartilhada entre routes
7. **Worker para processamento pesado**: se processar arquivo grande, usar ou extender `workers/log-parser.worker.ts`
8. **Adicionar tipos ao `lib/types.ts`** se criar novos modelos de domínio
9. **Validar com `get_errors`** após implementação

### Convenções de Código

- Imports com alias `@/` (configurado em `tsconfig.json`)
- Componentes React: `export default function NomeComponente()`
- Server Components por padrão; `'use client'` apenas quando necessário (interatividade, hooks)
- Estilos: Tailwind CSS + `cn()` de `lib/utils.ts`
- Toasts: hook `use-toast` de `hooks/use-toast.ts`
- Formulários: react-hook-form + `@hookform/resolvers` + zod

---

## Checklist Antes de Commit

- [ ] `tsc --noEmit` sem erros
- [ ] `next lint` sem warnings novos
- [ ] Nenhum `any` novo adicionado sem justificativa
- [ ] Nenhuma duplicação de serviço/componente existente
- [ ] Variáveis de ambiente documentadas no README se adicionadas
- [ ] `supabase-client.ts` usado em vez de `supabase.ts` para código novo

---

## Schema Supabase — Tabelas Principais

### Core de Análise de Logs

| Tabela | Chave | Descrição |
|---|---|---|
| `log_analyses` | `id uuid PK` | Cabeçalho de cada análise. Colunas: `user_id`, `file_name`, `error_count`, `warning_count`, `summary`, `suggestions[]`, `fluig_version`, `os_name`, `server_type`, `database_name`, `java_version`, `solr_enabled`, `ls_enabled`, `processing_status`, `ai_summary_regenerated_at` |
| `log_errors` | `id uuid PK` | Entradas individuais de erro (modelo legado). `analysis_id FK → log_analyses`, `level`, `message`, `category`, `context_before[]`, `context_after[]`, `suggestion` |
| `log_error_fingerprints` | `id uuid PK` | Fingerprints deduplicados por padrão de erro (modelo atual). `analysis_id FK`, `fingerprint`, `category`, `normalized_message`, `message_sample`, `occurrence_count`, `severity_score`, `caused_by_samples[]`, `context_samples[]`, `first_seen_at`, `last_seen_at`. Índices: `(analysis_id, severity_score DESC)`, `(analysis_id, category)`, full-text search |
| `user_questions` | `id uuid PK` | Perguntas dos usuários ao chat IA. `analysis_id FK`, `question`, `answer` |

### Ambiente e Portabilidade

| Tabela | Chave | Descrição |
|---|---|---|
| `environment_analyses` | `id uuid PK` | Avaliação de ambiente Fluig. `user_id`, `environment_name`, `status`, `compatibility_score`, `risk_count`, `non_homologated_count`, `sizing_status`, `inventory_data jsonb` |
| `environment_items` | `id uuid PK` | Itens coletados do ambiente. `analysis_id FK`, `category`, `field_name`, `collected_value`, `expected_value`, `compatibility_status` (HOMOLOGADO/HOMOLOGADO_RESTRICOES/EM_VALIDACAO/NAO_HOMOLOGADO/NAO_IDENTIFICADO) |
| `sizing_results` | `id uuid PK` | Simulação de sizing. `analysis_id FK`, `registered_users`, `concurrent_users`, `recommended_cpu/ram/disk`, `current_cpu/ram/disk`, `sizing_status` (ADEQUADO/SUBDIMENSIONADO/SUPERDIMENSIONADO) |
| `health_check_results` | `id uuid PK` | Métricas de health check. `analysis_id FK`, `heap_usage`, `cpu_usage`, `disk_usage`, `services_status jsonb`, `ai_interpretation` |
| `audit_logs` | `id uuid PK` | Trilha de auditoria. `user_id`, `action`, `environment_name`, `result_summary` |

### Categorias de Erro

| Tabela | Descrição |
|---|---|
| `default_error_categories` | Categorias padrão do sistema: DATABASE, INTEGRATION, WORKFLOW, PERFORMANCE, BPM, WCM, ECM, FDN, INT, SECURITY, INFRASTRUCTURE, NETWORK, PERMISSION, OTHER |
| `error_categories` | Cópia por usuário das categorias padrão + customizações. `user_id`, `name`, `description`, `terms[]`, `weight`, `is_default` |

### RPCs (Funções PostgreSQL)

| Função | Parâmetros | Retorno |
|---|---|---|
| `get_analysis_inventory(p_analysis_id)` | uuid | Por categoria: `fingerprint_count`, `total_occurrences`, `max_severity`, `avg_severity`, `top_message`, `first_seen`, `last_seen` |
| `list_category_fingerprints(p_analysis_id, p_category, p_limit)` | uuid, text, int | Lista completa de fingerprints de uma categoria com todos os campos |

### Regras de RLS (Row Level Security)
- **Todas as tabelas têm RLS ativo**.
- Política padrão: `user_id = auth.uid()` para tabelas-raiz.
- Tabelas filhas (ex: `log_error_fingerprints`) usam EXISTS subquery para herdar a restrição do pai.
- RPCs com `SECURITY INVOKER` respeitam o RLS do chamador automaticamente.

### Convenções de Schema
- Nunca inserir em `log_errors` para análises novas — usar `log_error_fingerprints` (modelo atual).
- `default_error_categories` é somente leitura pelo app; edição via migration.
- Migrations são idempotentes (INSERT ... WHERE NOT EXISTS, DROP POLICY IF EXISTS).
- Adicionar coluna em `log_analyses` requer atualizar também `lib/database.types.ts`.
