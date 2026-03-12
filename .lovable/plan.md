

# Piano: Platform Settings, Email & Bug Fixes (Fase 5)

## Stato attuale

- **PlatformInfoTab**: Funzionante con card per Meta, Google Calendar, Maps, WhatsApp. Usa pattern key-value su `platform_settings` (key TEXT PK, value TEXT) via `manage-super-admins` edge function (azioni "get-settings" e "update-settings"). Manca: Stripe panel, test connessione, toggle manutenzione.
- **SyncLogs (BUG #5)**: GIA RISOLTO - ha gia `isError` + Alert con "Riprova" (linee 74-94). Non necessita fix.
- **useAdminRevenueData (BUG #6)**: Confermato - linee 282-283 hanno `expansionMrr: 0, contractionMrr: 0` hardcoded. La tabella `subscription_logs` non ha `previous_plan_id`.
- **EmailSettingsTab**: Gia completa con 3 tab (Provider, Prezzi, Dashboard). Dashboard usa RPC `get_platform_email_stats`. Manca: delivery log reale per tracciare singoli invii.
- **email_delivery_log**: Non esiste.
- **check-api-health**: Edge function gia esistente che verifica la configurazione delle API (usata lato azienda). Puo essere estesa per test connessione.

## Implementazione

### 1. DB Migration
- Creare tabella `email_delivery_log` (recipient, subject, template_type, provider, status, provider_id, error_message, sent_at, company_id) con RLS per super_admin e service_role
- Aggiungere `previous_plan_id UUID` a `subscription_logs` per tracciare upgrade/downgrade
- Creare RPC `get_mrr_movements_monthly` che calcola new/expansion/contraction/churn MRR dai subscription_logs

### 2. Aggiornare PlatformInfoTab
Mantenere la struttura esistente (card API con pattern key-value) ma aggiungere:
- **Card Stripe**: campi publishable key, secret key, webhook secret + toggle test/live (salvati come chiavi `stripe_publishable_key`, `stripe_secret_key`, `stripe_webhook_secret`, `stripe_mode` nel key-value store)
- **Bottone "Testa connessione"** su ogni card integrazione (Stripe, Google Calendar, Maps) che invoca una nuova edge function `test-integration`
- **Toggle manutenzione** con chiave `maintenance_mode` nel settings store
- Preservare le card esistenti (Meta, Calendar, Maps, WhatsApp) e il pattern `manage-super-admins` per get/update settings

### 3. Edge Function `test-integration`
- Verifica auth + ruolo super_admin
- Switch per integration type: stripe (verifica account via API), google_calendar (formato client ID), google_maps (geocode test)
- Legge le chiavi da `platform_settings` key-value store
- Ritorna `{ ok: boolean, message: string }`

### 4. Fix BUG #6: expansionMrr/contractionMrr
- Aggiungere colonna `previous_plan_id` a `subscription_logs`
- Creare RPC `get_mrr_movements_monthly` con calcolo reale basato su plan_id vs previous_plan_id
- Aggiornare `useAdminRevenueData.ts` per usare la RPC invece del calcolo client-side hardcoded

### 5. Aggiungere tab "Delivery Log" in EmailSettingsTab
- Nuova tab nella EmailSettingsTab con tabella che legge da `email_delivery_log`
- Colonne: data, destinatario, oggetto, template, provider, stato (badge colorato)
- Filtri per periodo e stato
- Le edge function di invio email (send-email-campaign, ticket-notify, invite-admin, ecc.) andranno aggiornate per loggare in `email_delivery_log` - ma questo sara fatto incrementalmente

### File impattati
| File | Azione |
|---|---|
| DB migration | `email_delivery_log` + `previous_plan_id` su subscription_logs + RPC |
| `src/components/admin/settings/PlatformInfoTab.tsx` | Aggiungere Stripe card, test connessione, toggle manutenzione |
| `supabase/functions/test-integration/index.ts` | Nuovo |
| `src/hooks/useAdminRevenueData.ts` | Sostituire mrrMovements hardcoded con RPC |
| `src/components/admin/settings/EmailSettingsTab.tsx` | Aggiungere tab Delivery Log |
| `src/components/admin/settings/email/EmailDeliveryLog.tsx` | Nuovo |

