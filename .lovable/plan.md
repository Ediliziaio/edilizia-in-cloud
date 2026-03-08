

## Analisi: Documento vs Implementazione Attuale

### Legenda
- ✅ = Implementato
- ⚠️ = Implementato parzialmente / con differenze
- ❌ = Non implementato

---

### PARTE 0 — Contesto e Architettura

| Elemento | Stato | Note |
|---|---|---|
| Stack tecnico (React/Vite/Supabase/Stripe) | ✅ | |
| Multi-tenant con company_id dal JWT | ✅ | |
| Chiavi `platform_settings` | ⚠️ | **Le chiavi nel codice usano nomi diversi da quelli nel documento.** Il documento usa `email_marketing_provider`, `email_marketing_api_key`, `email_marketing_from_address`, `email_marketing_from_name`, `email_marketing_domain`, `email_transactional_*`. Il codice usa `email_provider`, `email_provider_api_key`, `email_default_from` (con suffisso `_transactional`). Mancano anche `from_name` e `domain` come chiavi separate. |

---

### PARTE 1 — Pannello SuperAdmin: Tab Email + Dashboard

| Elemento | Stato | Note |
|---|---|---|
| Tab "Email" in AdminSettings | ✅ | Route `/admin/impostazioni/email` + sidebar link |
| `EmailSettingsTab.tsx` con 3 tab | ✅ | Provider, Prezzi, Dashboard |
| **1.1** Provider Email Marketing | ⚠️ | Implementato ma **mancano**: campo "Nome mittente" (`from_name`), campo "Dominio" (solo Mailgun), box URL webhook read-only, badge stato connessione con data ultimo test (🟢/🔴/⚫) |
| **1.2** Provider Email Transazionale | ⚠️ | Stesse mancanze della 1.1 + manca la nota informativa "Email transazionali — cosa sono" |
| **1.3** Prezzi & Margini | ⚠️ | Implementato con tabella `email_pricing` (per provider). **Il documento chiede un approccio diverso**: campi semplici `credits_email_provider_cost`, `credits_email_markup`, `credits_email_price` (calcolato), `credits_email_signup_bonus`, `credits_email_min_send` da platform_settings + tabella simulazione margine dinamica per volume. L'attuale implementazione usa una tabella DB `email_pricing` con righe per provider e markup_multiplier. |
| **1.4** Dashboard Economica | ⚠️ | Componente `EmailDashboard.tsx` esiste. Usa RPC `get_platform_email_stats`. **Manca** la RPC `get_top_companies_by_email` (la dashboard usa query diretta). Manca il selettore periodo (oggi/7gg/30gg/personalizzato) — il doc lo richiede esplicitamente. |

---

### PARTE 2 — Sezione Crediti Impostazioni Azienda

| Elemento | Stato | Note |
|---|---|---|
| Pagina Crediti azienda (`CreditsPage.tsx`) | ❌ | Non esiste. Esiste solo `AgentCreditsPage` per AI agents. |
| **ZONA A** — Riepilogo saldi (email/WhatsApp/AI) | ❌ | |
| **ZONA B** — Acquisto crediti con pacchetti dinamici + Stripe | ❌ | |
| **ZONA C** — Auto Top-up (toggle + soglia + Stripe SetupIntent) | ❌ | |
| **ZONA D** — Storico movimenti da `email_credits_log` | ❌ | |
| `auto-topup-check` edge function | ❌ | |
| Tabella `company_auto_topup` | ✅ | Creata nella migration Fase 1 |
| Tabella `email_credits_log` | ✅ | Creata nella migration Fase 1 |

---

### PARTE 3 — File Condivisi (_shared)

| Elemento | Stato | Note |
|---|---|---|
| `_shared/emailProvider.ts` | ⚠️ | **Esiste** con 5 provider (SendGrid, Brevo, Resend, ElasticEmail, Mailgun). **Differenze**: il doc chiede signature `sendViaProvider(provider, apiKey, domain, fromEmail, fromName, toEmail, subject, html, attachments)` con parametri singoli. L'implementazione usa un oggetto `EmailSendRequest` con `from`, `to[]`, `subject`, `html`. Mancano: supporto `attachments`, parametri `fromName`/`domain` separati, disabilitazione tracking nativo provider (il doc richiede `tracking_settings: { click_tracking: {enable:false} }` per SendGrid e `o:tracking: no` per Mailgun). Il doc usa `elastic_email` come nome provider, il codice usa `elasticemail`. |
| `_shared/emailCredits.ts` | ⚠️ | **Esiste** con `deductEmailCredits()`, `addEmailCredits()`, `getEmailBalance()`, `checkAutoTopup()`. **Differenze**: il doc prevede un sistema basato su crediti interi (count di email), l'implementazione usa EUR (balance_eur, total_spent_eur). Il doc prevede `deduct_email_credits_atomic` RPC con `p_amount` intero, l'implementazione usa `deduct_email_credits_with_log` con `p_cost` numerico EUR. Il doc prevede che `deductEmailCredits` chiami `checkAndTriggerAutoTopup` in background — non implementato. |
| `loadProviderSettings()` | ⚠️ | Esiste ma restituisce `{ provider, apiKey, fromDefault }`. Il doc richiede `{ provider, apiKey, fromEmail, fromName, domain }` con chiavi `email_marketing_*` / `email_transactional_*`. |

---

