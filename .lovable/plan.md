
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
- ✅ RPC `get_email_stats_summary`, `get_email_stats_by_campaign`, `get_email_stats_by_date`
- ✅ RPC `get_top_companies_by_email`

**Edge Functions shared:**
- ✅ `_shared/emailProvider.ts` — `sendViaProvider()` (SendGrid, Brevo, Resend, Elastic Email, Mailgun) + `loadProviderSettings()` + attachments + tracking disabilitato
- ✅ `_shared/emailCredits.ts` — `deductEmailCredits()`, `addEmailCredits()`, `getEmailBalance()`, `checkAutoTopup()`

### Fase 2 ✅ — Super Admin Email Settings Tab

- ✅ `EmailSettingsTab.tsx` con 3 tab: Provider, Prezzi & Margini, Dashboard
- ✅ `EmailProviderConfig.tsx` — config dual-provider, 5 provider, test email, campi from_name/domain, badge stato, webhook URL
- ✅ `EmailPricingConfig.tsx` — markup globale, tabella tariffe, bonus signup
- ✅ `EmailDashboard.tsx` — KPI piattaforma + top 10 aziende + selettore periodo
- ✅ Route `/admin/impostazioni/email` con sidebar entry

### Fase 3 ✅ — Send Email Campaign + Tracking

- ✅ `send-email-campaign` edge function (bulk + tracking pixel + crediti + personalizzazione)
- ✅ `email-tracking` edge function (open pixel, click redirect, unsubscribe)
- ✅ `email-provider-webhook` edge function (callback normalizzati da 5 provider)
- ✅ `CampaignSendSettings.tsx` invoca `send-email-campaign` + widget saldo + stima crediti

### Fase 4 ✅ — Credits Page Azienda

- ✅ `SettingsCredits.tsx` — pagina crediti unificata (email + AI + WhatsApp)
- ✅ Riepilogo saldi con wallet cards, usage bar, totale
- ✅ Storico movimenti da `email_credits_log`
- ✅ Route `/azienda/impostazioni/crediti` + sidebar entry "Crediti & Saldo"

### Fase 5 ✅ — Email Transazionali (Stream Transazionale)

- ✅ `ticket-notify` — usa `sendViaProvider()` con fallback transazionale→marketing
- ✅ `reset-customer-password` — invia email con password temporanea
- ✅ `create-customer` — invia email di benvenuto con credenziali
- ✅ `create-employee-user` — invia email di benvenuto con credenziali
- ✅ `create-salesperson-user` — invia email di benvenuto con credenziali
- ✅ `send-contact-message` — già migrato a `sendViaProvider()`
- ✅ `process-automation` case `send_email` — già implementato con dual-stream

### Fase 6 ✅ — Automazioni: send_email dual-stream

- ✅ `process-automation`: case `send_email` con `sendViaProvider()`, personalizzazione template, logging su `email_logs`

---

## TODO Rimanenti (opzionali/futuri)

- [ ] Auto top-up con Stripe (SetupIntent + pagamento automatico)
- [ ] Pagina acquisto pacchetti crediti con Stripe Checkout
- [ ] `AutomationNodeConfig.tsx`: toggle stream marketing/transazionale nell'UI
- [ ] `check-api-health`: verifica email_marketing + email_transactional
- [ ] `ApiHealthBanner` dual email in EmailMarketing.tsx
