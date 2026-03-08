

## Piano: Email Dual-Provider + Sistema Crediti Universale

Il documento descrive un sistema completo in 8 parti. Ecco la suddivisione in fasi con lo stato attuale del progetto.

### Stato attuale

**Gia esistente:**
- Tabelle `email_credits`, `email_pricing`, `email_logs` (migration gia applicate)
- RPC `deduct_email_credits` (atomica, stile AI credits)
- Trigger `init_company_email_credits` (crea wallet al signup)
- Edge function `send-test-email` (supporta SendGrid/Brevo/Resend, NON Elastic Email)
- Widget `EmailCreditsWidget.tsx`
- Builder email drag-drop completo
- `getPlatformSetting.ts` shared helper

**Mancante:**
- `_shared/emailProvider.ts` (Elastic Email + SendGrid + Mailgun centralizzato)
- `_shared/emailCredits.ts` (deduct + add + auto-topup helpers)
- `send-email-campaign` edge function (invio bulk reale)
- `email-tracking` edge function (pixel apertura, click redirect, unsubscribe)
- `email-provider-webhook` edge function (callback provider)
- `auto-topup-check` edge function
- `EmailSettingsTab.tsx` (Super Admin: provider + prezzi + dashboard)
- Credits page azienda (saldo + acquisto + auto-topup + storico)
- `email_credits_log` tabella
- `company_auto_topup` tabella
- Colonne aggiuntive su `email_campaigns` (sent_count, failed_count, etc.)
- Colonna `unsubscribed` su `marketing_contacts`
- RPC statistiche (`get_email_stats_summary`, `get_email_stats_by_campaign`, `get_email_stats_by_date`, `get_platform_email_stats`)
- Automazione `send_email` implementata (oggi e stub)
- Stream dual-provider nelle email di sistema
- Aggiornamenti Stripe webhook per crediti email

---

### Fase 1 — Shared Libraries + DB Migrations

**Database:**
- Creare tabella `email_credits_log` (storico movimenti crediti)
- Creare tabella `company_auto_topup` (configurazione auto-ricarica)
- Aggiungere colonne a `email_campaigns`: `total_recipients`, `sent_count`, `failed_count`, `completed_at`, `segment_json`, `credits_used`
- Aggiungere colonne a `marketing_contacts`: `unsubscribed`, `unsubscribed_at`
- Creare RPC `deduct_email_credits_atomic` (versione count-based, alternativa a quella EUR esistente)
- Creare le 4 RPC statistiche

**Edge Functions shared:**
- `_shared/emailProvider.ts` — `sendViaProvider()` (Elastic Email v4 + SendGrid v3 + Mailgun) + `loadProviderSettings()`
- `_shared/emailCredits.ts` — `deductEmailCredits()` + `addEmailCredits()`

---

### Fase 2 — Super Admin Email Settings Tab

- Creare `src/components/admin/settings/EmailSettingsTab.tsx`
- Sezione 1: Provider Email Marketing (Elastic Email) — config + test
- Sezione 2: Provider Email Transazionale (SendGrid) — config + test
- Sezione 3: Prezzi e Margini (costo provider, markup, prezzo finale, bonus signup)
- Sezione 4: Dashboard economica (KPI + top 10 aziende)
- Aggiungere route `/admin/impostazioni/email` nella sidebar e in App.tsx

---

### Fase 3 — Send Email Campaign + Tracking

- Creare `send-email-campaign/index.ts` — invio bulk con segmentazione, batch da 50, tracking pixel, redirect link, scalatura crediti
- Creare `email-tracking/index.ts` (verify_jwt: false) — open pixel (GIF 1x1), click redirect (302), unsubscribe page HTML
- Creare `email-provider-webhook/index.ts` (verify_jwt: false) — normalizza eventi da 3 provider, aggiorna email_logs
- Aggiornare `send-test-email` per supportare stream param e 3 provider
- Aggiornare `CampaignSendSettings.tsx` — chiamata a send-email-campaign + segmentazione + widget crediti

---

### Fase 4 — Credits Page Azienda + Auto Top-up

- Creare `src/pages/azienda/settings/SettingsCredits.tsx`
- Zona A: Riepilogo saldi (email, WhatsApp, AI — card espandibili)
- Zona B: Acquisto crediti (pacchetti dinamici da platform_settings → Stripe Checkout)
- Zona C: Auto top-up (toggle + soglia + pacchetto + Stripe SetupIntent)
- Zona D: Storico movimenti (da email_credits_log)
- Creare `auto-topup-check/index.ts`
- Aggiornare `stripe-webhook` per gestire credits purchase + auto_topup

---

### Fase 5 — Automazioni + Email Transazionali

- Implementare case `send_email` in `process-automation/index.ts` con dual-stream
- Aggiungere toggle stream marketing/transazionale in `AutomationNodeConfig.tsx`
- Aggiornare edge functions di sistema per usare `sendViaProvider()` transazionale: `create-employee-user`, `create-salesperson-user`, `create-customer`, `reset-customer-password`, `ticket-notify`, `check-due-dates`
- Aggiornare `check-api-health` per verificare entrambi i provider email

---

### Ordine consigliato

Fase 1 e fondamentale (tutto il resto dipende da shared libs e tabelle). Poi Fase 2 (configurazione admin necessaria prima dell'invio). Poi Fase 3 (invio reale). Poi Fase 4 e 5 in parallelo.

Confermi di partire con la **Fase 1**?

