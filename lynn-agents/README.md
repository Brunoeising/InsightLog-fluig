# Agentes Lynn — InsightLog

Estes 4 JSONs substituem os 6 agentes anteriores. Aplique-os no console do Lynn na ordem abaixo.

## Estrutura anterior (6 agentes) -> nova (3 especialistas + orquestrador)

**Removidos:**
- categorazacao_erros_comuns
- Especialista-banco-de-dados-fluig
- Especialista-em-integracao

Todos os tres foram fundidos em `fluig_diagnostico_tecnico`.

**Mantidos (revisados):**
- `Logs_fluig` -> orquestrador com prompt reescrito, tools `recurso`/`recurso_1` removidas
- `fluig_performance_specialist` -> mantido, tool `resposta-teste-base` renomeada para `base-de-conhecimento`
- `fluig_log_structurer` -> mantido, ajustes de temperatura

## Ordem de aplicacao

1. `fluig_log_structurer.json`
2. `fluig_performance_specialist.json`
3. `fluig_diagnostico_tecnico.json` (novo)
4. `Logs_fluig.json` (orquestrador)

## Configuracao no console do Lynn

Ao colar cada JSON, garanta que:

- O modelo (Claude, GPT-4, Gemini, etc.) e escolhido no proprio console — os JSONs NAO fixam `model_name` para manter o codigo agnostico.
- `temperature: 0.2`, `presence_penalty: 0`, `frequency_penalty: 0` em todos.
- A tool `base-de-conhecimento` precisa apontar para a base de conhecimento existente com os erros conhecidos Fluig.
- No orquestrador, garanta que as tools de tipo `agent_call` estejam vinculadas aos agentes com o mesmo `name`.

## Notas sobre o schema de resposta

O orquestrador responde em JSON com `format_version: "2"` e um array `specialists[].findings[]`. O parser em `lib/lynn-service.ts` ja aceita esse formato. As categorias validas no enum `category` estao alinhadas com o banco:

```
database | bpm | wcm | ecm | fdn | int | performance | network | infrastructure | permission | other
```
