# Agentes Lynn — InsightLog

Estes 6 JSONs seguem o schema oficial `0.0.1-alpha` do Lynn (envelope `info` + `flow.nodes` + `tools`). Aplique-os no console do Lynn na ordem abaixo — as ferramentas do orquestrador referenciam os especialistas pelo `name`, então os especialistas precisam existir antes.

## Estrutura (5 especialistas + 1 orquestrador)

**Especialistas (temperatura 1, tools=[] exceto performance):**

1. `fluig_log_parsing_specialist.json` (`estruturacao_logs`) — normaliza log bruto, separa threads intercaladas, identifica exception raiz vs wrappers.
2. `fluig_error_classification_specialist.json` (`categorazacao_erros_comuns`) — categoriza erros contra um dicionário curado (WorkflowEngine, CustomizationManager, FDNAccessDeniedException, ClassNotFoundException, HttpHostConnectException, FileTransferProcessorUtil, SOAPFaultException, etc.).
3. `fluig_database_diagnostics_specialist.json` (`Especialista-banco-de-dados-fluig`) — Oracle/SQL Server/MySQL, deadlocks, pool de conexão (min 10, max 50-200), anti-padrão FluigDS/FluigDSRO em customização.
4. `fluig_integration_diagnostics_specialist.json` (`Especialista-em-integracao`) — REST/SOAP, OAuth, impersonation, TLS/cacerts, SOAPFaultException.
5. `fluig_performance_diagnostics_specialist.json` (`Especialista-em-analise-de-performance`) — JSChronos, thread dumps, JVM (heap até 16 GB), cenários (`pagina_inicial`, `publicacao_documento`, `sincronizacao_dataset`, `connection_pool`, `jvm_memory`, etc.). Único especialista com tool `base-de-conhecimento` como `kb_search`.

**Orquestrador (temperatura 0.3):**

6. `Logs_fluig.json` — roteia entre os especialistas via tools do tipo `agent`, e usa `base-de-conhecimento` (kb_search) para enriquecimento. Retorna JSON `format_version: "1.0"` com `specialists[].findings[]`.

## Ordem de importação no console do Lynn

1. Base de conhecimento (kb) — precisa existir antes; anote o `artifact_id` gerado.
2. `fluig_log_parsing_specialist.json`
3. `fluig_error_classification_specialist.json`
4. `fluig_database_diagnostics_specialist.json`
5. `fluig_integration_diagnostics_specialist.json`
6. `fluig_performance_diagnostics_specialist.json` — substitua o placeholder `<REPLACE_AFTER_IMPORT_KB>` pelo artifact_id da base de conhecimento antes de salvar.
7. `Logs_fluig.json` — substitua TODOS os placeholders `<REPLACE_AFTER_IMPORT_*>` pelos artifact_ids gerados pela importação dos especialistas e da base de conhecimento.

Placeholders a substituir no `Logs_fluig.json`:

- `<REPLACE_AFTER_IMPORT_KB>` — artifact_id da base de conhecimento
- `<REPLACE_AFTER_IMPORT_LOG_PARSING>` — artifact_id do `estruturacao_logs`
- `<REPLACE_AFTER_IMPORT_CLASSIFICATION>` — artifact_id do `categorazacao_erros_comuns`
- `<REPLACE_AFTER_IMPORT_DATABASE>` — artifact_id do `Especialista-banco-de-dados-fluig`
- `<REPLACE_AFTER_IMPORT_INTEGRATION>` — artifact_id do `Especialista-em-integracao`
- `<REPLACE_AFTER_IMPORT_PERFORMANCE>` — artifact_id do `Especialista-em-analise-de-performance`

## Escolha de modelo

Os JSONs fixam `model_name: "gpt-4o-mini"` como valor padrão — troque no console do Lynn conforme o modelo escolhido (Claude, GPT, Gemini). O código do app InsightLog-fluig continua **model-agnostic**: a chamada é feita via `lib/lynn-service.ts` que apenas passa o prompt ao orquestrador — nenhuma referência ao provedor está no repositório.

## Contexto adicional enviado pelo app

O app InsightLog-fluig envia ao orquestrador (via prompt) blocos de contexto pré-computados:

- **AMBIENTE** — versão Fluig, SO, appserver, banco, Java, Solr/LS.
- **RESUMO IA** — resumo prévio.
- **INVENTÁRIO COMPLETO POR CATEGORIA** — fonte da verdade sobre o que existe no log; toda categoria listada aqui existe.
- **INTENÇÃO DETECTADA** — classificação estruturada da pergunta (`intent` + `category_hint` + `keywords`).
- **ERRO SELECIONADO PELO USUÁRIO** — quando o usuário clicou em um erro específico.
- **TODOS OS PADRÕES DA CATEGORIA X** — enviado quando o usuário pede listagem de categoria.
- **ERROS RELEVANTES PARA A PERGUNTA** — resultado de full-text search.
- **TOP 10 PADRÕES POR SEVERIDADE** — fallback quando não há match direto.

Regra rígida: se uma categoria aparece no INVENTÁRIO, o orquestrador NUNCA deve responder "não encontrei" — deve descrever os padrões que o app enviou.

## Schema de resposta

Orquestrador retorna JSON com `format_version: "1.0"` e `specialists[].findings[]`. `lib/lynn-service.ts` já aceita esse formato. Categorias válidas alinhadas ao banco:

```
database | integration | workflow | performance | installation | security | bpm | wcm | ecm | fdn | int | network | infrastructure | permission | other
```
