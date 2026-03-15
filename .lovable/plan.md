

## Piano: Fix Integrazioni Admin — Backend Whitelist Mismatch (UNIF-INTEG-01)

### Problema critico scoperto

Il backend (`manage-super-admins` edge function) ha una **whitelist di soli 4 campi** nelle azioni `get-settings` e `update-settings`:

```
allowedKeys = ["meta_app_id", "meta_app_secret", "google_maps_api_key", "whatsapp_verify_token"]
```

Ma il frontend tenta di salvare/leggere **13 campi diversi**. Risultato: **Stripe, Google Calendar, e le Google Calendar Policies vengono silenziosamente ignorate**. Il toast dice "Configurazione salvata" ma i dati non vengono mai scritti nel database.

Il database conferma: solo 3 chiavi esistono (`meta_app_id`, `meta_app_secret`, `whatsapp_price_per_msg_eur`). Nessun dato Stripe o Google Calendar e mai salvato.

### Bug confermati

| # | Gravita | Problema |
|---|---------|----------|
| 1 | **P0** | Stripe keys (publishable, secret, webhook_secret, mode) non vengono salvate ne lette — silently dropped |
| 2 | **P0** | Google Calendar keys (client_id, client_secret) non vengono salvate ne lette |
| 3 | **P0** | Google Calendar Policies (3 toggle) non vengono salvate ne lette — i toggle appaiono sempre OFF |
| 4 | **P2** | Console warning: `ConnectionTestButton` e `GoogleCalendarPoliciesCard` ricevono refs come function components |

### Fix pianificati

#### 1. Edge Function `manage-super-admins` — Espandere whitelist

**`get-settings`** (linea 374): aggiungere tutti i campi mancanti alla query `.in("key", [...])`:
- `stripe_publishable_key`, `stripe_secret_key`, `stripe_webhook_secret`, `stripe_mode`
- `google_calendar_client_id`, `google_calendar_client_secret`
- `google_calendar_allow_two_way`, `google_calendar_allow_guest_contact_create`, `google_calendar_allow_google_to_crm_import`

Aggiungere anche masking per le chiavi segrete Stripe e Google Calendar.

**`update-settings`** (linea 401): espandere `allowedKeys` con gli stessi campi.

#### 2. Fix console warnings — `React.forwardRef`

- `ConnectionTestButton`: wrappare con `React.forwardRef` per evitare il warning quando usato come child di componenti che passano refs
- `GoogleCalendarPoliciesCard`: stesso fix

### File da modificare

| File | Azione |
|---|---|
| `supabase/functions/manage-super-admins/index.ts` | Espandere whitelist in get-settings e update-settings |
| `src/components/admin/settings/AdminSettingsIntegrations.tsx` | Aggiungere forwardRef a ConnectionTestButton e GoogleCalendarPoliciesCard |

