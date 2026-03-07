

# Piano: Modello di Billing Email per Azienda (stile AI Agents)

## Concetto

Stesso pattern dei crediti AI: tu (super admin) paghi SendGrid/Sendinblue, le aziende ti pagano un costo per email inviata con il tuo markup. Le API key vengono gestite a livello `platform_settings` (super admin), non dall'azienda.

## Cosa serve

### 1. Database — Nuova tabella `email_pricing` + `email_credits`

**`email_credits`** (wallet per azienda, come `ai_credits`):
- `company_id` (FK → companies, UNIQUE)
- `balance_eur` (saldo corrente)
- `total_spent_eur` (totale speso)
- `calls_blocked` (boolean — blocca invii se saldo insufficiente)
- `auto_recharge_enabled`, `auto_recharge_threshold`, `auto_recharge_amount`

**`email_pricing`** (configurazione super admin, come `platform_pricing`):
- `provider` (sendgrid, sendinblue, resend, etc.)
- `cost_real_per_email` (quanto paghi tu)
- `cost_billed_per_email` (quanto pagano le aziende)
- `markup_multiplier`
- `is_active`

**Funzione SQL `deduct_email_credits`** (atomica con `FOR UPDATE`, come `deduct_ai_credits`)

### 2. Edge Function `send-test-email` — Aggiornamento

- Legge la API key del provider da `platform_settings` (chiave `email_provider_api_key`)
- Legge il provider attivo da `platform_settings` (chiave `email_provider` = "sendgrid" | "sendinblue" | "resend")
- Deduce il costo dal wallet aziendale tramite `deduct_email_credits`
- Supporta SendGrid API (`api.sendgrid.com/v3/mail/send`)

### 3. Super Admin — Impostazioni Email Provider

Nella `PlatformSettingsPage.tsx` (già esistente per ElevenLabs), aggiungere una sezione:
- Select provider (SendGrid / Sendinblue / Resend)
- Campo API Key (salvata in `platform_settings`)
- Tabella pricing con costo reale, markup, costo azienda (come la tabella pricing AI)

### 4. Dashboard Azienda — Widget Crediti Email

Nel modulo marketing, card simile a quella AI credits:
- Saldo email rimanente
- Storico invii
- Ricarica crediti

### 5. Chiave API

La chiave SendGrid/altro provider va salvata in `platform_settings` (tabella DB), NON come secret di ambiente. Questo è già il pattern usato per ElevenLabs e Meta. Il super admin la inserisce dalla UI delle impostazioni piattaforma.

## File da modificare/creare

| File | Azione |
|------|--------|
| SQL Migration | Creare `email_credits`, `email_pricing`, `deduct_email_credits()` |
| `supabase/functions/send-test-email/index.ts` | Aggiornare per leggere provider da `platform_settings` e detrarre crediti |
| `src/modules/ai-agents/pages/PlatformSettingsPage.tsx` | Aggiungere sezione Email Provider + Pricing |
| `src/pages/azienda/marketing/MarketingAiAgent.tsx` o nuovo componente | Widget crediti email |

## Nota importante

Questo è un sistema complesso. Propongo di implementare **prima l'infrastruttura** (DB + edge function + UI super admin) e **poi** il widget lato azienda, in modo da poter testare step by step.

