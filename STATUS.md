# Meta Lead Ads — Stato implementazione
Ultimo aggiornamento: 2026-03-29T16:00:00Z

## Completato ✅ (tutti i task P0, P1, P2)

### P0 — Critici
- [x] **P0-1** — Cron pg_cron: meta-process-leads (ogni 2 min), meta-health-check (06:00 UTC), meta-token-refresh (03:00 UTC) — `supabase/migrations/20260329140000_meta_cron_jobs.sql`
- [x] **P0-2** — Page Access Token per fetch lead + verifyCronOrAuth con CRON_SECRET — `meta-process-leads/index.ts`
- [x] **P0-3** — META_WEBHOOK_VERIFY_TOKEN dedicato (backward compat WHATSAPP_VERIFY_TOKEN) — `meta-webhook/index.ts`
- [x] **P0-4** — Case `subscribe-webhook` in meta-api-proxy — `meta-api-proxy/index.ts`

### P1 — Importanti
- [x] **P1-1** — Edge Function meta-token-refresh + cron — `meta-token-refresh/index.ts`
- [x] **P1-2** — serve() deprecato → Deno.serve() — `meta-oauth-callback/index.ts`
- [x] **P1-3** — Business Manager owned_pages con deduplicazione — `meta-oauth-callback/index.ts`

### P2 — Miglioramenti
- [x] **P2-1** — META_API_VERSION env var (9 v21.0 rimossi, costante apiVersion) — `meta-api-proxy/index.ts`
- [x] **P2-2** — Test lead button: action `send-test-lead` + pulsante in ActivationStep — `meta-api-proxy/index.ts`, `ActivationStep.tsx`
- [x] **P2-3** — Notifiche agente: insert in `notifications` dopo lead assegnato + real-time toast con azione "Visualizza" — `meta-process-leads/index.ts`, `useMetaLeadNotifications.ts`
- [x] **P2-4** — IntegrationLogsPanel: tab "Log attività" con audit log unificato + speed-to-lead — `IntegrationLogsPanel.tsx`
- [x] **P2-5** — Speed-to-lead in audit_log.metadata.speed_to_lead_seconds — `meta-process-leads/index.ts`
- [x] **P2-6** — normalizePhone: fissi 0xx, mobili 3xx, 10 cifre, 00XX — `meta-process-leads/index.ts`

## Da fare (deploy)

| Azione | Stato |
|---|---|
| Impostare `CRON_SECRET` in Supabase Secrets | ⏳ DA FARE |
| Sostituire `PLACEHOLDER_CRON_SECRET` nella migration | ⏳ DA FARE |
| Impostare `META_WEBHOOK_VERIFY_TOKEN` in Supabase Secrets | ⏳ DA FARE |
| `supabase functions deploy meta-token-refresh` | ⏳ DA FARE |
| `git commit && git push` | ⏳ DA FARE |

## File modificati in questa sessione (tutti)

```
supabase/migrations/20260329140000_meta_cron_jobs.sql       [NUOVO]
supabase/functions/meta-process-leads/index.ts
supabase/functions/meta-webhook/index.ts
supabase/functions/meta-api-proxy/index.ts
supabase/functions/meta-health-check/index.ts
supabase/functions/meta-oauth-callback/index.ts
supabase/functions/meta-token-refresh/index.ts              [NUOVO]
src/components/integrations/steps/ActivationStep.tsx
src/components/integrations/IntegrationLogsPanel.tsx
src/hooks/useMetaLeadNotifications.ts
STATUS.md
```
