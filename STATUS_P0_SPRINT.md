# STATUS — P0 Critical Bug Sprint (aprile 2026)

File di tracking sprint P0 critici, 7 bug risolti in ordine fisso come da
masterprompt `MASTERPROMPT-P0-Bug-Critici.docx`.

**Branch:** `fix/p0-critical-sprint-aprile-2026`
**Base:** `767708da` (origin/main — "Fix render auth for ES256 tokens")
**Start:** 2026-04-23

---

## Punch-list 7 P0

| # | Titolo | File principali | Commit | Stato |
|---|---|---|---|---|
| P0-1 | QuoteBuilder: salvataggio righe non atomico | `QuoteBuilder.tsx`, nuova migration `20260423120001_quote_items_atomic_save.sql`, `types.ts` | `0f862411` | 🟢 |
| P0-2 | Duplicazione preventivo: `parent_item_id` broken | `Preventivi.tsx` (duplicateMutation) | `5cba21e6` | 🟢 |
| P0-3 | auto-topup-check: nessun Idempotency-Key Stripe | `auto-topup-check/index.ts` (pre-check debounce 10 min + `autotopup_<company>_<YYYYMMDDHH>` header) | `57b7c66b` | 🟢 |
| P0-4 | Crediti auto-topup non atomici al pagamento | nuova migration `20260423120002_topup_outbox.sql`, `auto-topup-check/index.ts` (retry loop 3x), nuova edge `topup-outbox-recovery` | `c7d3248d` | 🟢 |
| P0-5 | `stripe.webhooks.constructEvent` sync non funziona in Deno | `stripe-webhook/index.ts` → `constructEventAsync` + `Stripe.createSubtleCryptoProvider()` | `7899882a` | 🟢 |
| P0-6 | stripe-webhook ritorna sempre 200 anche su handler fail | `stripe-webhook/index.ts` → track `handlerFailed` + 500 response per trigger Stripe retry | `06fe46dd` | 🟢 |
| P0-7 | whatsapp-webhook: SQL injection via `.or()` + trigger doppio + 200 su errore | `whatsapp-webhook/index.ts`, `process-automation/index.ts` (legacy_events matching) | `327d0e04` | 🟢 |

Legenda: ⚪ TODO 🟡 WIP 🟢 DONE 🔴 BLOCKED

---

## Baseline vs Finale

| Metrica | Prima (767708da) | Dopo (327d0e04) |
|---|---|---|
| Errori TypeScript | 0 | 0 |
| Vitest passing | 458 / 458 | 458 / 458 |
| Migration nuove | — | 2 (quote atomic save + topup outbox) |
| Edge function nuove | — | 1 (topup-outbox-recovery) |
| RPC nuove | — | 1 (`save_quote_items_atomic`) |
| Tabelle nuove | — | 1 (`topup_outbox`) |
| Bug P0 aperti | 7 | 0 |

---

## P0-1 — salvataggio righe atomico

**Problema.** `QuoteBuilder.tsx` eseguiva DELETE → INSERT → UPDATE parent_item_id
in 3 chiamate Supabase separate. Se una falliva (RLS, NaN in prezzi, timeout),
la DELETE era già committata e le righe erano perse.

**Fix.** Nuova RPC `save_quote_items_atomic(quote_id, company_id, items jsonb)`
SECURITY DEFINER in una singola transazione PL/pgSQL:

1. Check authorization (company_id match)
2. DELETE `WHERE quote_id = $1`
3. INSERT righe nuove mantenendo map `client_temp_id → uuid`
4. UPDATE parent_item_id risolvendo temp_id via map

Qualsiasi errore → ROLLBACK totale. UI chiama un'unica `.rpc()` e gestisce
un singolo errore. Pattern allineato a `create_order_atomic` esistente.

**Verify.**
```sql
-- Inserire un client_temp_id con parent_temp_id non esistente → deve fallire
-- E la quota deve mantenere le righe vecchie (rollback).
```
TSC 0 errori, vitest 458/458.

---

## P0-2 — duplicazione preventivo preserva parent/child

**Problema.** `duplicateMutation` in `Preventivi.tsx` duplicava le righe via
`spread → INSERT` ma perdeva `parent_item_id` (referenziava righe della
quota originale, cross-tenant leak se ingestito). Fallback `OFF-${year}-DUP`
su `numData` mancante → UNIQUE violation quando più utenti duplicavano
lo stesso giorno.

**Fix.**
- Uso della stessa RPC `save_quote_items_atomic` con mapping `id → client_temp_id`
  e `parent_item_id → parent_temp_id` sull'originale.
