
# Verifica Modulo AI Agents — Stato aggiornato

## Completato — Blocco A, B, C ✅

### FIX 2 ✅ — API Key ElevenLabs su DB
- `PlatformSettingsPage`: salvataggio reale su `platform_settings` con upsert
- `elevenlabs-proxy`: usa `getPlatformSetting()` per leggere API key da DB con fallback env
- Banner rosso se API key non configurata

### FIX 3 ✅ — handleArchive in AgentsListPage
- Implementato con `useUpdateAgent` → status='archived'
- AlertDialog conferma archiviazione
- Toggle "Mostra archiviati" con conteggio

### FIX 4 ✅ — Tab Strumenti con persistenza DB
- Toggle sistema salvati in `tools_config` jsonb su `ai_agents`
- Dialog "Aggiungi strumento personalizzato" con salvataggio
- Rimozione strumenti personalizzati

### FIX 5 ✅ — Tab Sicurezza + Avanzato con persistenza DB
- Migration: colonne `domain_whitelist`, `require_auth`, `rate_limit_enabled`, `rate_limit_per_minute`, `conversation_timeout`, `max_duration`, `error_message`, `auto_end_on_silence`, `silence_timeout` su `ai_agents`
- SecurityTab e AdvancedTab ricevono `agent` e `onSave` props, salvano su DB

### FIX 6 ✅ — Tab Test con DB
- Tabella `ai_agent_tests` con RLS + indice
- CRUD completo: crea, esegui (simulato), elimina
- Risultati persistiti in DB

### FIX 7 ✅ — Auto-ricarica crediti
- Switch abilitato con form soglia/importo
- Salvataggio su `ai_credits` con upsert

### FIX 8 ✅ — Sync KB con ElevenLabs
- Actions `add_kb_doc`, `remove_kb_doc`, `list_kb_docs`, `sync_kb` nel proxy
- ProxyAction type aggiornato

### FIX 9 ✅ — Conversazioni AI nel CRM
- Componente `ContactAIConversations` nel sidebar destro di `MarketingContactDetail`
- Tab "Conversazioni AI" con icona Bot

### FIX 10 ✅ — Banner errore API key
- Card destructive in PlatformSettingsPage quando API key non salvata

### FIX 11 ✅ — Webhook HMAC verification
- `elevenlabs-webhook`: verifica `xi-signature` con HMAC-SHA256
- Fallback se `ELEVENLABS_WEBHOOK_SECRET` non configurato

### FIX 12 ✅ — Documentazione
- `docs/SETUP.md` con architettura, tabelle, configurazione

### Feature ✅ — MarketingAiAgent dashboard
- Riepilogo agenti, saldo, KB
- Banner chiamate bloccate
- Azioni rapide con navigazione

---

## Email Dual-Provider + Sistema Crediti Universale

### Fase 1 ✅ — Shared Libraries + DB Migrations

**Database (migration applicata):**
- ✅ Tabella `email_credits_log` (storico movimenti con RLS)
- ✅ Tabella `company_auto_topup` (config auto-ricarica multi-wallet con RLS)
- ✅ Colonne `sent_count`, `failed_count`, `completed_at`, `segment_json`, `credits_used` su `email_campaigns`
- ✅ Colonne `unsubscribed`, `unsubscribed_at` su `marketing_contacts`
- ✅ Colonne `provider_message_id`, `provider`, `stream`, `opened_at`, `clicked_at`, `error_message` su `email_logs`
- ✅ RPC `get_platform_email_stats` (dashboard super admin)
- ✅ RPC `deduct_email_credits_with_log` (detrazione atomica + log)
- ✅ RPC `add_email_credits_with_log` (ricarica atomica + log)

**Edge Functions shared:**
- ✅ `_shared/emailProvider.ts` — `sendViaProvider()` (SendGrid, Brevo, Resend, Elastic Email, Mailgun) + `loadProviderSettings()`
- ✅ `_shared/emailCredits.ts` — `deductEmailCredits()`, `addEmailCredits()`, `getEmailBalance()`, `checkAutoTopup()`

### Fase 2 ✅ — Super Admin Email Settings Tab

- ✅ `EmailSettingsTab.tsx` con 3 tab: Provider, Prezzi & Margini, Dashboard
- ✅ `EmailProviderConfig.tsx` — config dual-provider (marketing + transazionale), 5 provider, test email inline
- ✅ `EmailPricingConfig.tsx` — markup globale, tabella tariffe, bonus signup
- ✅ `EmailDashboard.tsx` — KPI piattaforma (8 metriche) + top 10 aziende per spesa
- ✅ Route `/admin/impostazioni/email` con sidebar entry

### Fase 3 — Send Email Campaign + Tracking (da fare)
- `send-email-campaign` edge function (bulk + tracking + crediti)
- `email-tracking` edge function (open pixel, click redirect, unsubscribe)
- `email-provider-webhook` edge function (callback normalizzati)

### Fase 4 — Credits Page Azienda + Auto Top-up (da fare)
- Pagina crediti unificata (email + WhatsApp + AI)
- Auto top-up con Stripe
- Storico movimenti

### Fase 5 — Automazioni + Email Transazionali (da fare)
- Case `send_email` nel motore automazioni
- Dual-stream nelle email di sistema
