# Meta Lead Ads — Stato implementazione
Ultimo aggiornamento: 2026-03-29T18:30:00Z

## ✅ SISTEMA COMPLETAMENTE LIVE IN PRODUZIONE

### Deploy completato
| Componente | Stato |
|---|---|
| GitHub | ✅ Pushato |
| Supabase Edge Functions | ✅ Deployate |
| Cloudflare | ✅ Deployato |
| Cron job Supabase | ✅ Attivi (3 job) |
| Webhook Meta (`leadgen`) | ✅ Configurato e verificato |
| Secrets Supabase | ✅ CRON_SECRET + META_WEBHOOK_VERIFY_TOKEN impostati |

---

## Completato ✅ (tutti i task P0, P1, P2)

### P0 — Critici
- [x] P0-1 — Cron pg_cron: meta-process-leads (ogni 2 min), meta-health-check (06:00 UTC), meta-token-refresh (03:00 UTC)
- [x] P0-2 — Page Access Token per fetch lead + verifyCronOrAuth con CRON_SECRET
- [x] P0-3 — META_WEBHOOK_VERIFY_TOKEN dedicato (backward compat WHATSAPP_VERIFY_TOKEN)
- [x] P0-4 — Case subscribe-webhook in meta-api-proxy

### P1 — Importanti
- [x] P1-1 — Edge Function meta-token-refresh + cron
- [x] P1-2 — serve() deprecato → Deno.serve()
- [x] P1-3 — Business Manager owned_pages con deduplicazione

### P2 — Miglioramenti
- [x] P2-1 — META_API_VERSION env var (rimossi v21.0 hardcoded)
- [x] P2-2 — Test lead button: action send-test-lead + pulsante in ActivationStep
- [x] P2-3 — Notifiche agente: insert in notifications + real-time toast
- [x] P2-4 — IntegrationLogsPanel: tab Log attività con audit log unificato
- [x] P2-5 — Speed-to-lead in audit_log.metadata.speed_to_lead_seconds
- [x] P2-6 — normalizePhone: fissi 0xx, mobili 3xx, 10 cifre, 00XX

---

## Da fare (prossimi step consigliati)
- [ ] Pubblicare l'app Meta (App Review) per ricevere webhook in produzione reale
  → developers.facebook.com → App Review → richiedi leads_retrieval e pages_manage_metadata
- [ ] Connettere una pagina Facebook reale dal wizard Edilizia in Cloud
- [ ] Testare con un lead reale o usare il pulsante "Test Lead" in ActivationStep

## Note tecniche
- App Meta attualmente in modalità sviluppo: webhook funzionano solo per admin/developer/tester
- Per produzione piena: richiedere App Review su Meta for Developers