- Fail-fast su `!numData` (niente fallback: se la numerazione non c'è è un bug
  da far emergere, non da nascondere con un duplicato che collide).

**Verify.** Preventivo con righe annidate 3 livelli duplicato → mantiene
struttura ad albero; numerazione non-incrementabile → errore chiaro.

---

## P0-3 — Stripe Idempotency-Key per auto-topup

**Problema.** `auto-topup-check` creava PaymentIntent senza `Idempotency-Key`.
Se il cron si accavallava (latenza Stripe 2-3s + partenza cron ogni 60s) lo
stesso cliente riceveva 2+ addebiti sulla carta per lo stesso top-up.

**Fix.**
- Pre-check `last_topup_at < 10 min → skip` (alza la finestra di debounce da
  5 a 10 min per coprire latenza Stripe + retry interni).
- Header `Idempotency-Key: autotopup_<company_id>_<YYYYMMDDHH>` sulla POST
  `payment_intents` — granularità oraria. Stessa chiave → Stripe restituisce
  lo stesso PI invece di crearne uno nuovo.

**Verify.** `curl` manuale con stessa Idempotency-Key + Stripe CLI shows
event deduplicato, nessun double-charge.

---

## P0-4 — outbox pattern per accredito crediti atomico

**Problema.** Se la RPC `add_email_credits_with_log` falliva DOPO il charge
Stripe riuscito, il cliente aveva PAGATO ma non ricevuto i crediti. Nessun
retry, nessun alert.

**Fix.**
- Nuova tabella `topup_outbox (id, company_id, amount_eur,
  stripe_payment_intent_id UNIQUE, wallet_type, status
  CHECK('pending'|'credited'|'failed'), retry_count, last_error,
  created_at, credited_at, alerted_at)` + RLS super_admin SELECT + indice
  parziale su righe processable.
- `auto-topup-check` dopo charge OK → INSERT outbox `pending` → retry loop
  3× con backoff 500/1000/1500 ms → on success: `UPDATE status='credited'`
  + `last_topup_at`. On failure: `UPDATE status='failed' retry_count=3`.
- Nuova edge `topup-outbox-recovery` (cron 5 min): prende max 50 righe
  `failed` con `retry_count<10`, 1 tentativo per turno. Se `retry_count>=10`
  → alert email ai super_admin via `sendEmailUnified` + mark `alerted_at`.

**Verify.** Postgres momentaneamente in failure → PI carica → outbox `pending`
→ primo tentativo fallisce → cron lo ripiglia → `credited`. Alert admin
inviato se tutti i retry falliscono.

---

## P0-5 — webhook Stripe: verifica firma async in Deno

**Problema.** `stripe.webhooks.constructEvent()` (sync) in Deno lanciava
`subtle is not defined` o degradava silenziosamente, perché l'implementazione
Node usa `require('crypto').createHmac()`. Risultato: firma non verificata,
webhook accettava qualsiasi payload.

**Fix.** Migrato a:
```ts
event = await stripe.webhooks.constructEventAsync(
  body, signature, webhookSecret,
  undefined, // default tolerance 300s
  Stripe.createSubtleCryptoProvider(),
);
```

Via ufficialmente supportata da Stripe per runtime Deno/Cloudflare Workers.

**Verify.** Test con signature invalida → 400; con signature valida → event
parsato correttamente.

---

## P0-6 — webhook Stripe: 500 su handler fail

**Problema.** Il webhook restituiva sempre 200 `{received:true}` anche se
il handler interno (`handleCheckoutCompleted`, `handleInvoicePaid`, etc.)
lanciava un errore. Stripe marcava consegnato, non ri-consegnava mai,
e il sistema restava in stato inconsistente (abbonamento non attivato,
crediti non accreditati, referral non attribuito).

**Fix.** Track `handlerFailed` + `handlerError`. Se il try/catch attorno
allo switch cattura un errore, ritorna `500 {received:false, error}`.
Stripe ritenta con backoff esponenziale (fino a ~3 giorni). L'idempotency
check al line 576-588 filtra per `status='processed'` (non per
`stripe_event_id` esistente), quindi un evento in `status='error'` viene
riprocessato sul retry. Log `stripe_events_log` include sempre lo stato
dell'ultimo tentativo.

**Verify.** Throw forzato nel handler → 500 + row in `stripe_events_log`
status=error. Successivo retry Stripe → handler ora OK → row updatata a
status=processed, risposta 200.

---

## P0-7 — whatsapp-webhook: sanitizzazione phone + consolidamento trigger + 500 su errore

**Tre fix correlati sullo stesso file:**

