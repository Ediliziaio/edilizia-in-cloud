

# Security Hardening — Fase 3: Residui Finali

## Stato attuale

Il report di sicurezza e' basato su una **versione obsoleta** del codice. Le vulnerabilita' critiche sono gia' state risolte nelle sessioni precedenti:

| Vulnerabilita' dal report | Stato attuale |
|---------------------------|---------------|
| `Math.random()` per password | RISOLTO — `generateSecurePassword` con `crypto.getRandomValues()` |
| `create-customer` senza auth | RISOLTO — usa `requireAuth` + `requireRole` |
| `create-company` senza auth | RISOLTO — usa `requireAuth` + `requireRole(super_admin)` |
| `reset-customer-password` insicuro | RISOLTO — usa `generateSecurePassword` |
| Fallback XOR in encryption | RISOLTO — rimosso, solo AES-GCM |
| Header di sicurezza mancanti | PARZIALE — 38/49 funzioni usano `secureHeaders`, 11 ancora con headers locali |
| Middleware auth condiviso | RISOLTO — `_shared/auth.ts` con `requireAuth` + `requireRole` |
| Validazione input | RISOLTO — regex email + length limits su `create-customer` e `create-company` |

## Gap residui: 11 funzioni con headers locali

Queste funzioni definiscono ancora `corsHeaders` localmente, senza security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`):

| Funzione | Tipo | Auth presente? |
|----------|------|----------------|
| `google-calendar-sync` | Backend sync | Si (JWT) |
| `whatsapp-templates` | API proxy | Si (JWT) |
| `meta-health-check` | Health check + usa `serve()` deprecato | Si (JWT) |
| `auto-topup-check` | Cron/internal | No (cron) |
| `google-calendar-webhook` | Webhook esterno | N/A (callback) |
| `meta-process-leads` | Webhook/internal | N/A (callback) |
| `stripe-webhook` | Webhook esterno | N/A (Stripe signature) |
| `whatsapp-webhook` | Webhook esterno | N/A (Meta verify) |
| `telnyx-webhook` | Webhook esterno | N/A (callback) |
| `email-provider-webhook` | Webhook esterno | N/A (callback) |
| `elevenlabs-webhook` | Webhook esterno | N/A (HMAC) |

## Implementazione

### Per tutte le 11 funzioni:
- Sostituire `const corsHeaders = { ... }` con `import { corsHeaders, secureHeaders } from "../_shared/headers.ts"`
- Sostituire `{ ...corsHeaders, "Content-Type": "application/json" }` con `secureHeaders`
- Rimuovere funzioni helper locali `json()` se presenti, usare pattern diretto

### Per `meta-health-check`:
- Migrare da `serve()` deprecato a `Deno.serve()`

### Per `auto-topup-check`:
- Aggiungere protezione cron (`x-cron-secret` o JWT) come le altre funzioni cron

## File da modificare

| File | Intervento |
|------|-----------|
| `google-calendar-sync/index.ts` | Headers |
| `whatsapp-templates/index.ts` | Headers |
| `meta-health-check/index.ts` | Headers + Deno.serve() |
| `auto-topup-check/index.ts` | Headers + cron auth |
| `google-calendar-webhook/index.ts` | Headers |
| `meta-process-leads/index.ts` | Headers |
| `stripe-webhook/index.ts` | Headers |
| `whatsapp-webhook/index.ts` | Headers |
| `telnyx-webhook/index.ts` | Headers |
| `email-provider-webhook/index.ts` | Headers |
| `elevenlabs-webhook/index.ts` | Headers |

Questo completera' la migrazione al 100% delle funzioni verso gli shared security headers.