### PARTE 4 — Invio Campagne e Tracking (Stream Marketing)

| Elemento | Stato | Note |
|---|---|---|
| Colonne aggiuntive `email_campaigns` | ✅ | `sent_count`, `failed_count`, `completed_at`, `segment_json`, `credits_used` aggiunte in migration Fase 1 |
| Colonne `marketing_contacts` (unsubscribed) | ✅ | Aggiunte in migration Fase 1 |
| Colonne `email_logs` (provider_message_id, stream, etc.) | ✅ | Aggiunte in migration Fase 1 |
| `send-email-campaign` edge function | ❌ | **Non esiste.** Questa e la funzione centrale per l'invio bulk reale. |
| `email-tracking` edge function | ❌ | Pixel apertura, click redirect, unsubscribe |
| `email-provider-webhook` edge function | ❌ | Callback normalizzati dai provider |
| `send-test-email` aggiornato | ✅ | Supporta `testMode` + stream + usa shared `emailProvider.ts` |

---

### PARTE 5 — Email Transazionali (Stream SendGrid)

| Elemento | Stato | Note |
|---|---|---|
| `send-contact-message` usa stream transazionale | ❌ | Ancora con logica diretta |
| `create-employee-user` usa `sendViaProvider()` | ❌ | |
| `create-salesperson-user` usa `sendViaProvider()` | ❌ | |
| `create-customer` usa `sendViaProvider()` | ❌ | |
| `reset-customer-password` usa `sendViaProvider()` | ❌ | |
| `ticket-notify` usa `sendViaProvider()` | ❌ | |
| `check-due-dates` usa `sendViaProvider()` | ❌ | |

---

### PARTE 6 — Automazioni: send_email dual-stream

| Elemento | Stato | Note |
|---|---|---|
| `AutomationNodeConfig.tsx`: toggle stream marketing/transazionale | ❌ | |
| `process-automation`: case `send_email` implementato | ❌ | **Attualmente e uno stub** (riga 485-491: restituisce `placeholder: true`) |

---

### PARTE 7 — Aggiornamenti UI

| Elemento | Stato | Note |
|---|---|---|
| `CampaignSendSettings.tsx`: chiama `send-email-campaign` | ❌ | Attualmente non invoca nessuna edge function di invio bulk |
| `CampaignSendSettings.tsx`: sezione Destinatari/Segmentazione | ❌ | |
| `CampaignSendSettings.tsx`: widget saldo crediti + stima | ❌ | |
| `EmailCampaignsTab.tsx`: badge stato campagna (sending/sent/failed) | ❌ | |
| `topup-credits`: prezzo dinamico da platform_settings | ❌ | |
| `stripe-webhook`: gestione email credits purchase + auto_topup | ❌ | |

---

### PARTE 8 — RPC Statistiche + Health Check

| Elemento | Stato | Note |
|---|---|---|
| RPC `get_platform_email_stats` | ✅ | Creata in migration Fase 1 |
| RPC `get_top_companies_by_email` | ❌ | |
| RPC `get_email_stats_summary` | ❌ | Per le statistiche azienda (EmailStatsTab) |
| RPC `get_email_stats_by_campaign` | ❌ | |
| RPC `get_email_stats_by_date` | ❌ | |
| `check-api-health`: verifica email_marketing + email_transactional | ❌ | |
| `ApiHealthBanner` dual email in EmailMarketing.tsx | ❌ | |

---

## Riepilogo per Fase

| Fase | Stato | Completamento |
|---|---|---|
| **Fase 1** — Shared Libs + DB Migrations | ⚠️ ~70% | DB migrations OK. Shared libs esistono ma con **differenze architetturali** (EUR vs crediti interi, nomi chiavi diversi, signature funzioni diverse). |
| **Fase 2** — Super Admin Email Settings Tab | ⚠️ ~60% | Componenti esistono. Mancano: campi from_name/domain, URL webhook, badge stato connessione, nota transazionale, simulazione margine, selettore periodo dashboard, RPC top companies. |
| **Fase 3** — Send Campaign + Tracking | ❌ 0% | Nessuna delle 3 edge function esiste. |
| **Fase 4** — Credits Page Azienda + Auto Top-up | ❌ ~10% | Solo tabelle DB create. Nessun frontend/backend. |
| **Fase 5** — Automazioni + Email Transazionali | ❌ 0% | send_email e ancora stub. Nessuna edge function di sistema aggiornata. |

---

## Discrepanze Architetturali Critiche

1. **Sistema crediti EUR vs Conteggio**: Il documento prevede crediti come conteggio intero di email (es. 5.000 crediti = 5.000 email). L'implementazione attuale usa EUR (balance_eur). Questo e un disallineamento fondamentale.

2. **Nomi chiavi platform_settings**: Il documento usa `email_marketing_provider`, `email_marketing_api_key`, etc. Il codice usa `email_provider`, `email_provider_api_key`, etc. Questo causa disconnessione tra frontend e backend.

3. **Provider value naming**: Il documento usa `elastic_email`, il codice usa `elasticemail`.

4. **Signature emailProvider**: Il documento prevede parametri separati (fromEmail, fromName, domain, toEmail singolo). L'implementazione usa un oggetto request con array di destinatari.

Vuoi che proceda con il riallineamento di queste discrepanze e poi con la **Fase 3** (Send Campaign + Tracking)?

