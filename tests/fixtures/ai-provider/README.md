# MP05 — Fixture AI Provider (15 scenari)

Mappano 1:1 la tabella scenari del masterprompt sezione 12.1.
Eseguibili contro `ai-provider-test` edge function con OPENROUTER_API_KEY configurata.

| # | Scenario | Atteso |
|---|----------|--------|
| 01 | task=bot_operativo_operaio senza config company | deepseek/deepseek-v3 (global default) |
| 02 | company override | modello company, non global |
| 03 | 429 primary | fallback hop=1 |
| 04 | 429 primary+secondo | fallback hop=2 |
| 05 | tutti 429 | throw rate_limit |
| 06 | OPENROUTER_API_KEY vuota | invalid_api_key, no retry |
| 07 | timeout 25s | retry 2× poi throw |
| 08 | model_not_found | fallback immediato |
| 09 | context_too_long | fallback |
| 10 | vision task, modello non-vision | fallback o feature_not_supported |
| 11 | 2 tool paralleli | response.tool_calls.length === 2 |
| 12 | json_mode | risposta JSON valida |
| 13 | budget degraded | modello cheap |
| 14 | x-or-cost mancante | stima da usage |
| 15 | log usage_log | riga con cost_usd, latency_ms, ok |
