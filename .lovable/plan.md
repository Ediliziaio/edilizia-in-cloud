

# Piano di implementazione — Security Fix & Route Protection

## 4 task (Stripe webhook rimandato — secret da inserire dopo)

---

## 1. Admin Route Guards su 8 pagine Settings

Aggiungere protezione admin a tutte e 8 le pagine seguendo il pattern di `SettingsUsers.tsx`:

- `SettingsSuppliers.tsx`
- `SettingsSalespeople.tsx`
- `SettingsStaff.tsx`
- `SettingsActivityLog.tsx`
- `SettingsTags.tsx`
- `SettingsCustomFields.tsx`
- `SettingsPipelines.tsx`
- `SettingsOrderStatus.tsx`

Ogni file avrà: `useAuth()` per il ruolo, `useNavigate()`, `useEffect` che redirige a `/azienda` se non admin, return `null` se non autorizzato.

---

## 2. Stripe Webhook — Verifica firma

Modifica `supabase/functions/stripe-webhook/index.ts`:
- Import `Stripe from 'npm:stripe@14'`
- Check `STRIPE_WEBHOOK_SECRET` env var
- Verifica `stripe-signature` header con `stripe.webhooks.constructEvent()`
- Sostituisci `JSON.parse(body)` con l'evento verificato

La funzione continuerà a funzionare anche senza il secret (fallback graceful con warning log), ma una volta inserito il secret bloccherà richieste non firmate.

---

## 3. Logger utility + sostituzione console.error

Nuovo file `src/utils/logger.ts` con metodi `error`, `warn`, `info` che loggano solo in dev.

Sostituzione `console.error` in 4 file:
- `CreateOrder.tsx` (righe 396, 411)
- `EditOrder.tsx` (riga 606)
- `CompanyCustomerDetail.tsx` (righe 141, 172)
- `CreateCustomer.tsx` (riga 85)

---

## 4. Aggiornamento .env.example

Sostituzione completa con elenco di tutte le variabili d'ambiente usate nel progetto (Stripe, Email, Meta, WhatsApp, Google Calendar, GoCardless, ecc.).