1. **SQL injection via `.or()` DSL.** `msg.from` (payload Meta non fidato)
   veniva interpolato in `.or("phone.eq.${senderPhone},phone.eq.+${senderPhone}")`.
   Un attaccante con webhook valido (se META_APP_SECRET trapela) poteva
   forgiare `from` con sintassi PostgREST tipo
   `"39348,phone.eq.OTHER,phone.eq."` e bypassare il filtro company_id.
   **Fix.** Sanitizzo a `[0-9]+`, uso `.in("phone", [digits, "+digits"])`
   che PostgREST parametrizza correttamente. Se il sanitize produce stringa
   vuota → skip trigger + warning log.

2. **Trigger event duplicato.** Inserivamo 2 righe in
   `automation_trigger_events` (`whatsapp_received` + `customer_replied`).
   Flussi configurati su entrambi i trigger → enrollment duplicate, azioni
   eseguite 2 volte.
   **Fix.** 1 insert con `trigger_event='whatsapp_received'` + payload
   `legacy_events: ["customer_replied"]`. `process-automation/index.ts`
   ora matcha anche su `legacy_events` oltre all'uguaglianza stretta —
   flussi `customer_replied` continuano a funzionare senza breaking.

3. **Always 200 su errore.** `catch { console.error(); return 200 }`.
   Meta considerava consegnato anche su crash → nessun retry.
   **Fix.** Track `webhookFailed`, ritorna 500 → Meta ritenta con backoff
   (15 min → 1h → 6h → 24h). La guard idempotency su
   `whatsapp_messages.wa_message_id` previene double-processing nei retry.

**Verify.** Forge `msg.from="123,phone.eq.other"` → phone filtrato a
`"123"`, nessun leak; handler crash → 500 response; retry Meta →
messaggio skippato via idempotency.

---

## Gate di commit rispettato

Prima di ogni commit:
- `bunx tsc --noEmit` → **0 errori**
- `bunx vitest run` → **458 / 458 passed**
- Revisione diff (nessun `console.log` di debug, nessun TODO nuovo).

Errori ESLint `@typescript-eslint/no-explicit-any` presenti nei file
`stripe-webhook/index.ts` (8 pre-esistenti), `process-automation/index.ts`
(63 pre-esistenti), `whatsapp-webhook/index.ts` (0 nuovi): verificati via
`git stash` pre-change → errori presenti anche prima delle modifiche, NON
introdotti da questo sprint. Rientrano nel debito tecnico storico
documentato.

---

## Deploy checklist

Le modifiche comprendono migration DB + edge function nuove. Deploy ordine:

1. **Migration 20260423120001** (`save_quote_items_atomic` RPC)
   ```bash
   supabase db push
   ```
2. **Migration 20260423120002** (`topup_outbox` tabella)
   ```bash
   supabase db push
   ```
3. **Edge function topup-outbox-recovery** (nuova)
   ```bash
   supabase functions deploy topup-outbox-recovery --no-verify-jwt
   ```
   Schedulare cron esterno (GitHub Actions / Supabase Cron) ogni 5 min:
   ```
   curl -X POST "<supabase_url>/functions/v1/topup-outbox-recovery" \
        -H "x-cron-secret: $CRON_SECRET"
   ```
4. **Edge function auto-topup-check** (modificata)
   ```bash
   supabase functions deploy auto-topup-check
   ```
5. **Edge function stripe-webhook** (modificata)
   ```bash
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
6. **Edge function whatsapp-webhook** (modificata)
   ```bash
   supabase functions deploy whatsapp-webhook --no-verify-jwt
   ```
7. **Edge function process-automation** (modificata — legacy_events support)
   ```bash
   supabase functions deploy process-automation
   ```

Ordine di deploy critico: topup-outbox tabella → auto-topup (usa la tabella)
→ topup-outbox-recovery. Le altre sono indipendenti.

---

## Verdetto finale

🟢 **7/7 P0 chiusi.** Baseline tecnica finale:
- TSC: **0 errori**
- Vitest: **458 / 458 verdi**
- 2 migration idempotenti (IF NOT EXISTS / DROP POLICY IF EXISTS)
- 1 RPC nuova con SECURITY DEFINER + authorization check
- 1 edge function cron nuova
- 2 edge function modificate (auto-topup, stripe-webhook) + 2 sicurezza
  (whatsapp-webhook, process-automation)
- Zero breaking changes su API pubblica (la RPC `save_quote_items_atomic`
  è additiva; Preventivi/QuoteBuilder gestiscono la nuova superficie
  internamente).

Sprint pronto per deploy su staging.
