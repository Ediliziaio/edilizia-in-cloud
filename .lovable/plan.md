

# Audit Tecnico Billing — Edilizia in Cloud

## FASE 1: Bug e Problemi Identificati

### CRITICI (P0)

| # | Area | Bug | Impatto |
|---|------|-----|---------|
| 1 | **Test connessione** | Frontend invia `action` nel body (`{ action: "test_connection", provider }`) ma `billing-connect` legge `action` solo da query string (`url.searchParams.get("action")`). Il body viene ignorato → test connessione **sempre fallisce** (ritorna `{ error: "Unknown action" }`) | Funzionalita rotta |
| 2 | **Webhook senza autenticazione** | `billing-webhook` accetta qualsiasi richiesta POST senza verificare firma, secret o origin. Chiunque puo aggiornare lo stato delle fatture | Sicurezza critica |
| 3 | **"Segna come pagata" non aggiorna invoice** | `markPaidMutation` inserisce un record in `invoice_payments` ma non aggiorna `invoices.paid_amount`, `invoices.payment_date` ne `invoices.status`. Dashboard e lista fatture vedono la fattura ancora non pagata | Coerenza dati |
| 4 | **Import error: no error logging** | Il `catch` in `billing-import` non aggiorna `billing_integrations.last_sync_status` a "error" ne scrive in `billing_sync_log` — dopo un errore lo stato resta ambiguo | Diagnostica impossibile |
| 5 | **Import: righe orfane su errore parziale** | `delete invoice_lines` + `insert invoice_lines` non e atomico. Se l'insert fallisce, le righe vengono perse senza recovery | Integrita dati |

### MEDI (P1)

| # | Area | Problema |
|---|------|----------|
| 6 | **Add provider bypass server** | Frontend salva direttamente in `billing_integrations` senza validazione server (no test API key). Possibile creare integrazioni "attive" con credenziali invalide |
| 7 | **Set primary non atomico** | `billing-connect` `set_primary`: due query separate (`UPDATE is_primary=false` + `UPDATE is_primary=true`). Se la seconda fallisce, nessun provider resta primario |
| 8 | **billing-import: column mismatch** | Import scrive `details` nel log ma il tipo corretto e `response_payload` (tipo Json) — probabilmente fallisce silenziosamente o il campo viene ignorato |
| 9 | **billing-sync: provider selection** | `billing-sync` usa `is_primary` + fallback su qualsiasi attivo con `limit(1)` senza `order()` — selezione non deterministica |

## FASE 2: Piano Correzioni

### Fix 1: Test connessione — allineare frontend/backend
**File:** `supabase/functions/billing-connect/index.ts`
- Leggere `action` sia da query string che dal body JSON come fallback
- Il backend gia gestisce `test_connection` con POST + body `{ provider }`, basta che legga anche `action` dal body

### Fix 2: Webhook signature verification
**File:** `supabase/functions/billing-webhook/index.ts`
- Aggiungere verifica del secret `BILLING_WEBHOOK_SECRET` tramite query param o header
- Loggare tentativi non autorizzati in `billing_sync_log` con status "rejected"
- Se il secret non e configurato, accettare (backward compatible) ma loggare warning

### Fix 3: Trigger DB per coerenza pagamenti
**Database migration:** Creare trigger `trg_update_invoice_on_payment` su `invoice_payments` (INSERT/DELETE)
- Calcola `SUM(amount)` da `invoice_payments` per l'invoice
- Aggiorna `invoices.paid_amount` e `invoices.payment_date` (data ultimo pagamento)
- Se `paid_amount >= total` → `status = 'paid'`
- Se `paid_amount > 0 AND paid_amount < total` → mantieni status corrente (parziale)
- Gestisce anche DELETE per reverse

### Fix 4: Error logging in billing-import
**File:** `supabase/functions/billing-import/index.ts`
- Nel catch: aggiornare `billing_integrations` con `last_sync_status: "error"` e `last_sync_error`
- Inserire record in `billing_sync_log` con status "error" e `error_message`
- Richiede accesso a `companyId` e `provider` nel catch — ristrutturare per renderli disponibili

### Fix 5: Atomicita update righe fattura
**File:** `supabase/functions/billing-import/index.ts`
- Wrappare delete+insert righe in una RPC atomica, oppure: se l'insert righe fallisce, re-inserire le vecchie righe (compensazione)
- Approccio pragmatico: inserire prima le nuove righe con un batch, e solo se l'insert riesce, eliminare le vecchie. Alternativa: usare upsert con `invoice_id + sort_order` come chiave

### Fix 6: Validazione server-side per add provider
**File:** `src/pages/azienda/settings/SettingsBilling.tsx`
- Cambiare `addMutation` per invocare `billing-connect?action=configure_apikey` (o `configure_aruba`) invece di inserire direttamente nel DB
- Il backend gia esiste e valida le credenziali prima di salvare

### Fix 7: Set primary atomico
**File:** `supabase/functions/billing-connect/index.ts`
- Usare una RPC o invertire l'ordine: prima set `is_primary=true` sul nuovo, poi set `is_primary=false` sugli altri (escludendo il nuovo)

### Fix 8: Fix billing_sync_log column name
**File:** `supabase/functions/billing-import/index.ts`
- Cambiare `details` → `response_payload` per allinearsi allo schema `billing_sync_log`
- Aggiungere `direction: "pull"` che e required

### Fix 9: Provider selection deterministica
**File:** `supabase/functions/billing-sync/index.ts`
- Aggiungere `.order("created_at", { ascending: true })` al fallback per garantire selezione deterministica

---

## File modificati (totale: 5)

| File | Modifiche |
|------|-----------|
| `supabase/functions/billing-connect/index.ts` | Fix action read (body fallback), set_primary atomico |
| `supabase/functions/billing-import/index.ts` | Error logging, column fix, atomicita righe |
| `supabase/functions/billing-webhook/index.ts` | Signature verification |
| `supabase/functions/billing-sync/index.ts` | Deterministic provider selection |
| `src/pages/azienda/settings/SettingsBilling.tsx` | Server-side validation per add provider |
| **DB Migration** | Trigger `trg_update_invoice_on_payment` per coerenza `paid_amount`/`status` |

## Rischi e mitigazioni

- **Trigger DB**: opera solo su INSERT/DELETE di `invoice_payments`, non tocca logica esistente di import o sync
- **Webhook secret**: backward compatible — se `BILLING_WEBHOOK_SECRET` non e configurato, il webhook continua a funzionare (con warning nel log)
- **Frontend add provider**: la UX resta identica, solo il backend cambia da insert diretto a invocazione edge function

