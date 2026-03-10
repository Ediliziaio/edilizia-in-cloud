

# Audit — Facebook Forms (Lead Ingestion, Dedup, CRM Sync)

## Bug trovati

### Bug 1 (P0): normalizePhone regex rotto — backslash doppio
**File:** `supabase/functions/meta-process-leads/index.ts`, riga 350
```javascript
let normalized = phone.replace(/[^\\d+]/g, "");
```
Il doppio backslash `\\d` in un regex literal diventa il pattern letterale `\d` (backslash + d), non la classe digit. Il regex rimuove tutto tranne `\`, `d` e `+`. Un numero come `+39 333 1234567` diventa `+dd` — il telefono è completamente corrotto. Tutti i contatti importati da Meta hanno numeri di telefono invalidi, la deduplica per telefono non funziona mai, e i contatti duplicati vengono creati ad ogni retry/backfill.

**Fix:** Cambiare in `/[^\d+]/g` (singolo backslash).

### Bug 2 (P1): Backfill payload usa `formId` invece di `form_id`
**File:** `src/pages/azienda/marketing/FacebookFormsPage.tsx`, riga 114
```javascript
body: JSON.stringify({ action: "backfill-leads", formId }),
```
Ma la Edge Function `meta-api-proxy` (riga 168) destruttura:
```javascript
const { form_id: bfFormId, mode, since_date } = body;
```
Il campo `formId` non matcha `form_id`. `bfFormId` è sempre `undefined`, causando un errore 400 ("form_id required"). Il backfill dalla UI non funziona mai.

**Fix:** Cambiare il payload in `{ action: "backfill-leads", form_id: formId, company_id: companyId, integration_id: integration.id }`.

### Bug 3 (P1): Backfill upsert usa `onConflict: "company_id,event_id"` — manca `provider`
**File:** `supabase/functions/meta-api-proxy/index.ts`, riga 224
```javascript
{ onConflict: "company_id,event_id" }
```
Ma il webhook (riga 107) usa `onConflict: "company_id,provider,event_id"`. Se il DB ha un unique constraint su 3 colonne, il backfill upsert con solo 2 colonne non trova il match e crea duplicati. I lead backfillati vengono processati due volte.

**Fix:** Allineare a `{ onConflict: "company_id,provider,event_id" }`.

### Bug 4 (P1): Lead count query nella UI non filtra per status
**File:** `src/pages/azienda/marketing/FacebookFormsPage.tsx`, righe 59-64
La query conta TUTTI gli webhook events (pending, processed, failed). Mostra come "lead totali" anche eventi che sono falliti e non hanno creato alcun contatto nel CRM. Numero fuorviante.

**Fix:** Aggiungere `.eq("status", "processed")` alla query.

### Bug 5 (P1): Backfill non passa `company_id` e `integration_id` nel body
**File:** `src/pages/azienda/marketing/FacebookFormsPage.tsx`, riga 114
Il body contiene solo `action` e `formId`. Ma `meta-api-proxy` richiede `company_id` e `integration_id` (riga 39). Il proxy risponde 400 prima ancora di arrivare al case "backfill-leads".

**Fix:** Includere `company_id` e `integration_id` nel body della request.

### Bug 6 (P2): Query keys inline, non nella factory
`FacebookFormsPage.tsx` usa `["meta-integration-forms"]`, `["meta-lead-forms"]`, `["meta-form-lead-counts"]`, `["meta-pages"]` — nessuna è nella factory `queryKeys.ts`.

**Fix:** Aggiungere sezione `metaForms` nella factory e migrare gli usi.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `supabase/functions/meta-process-leads/index.ts` | Fix regex `normalizePhone` (backslash doppio) | Corruzione dati |
| `src/pages/azienda/marketing/FacebookFormsPage.tsx` | Fix backfill payload (`form_id` + `company_id` + `integration_id`) + filtrare lead count per `status: "processed"` + migrare query keys | Funzionalita / Dati |
| `supabase/functions/meta-api-proxy/index.ts` | Allineare `onConflict` backfill a 3 colonne | Idempotenza |
| `src/lib/queryKeys.ts` | Aggiungere sezione `metaForms` | Standard |

4 file, 6 bug. Nessun cambio UX. Backward-compatible.

