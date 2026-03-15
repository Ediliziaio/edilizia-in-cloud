

## Analisi Integrazioni Super Admin — Bug Trovati (UNIF-INTEG-02)

### Stato attuale dopo UNIF-INTEG-01

La whitelist nel backend `manage-super-admins` e stata espansa correttamente. Il salvataggio e la lettura delle impostazioni per Meta, Google Calendar, Google Maps, WhatsApp e Stripe funzionano nel pannello Integrazioni. Le policy Google Calendar vengono salvate e lette correttamente.

### Bug critico scoperto: Stripe non usa `platform_settings`

Tutte le 5 Edge Functions Stripe leggono **esclusivamente** da `Deno.env.get("STRIPE_SECRET_KEY")` e NON da `platform_settings`:

| Edge Function | Legge da DB? | Legge da ENV? |
|---|---|---|
| `create-checkout-session` | NO | SI |
| `stripe-webhook` | NO | SI |
| `customer-portal` | NO | SI |
| `admin-change-plan` | NO | SI |
| `auto-topup-check` | NO | SI |
| `test-integration` | SI | SI (fallback) |

**Risultato**: Il super admin salva le chiavi Stripe dalla UI, il "Testa connessione" funziona (usa DB), ma i pagamenti reali falliscono perche le funzioni operative leggono solo da env. Falsa conferma di funzionamento.

In contrasto, Google Calendar, Google Maps (`maps-proxy`), ElevenLabs e Email usano tutti `getPlatformSetting()` correttamente.

### Fix pianificati

#### 1. Stripe Edge Functions — Usare `getPlatformSetting()` (P0)

Aggiornare le 5 funzioni Stripe per leggere la chiave da `platform_settings` con fallback env, come gia fanno tutte le altre integrazioni:

```typescript
// Prima (bug):
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

// Dopo (fix):
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
```

Stesso fix per `STRIPE_WEBHOOK_SECRET` in `stripe-webhook`:
```typescript
const webhookSecret = await getPlatformSetting("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET");
```

#### 2. `stripe-webhook` — Anche il webhook secret (P0)

Il webhook verifica la firma con `STRIPE_WEBHOOK_SECRET` da env. Va aggiornato per leggere da `platform_settings` con fallback env.

### File da modificare

| File | Azione |
|---|---|
| `supabase/functions/create-checkout-session/index.ts` | Usare `getPlatformSetting` per stripe_secret_key |
| `supabase/functions/stripe-webhook/index.ts` | Usare `getPlatformSetting` per stripe_secret_key e stripe_webhook_secret |
| `supabase/functions/customer-portal/index.ts` | Usare `getPlatformSetting` per stripe_secret_key |
| `supabase/functions/admin-change-plan/index.ts` | Usare `getPlatformSetting` per stripe_secret_key |
| `supabase/functions/auto-topup-check/index.ts` | Usare `getPlatformSetting` per stripe_secret_key |

### Nessun bug riscontrato in

- Salvataggio/lettura di tutte le integrazioni nella UI admin
- Google Calendar OAuth e policies (usano `getPlatformSetting` correttamente)
- Google Maps proxy (usa `getPlatformSetting` correttamente)
- ElevenLabs (usa `getPlatformSetting` correttamente)
- Email marketing/transazionale (pagina dedicata, usa `getPlatformSetting` correttamente)
- RLS su `platform_settings` (solo super_admin puo leggere/scrivere)

