# MP01 — STATUS

## Identità sessione
- Owner: Florin Andriciuc
- Started: 2026-04-23T14:43+02:00
- Current session: 1
- Branch: feature/mp01-multi-numero-whatsapp
- Base: main @ b0b9804d

## Fase corrente
- [x] P0.1 — Migrazione DB schema (ALTER TABLE + CHECK)
- [x] P0.2 — Migrazione dati legacy
- [x] P0.3 — Rigenerazione types.ts
- [x] P1.1 — Refactor whatsapp-webhook per routing
- [x] P1.2 — Aggiornamento whatsapp-connect (accetta purpose)
- [x] P2.1 — Fixture test webhook (12+ scenari)
- [x] P2.2 — Loop di verifica autonomo (tsc + lint + build)
- [x] P2.3 — Deploy edge functions su Supabase
- [x] P2.4 — Smoke test e2e (12/12 fixture PASS)
- [x] P2.5 — Smoke test UI localhost (login + dashboard OK)
- [x] P2.6 — REPORT.md compilato

## Blockers
nessuno

## Decisioni prese in questa sessione
1. Refactor webhook preserva 100% del comportamento pre-MP01 (delivery
   statuses, messaging_conversations per UI admin, automation triggers,
   idempotency, sanitize phone). Logica spostata in handlers/bot_operativo.ts.
2. Fallback legacy su messaging_whatsapp_config NON previsto: lookup
   avviene solo su ai_whatsapp_numbers (migrazione dati P0.2 garantisce
   parità). Se phone_number_id ignoto → wa_routing_errors + 200 OK.
3. whatsapp-connect mantiene upsert legacy su messaging_whatsapp_config
   SOLO per purpose='bot_operativo' (retro-compat con vecchia UI msgg
   finché MP4 non la deprecata).
4. Test e2e via REST API contro edge prod (no supabase start / no psql
   locale: Docker off). Script `tests/wa-webhook/run-tests-rest.sh`
   esegue seed + 12 fixture + cleanup.

## File modificati finora
```
supabase/migrations/20260423143000_mp01_multi_numero_purpose.sql    NEW
supabase/migrations/20260423143100_mp01_data_migration_legacy.sql   NEW
supabase/functions/whatsapp-webhook/index.ts                         REWRITE
supabase/functions/whatsapp-webhook/router.ts                        NEW
supabase/functions/whatsapp-webhook/errors.ts                        NEW
supabase/functions/whatsapp-webhook/types.ts                         NEW
supabase/functions/whatsapp-webhook/parser.ts                        NEW
supabase/functions/whatsapp-webhook/handlers/bot_operativo.ts        NEW
supabase/functions/whatsapp-webhook/handlers/assistenza.ts           NEW
supabase/functions/whatsapp-webhook/handlers/lead.ts                 NEW
supabase/functions/whatsapp-webhook/handlers/marketing.ts            NEW
supabase/functions/whatsapp-webhook/handlers/notifiche.ts            NEW
supabase/functions/whatsapp-webhook/handlers/_shared.ts              NEW
supabase/functions/whatsapp-connect/index.ts                         REWRITE
src/integrations/supabase/types.ts                                    REGEN
tests/fixtures/wa-webhook/*.json (12 fixtures + .expected + seed)    NEW
tests/wa-webhook/run-tests.sh                                         NEW
tests/wa-webhook/run-tests-rest.sh                                    NEW
.mp01/audit-pre.log                                                   NEW
.mp01/STATUS.md                                                       NEW
.mp01/REPORT.md                                                       NEW
```
