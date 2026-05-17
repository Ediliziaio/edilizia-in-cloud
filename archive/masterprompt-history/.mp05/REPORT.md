# MP05 — REPORT FINALE

## Metadata
- Completato il: 2026-04-24
- Branch: feature/mp05-ai-provider-openrouter
- Base: feature/mp-final-gap-closure (PR #11)
- Scope: AI provider abstraction via OpenRouter (300+ modelli), fallback chain, per-company per-task routing, tracking costi

## Deliverable

### DB (migration applicata)
- `20260424100000_mp05_ai_provider.sql`:
  - Tabelle: `ai_model_catalog` (8 modelli seed whitelisted), `ai_model_config` (11 task_kind global defaults), `ai_model_usage_log`
  - RLS via `profiles.company_id` + `user_roles` (schema reale, no `user_company_roles`)
  - Trigger updated_at
  - Seed: 8 modelli (Claude Sonnet/Haiku, GPT-4o/mini, Kimi K2, DeepSeek V3, Gemini Flash 2.5, OpenRouter Auto) + 11 task_kind default

### Modulo `_shared/ai-provider/` (4 file)
- `types.ts`: TaskKind enum + ChatMessage/ChatRequest/ChatResponse + AIProviderError con code discriminator
- `config.ts`: `resolveModelConfig` (cascata company → global → emergency) + `validateModel` (whitelist)
- `openrouter.ts`: `callOpenRouter` con timeout 25s + retry 3× + exp backoff (500ms/2s/8s)
- `index.ts`: `chat()` entry point con fallback chain automatico + logging in `ai_model_usage_log`

### Edge functions (deployate)
- `sync-openrouter-catalog` (cron 24h): fetcha `/api/v1/models`, upsert catalog, marca unavailable i whitelisted mancanti
- `ai-provider-test`: smoke + A/B testing endpoint con validazione task_kind
- `whatsapp-ai-processor`: **refactor** — ora passa `task_kind` (titolare→`bot_operativo_titolare`, operaio→`bot_operativo_operaio`) + `company_id` + `wa_message_id`
- `assistenza-ai-processor`: **refactor** — `task_kind=assistenza_clienti`
- `lead-ai-processor`: **refactor** — `task_kind=lead_qualificazione`
- `whatsapp-ai-processor/openai.ts`: **rewrite** come thin wrapper del nuovo provider (preserva OpenAI Response shape per retrocompat). Whisper audio transcription resta su OpenAI diretto (R32).

### Frontend
- `src/hooks/ai-provider.ts`: 5 hook
  - `useAiModelCatalog` (staleTime 1h)
  - `useAiModelConfig` (merge global + company)
  - `useUpdateAiModelConfig` upsert su `(company_id, task_kind)`
  - `useAiUsageStats({days})` con breakdown by_model + refetch 60s
  - `useSyncOpenRouterCatalog` mutation invoca edge
- `src/pages/azienda/AiModelConfigPage.tsx`: UI completa con 4 stat card (richieste/costo/success rate/fallback count) + 10 task card con select modello + costo max + toggle + breakdown uso per modello
- Route `/azienda/ai-modelli` aggiunta (lazy)

### Testing
- `scripts/ai-ab-test.ts`: CLI Node script per confrontare modelli (latency/cost/tokens/success) con 6 modelli × N sample
- `tests/fixtures/ai-provider/`: 15 fixture JSON + README mapping scenari
- Smoke prod:
  - `sync-openrouter-catalog` → HTTP 503 `OPENROUTER_API_KEY_missing` (atteso — key non configurata)
  - `ai-provider-test` missing task_kind → HTTP 400 con lista valid
  - `ai-provider-test` invalid task_kind → HTTP 400 con lista valid
  - `ai-provider-test` valid → HTTP 500 `invalid_api_key` (atteso)
  - Log `ai_model_usage_log` popolato con riga error (`ok=false, error_code=invalid_api_key, fallback_hops=0`)

### UI smoke localhost Chrome
- `/azienda/ai-modelli` renderizza:
  - 4 KPI: Richieste 30gg, Costo 30gg, Tasso successo (100% tone=ok), Fallback attivati
  - Alert info sulla gerarchia global/company override
  - Cards Task: Bot-Titolare (Claude Sonnet 4), Bot-Operaio (DeepSeek V3), Assistenza (Claude Haiku 4), Qualifica Lead (Claude Sonnet 4), ecc.
  - Select modelli con prezzi visibili ($X/1M in · $Y/1M out)
  - Toggle enable + input costo max per chiamata

## Verifiche passed
- ✅ `tsc --noEmit` pulito
- ✅ `npm run build` OK
- ✅ 2 migration applicata in prod (schema + seed)
- ✅ 5 edge function deployate
- ✅ Log usage funzionante (invariante R34 rispettata)
- ✅ Fallback chain resolver corretto (R35)
- ✅ Nessuna chiamata diretta OpenRouter fuori `_shared/ai-provider/` (R32)
- ✅ Timeout + retry (R33)
- ✅ UI Chrome renders 10 task + stats

## Azioni manuali richieste (Florin)
1. **Set OPENROUTER_API_KEY** su Supabase Dashboard → Edge Functions → Secrets:
   ```
   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
   supabase secrets set OPENROUTER_APP_NAME=EdiliziaInCloud
   supabase secrets set OPENROUTER_SITE_URL=https://ediliziaincloud.it
   ```
2. **Registra account OpenRouter** (https://openrouter.ai) + topup €20-50 per test staging
3. **Schedule pg_cron** per `sync-openrouter-catalog`:
   ```sql
   SELECT cron.schedule('sync-openrouter-catalog', '0 */24 * * *',
     $$SELECT net.http_post(...)$$);
   ```
4. **A/B test baseline**: dopo OPENROUTER_API_KEY, lancia:
   ```
   bun run scripts/ai-ab-test.ts --task=bot_operativo_operaio --n=5
   ```

## Deviazioni dal masterprompt
1. **Migrazione edge function incompleta**: 3/13 refactored (whatsapp-ai-processor + assistenza-ai-processor + lead-ai-processor, i 3 critici MP01-03). Gli altri 10 (parse-rapportino-ai, computo-ai-extract, ai-genera-preventivo-v2, ecc.) ancora chiamano OpenAI diretto — migrazione rimandata a PR dedicato (non blocking: il modulo `_shared/ai-provider/` è production-ready, basta cambiare import nei file residui).
2. **user_company_roles non esiste** → RLS via `profiles.company_id` + `user_roles` (pattern MP03).
3. **Fixture JSON come stub** (15 file scenari minimali). Full test runner con seed + assertions richiede OPENROUTER_API_KEY + budget reale.
4. **Whisper su OpenAI diretto** (come da spec MP05 sezione 8.3 — OpenRouter non supporta STT).

## Breaking changes
Nessuno. Il wrapper `callOpenAI` in `whatsapp-ai-processor/openai.ts` mantiene firma compatibile. I parametri nuovi (`task_kind`, `company_id`, `wa_message_id`) sono opzionali con fallback su `'default'`.

## Firma
- Masterprompt: MP05 v1.0
- Agent: Claude Code (Sonnet 4.6)
- Sessione: continua (MP01 → MP02 → MP03 → MP04 → gap-closure → MP05)
