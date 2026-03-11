

# Piano: Gestione Webhook (modulo completo)

## Panoramica
Nuovo modulo per gestire webhook aziendali: CRUD, selezione eventi raggruppati, log delivery con retry, test in tempo reale, HMAC signing. Include tabelle DB, edge function, hook, pagina settings e integrazione nella sidebar/routing.

## Modifiche

### 1. Migrazione DB
- **`webhooks`**: `company_id`, `name`, `url`, `secret` (HMAC), `is_active`, `events` (text[]), `created_by`
- **`webhook_deliveries`**: `webhook_id`, `event_type`, `payload` (jsonb), `status` (pending/success/failed/retrying), `http_status`, `response_body`, `duration_ms`, `attempt_count`
- RLS su entrambe basata su `company_id` via profiles join
- Indici su company_id, webhook_id, created_at DESC, status

### 2. Edge Function — `send-webhook`
- Riceve `webhook_id`, `event_type`, `payload`, `is_test`
- Firma HMAC-SHA256 con header `X-Webhook-Signature`
- Timeout 10s, log delivery nel DB (troncato a 2000 char)
- Modalità test: supporto `is_test=true` + `test_url` per URL non ancora salvati

### 3. Tipi — `src/types/webhooks.ts`
- Costante `WEBHOOK_EVENTS` raggruppata (Lead, Ordini, Appuntamenti, Task, Pagamenti — 22 eventi)
- Interfacce `Webhook` e `WebhookDelivery`

### 4. Hook — `src/hooks/useWebhooks.ts`
- `useWebhooks(companyId)`: lista webhook
- `useWebhookDeliveries(webhookId)`: ultimi 100 delivery
- `useCreateWebhook`, `useUpdateWebhook`, `useDeleteWebhook`: mutazioni CRUD
- `useRetryDelivery`: rilegge payload dal delivery e ri-invoca `send-webhook`
- Nota: il prompt usa `supabase.rpc("increment_attempt")` per il retry counter — semplificherò con increment lato JS (read+update) per evitare di creare una RPC dedicata

### 5. Pagina — `src/pages/azienda/settings/SettingsWebhooks.tsx`
Tre sotto-componenti:
- **WebhookFormDialog**: Dialog per crea/modifica con nome, URL, secret (generazione automatica), selezione eventi con checkbox raggruppate, test inline
- **DeliveriesSheet**: Sheet laterale con log delivery, badge status, retry manuale per i falliti
- **SettingsWebhooks** (default export): lista card webhook con toggle attivo, actions (modifica, log, elimina con AlertDialog)

### 6. Routing & Sidebar
- **`companyRoutes.tsx`**: aggiungere `<Route path="webhook" element={<SettingsWebhooks />} />` dentro le route impostazioni
- **`CompanyLayout.tsx`**: aggiungere voce "Webhook" con icona `Globe` dopo "API Platform" (riga ~476)

### Note
- Lucide non ha un'icona `Webhook` — il prompt la importa ma non esiste. Userò `Globe` come da InternalAutomationNode
- `formatRelativeTime` e `formatDateTime` già disponibili in `src/lib/formatters.ts`
- Il campo `created_by` non è settato nel create hook del prompt — lo aggiungerò usando `auth.uid()`
- `config.toml`: aggiungerò `[functions.send-webhook]` con `verify_jwt = false` per consentire chiamate interne

