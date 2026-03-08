

# Piano: Security Hardening — Fase 2 (Residui)

## Stato attuale post-hardening precedente

La sessione precedente ha gia' completato i fix critici:
- **`_shared/auth.ts`**: `requireAuth` + `requireRole` — FATTO
- **`_shared/securePassword.ts`**: `crypto.getRandomValues()` — FATTO
- **`_shared/headers.ts`**: `secureHeaders` con X-Frame-Options, X-Content-Type-Options, Referrer-Policy — FATTO
- **`_shared/encryption.ts`**: XOR fallback rimosso, solo AES-GCM — FATTO
- **`create-customer`**: auth + secure password + validation — FATTO
- **`create-company`**: auth (super_admin) + validation — FATTO
- **`create-company-staff`**: secure password — FATTO
- **`reset-customer-password`**: secure password — FATTO

## Gap residui identificati

| # | File | Problema |
|---|------|----------|
| 1 | `generate-landing-image` | Zero auth. Chiunque puo' generare immagini AI consumando crediti. Usa `serve()` deprecato. |
| 2 | `ticket-notify` | Zero auth. Chiunque puo' triggherare notifiche email. Usa service role senza verifica. |
| 3 | `check-due-dates` | Zero auth (cron-like). Accettabile se invocato solo da cron, ma manca protezione. |
| 4 | `check-lifecycle-events` | Zero auth (cron-like). Stessa situazione. |
| 5 | `check-scheduled-triggers` | Zero auth (cron-like). |
| 6 | `process-automation` | `Math.random()` in `executeSplit()` — non critico per sicurezza (A/B split) ma segnalato. |
| 7 | ~41 funzioni | Usano `corsHeaders` locali senza security headers (`X-Frame-Options`, etc.) |

## Implementazione

### Fix 1 — `generate-landing-image`: Aggiungere auth + migrare a Deno.serve
- Importare `requireAuth` da `_shared/auth.ts`
- Importare `corsHeaders, secureHeaders` da `_shared/headers.ts`
- Sostituire `serve()` deprecato con `Deno.serve()`
- Richiedere JWT valido prima di processare

### Fix 2 — `ticket-notify`: Aggiungere auth
- Importare `requireAuth` da `_shared/auth.ts`
- Importare headers da `_shared/headers.ts`
- Verificare JWT prima di processare la notifica

### Fix 3-5 — Funzioni cron (`check-due-dates`, `check-lifecycle-events`, `check-scheduled-triggers`): Protezione leggera
- Queste funzioni sono invocate internamente (cron/scheduler). Aggiungere verifica opzionale: accettare un header `x-cron-secret` dalla variabile d'ambiente oppure un JWT valido.
- Migrare a `_shared/headers.ts` per security headers

### Fix 6 — `process-automation`: Math.random → crypto
- Sostituire `Math.random()` con `crypto.getRandomValues()` nella funzione `executeSplit()`

### Fix 7 — Migrazione bulk di ~41 funzioni ai shared headers
- Sostituire le definizioni locali di `corsHeaders` con import da `_shared/headers.ts`
- Sostituire `{ ...corsHeaders, "Content-Type": "application/json" }` con `secureHeaders`
- Questa e' un'operazione ripetitiva su molti file. La eseguo per le funzioni piu' critiche (quelle con auth e dati sensibili) in questa sessione.

**Funzioni prioritarie per migrazione headers** (gestiscono dati sensibili o azioni privilegiate):
- `create-super-admin`, `create-salesperson-user`, `create-employee-user`, `delete-company-user`
- `manage-super-admins`, `sign-in-as-user`
- `send-email-campaign`, `send-contact-message`, `send-test-email`
- `whatsapp-broadcast`, `whatsapp-connect`, `whatsapp-status`, `send-whatsapp-reply`
- `elevenlabs-proxy`, `check-credits-before-call`, `topup-credits`
- `maps-proxy`, `meta-api-proxy`, `meta-oauth-start`
- `create-checkout-session`, `analyze-message`
- `telnyx-proxy`, `initiate-outbound-call`
- `google-calendar-auth`, `suggest-calendars`
- `generate-recurring-costs`, `check-api-health`

## File da modificare

| File | Fix |
|------|-----|
| `generate-landing-image/index.ts` | 1 |
| `ticket-notify/index.ts` | 2 |
| `check-due-dates/index.ts` | 3 |
| `check-lifecycle-events/index.ts` | 4 |
| `check-scheduled-triggers/index.ts` | 5 |
| `process-automation/index.ts` | 6 (1 riga) |
| ~30 funzioni | 7 (migrazione headers) |

## Nota
- Le funzioni webhook (`stripe-webhook`, `whatsapp-webhook`, `telnyx-webhook`, `meta-webhook`, `email-provider-webhook`, `email-tracking`, `meta-oauth-callback`, `google-calendar-webhook`) restano pubbliche — sono callback esterni.
- `create-super-admin` usa gia' bootstrap key — OK, migro solo gli headers.
- `config.toml` non viene toccato (`verify_jwt = false` richiesto da Lovable Cloud).

