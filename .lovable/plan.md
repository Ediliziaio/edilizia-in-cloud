

# Audit — Preventivi, Quote Builder, Quote Detail

## Bug trovati

### Bug 1 (P1): Builder save non invalida cache Detail — dati stale dopo modifica
**File:** `src/pages/azienda/marketing/QuoteBuilder.tsx`, riga 430

Dopo il salvataggio, il builder invalida `["quotes"]` che prefix-matcha la lista `["quotes", companyId]`. Ma la query key del dettaglio è `["quote", quoteId]` (definita da `queryKeys.quotes.detail(id)`). `["quotes"]` NON è un prefisso di `["quote", id]` ("quotes" ≠ "quote").

Quando l'utente modifica un preventivo e salva, il builder naviga a `QuoteDetail` (riga 432). Il dettaglio usa il dato in cache stale — il totale, le righe, i dati cliente restano quelli pre-modifica fino a un refresh manuale.

**Fix:** Dopo il salvataggio, invalidare anche `queryKeys.quotes.detail(quoteId)` e `queryKeys.quotes.items(quoteId)`.

---

### Bug 2 (P1): Query key lista disallineata dalla factory
**File:** `src/pages/azienda/marketing/Preventivi.tsx`, riga 72

La lista usa `queryKey: ["quotes", companyId]`. La factory definisce `quotes.list(companyId)` = `["quotes", "list", companyId]`. Sono due chiavi diverse. Se qualsiasi modulo futuro invalida tramite `queryKeys.quotes.list(companyId)`, la lista non viene refreshata. Vanno allineati.

**Fix:** Migrare la lista a `queryKeys.quotes.list(companyId)`. Aggiornare le invalidazioni in `deleteMutation`, `duplicateMutation` a usare `queryKeys.quotes.all`.

---

### Bug 3 (P1): Lista usa `select("*")` — performance degradata
**File:** `src/pages/azienda/marketing/Preventivi.tsx`, riga 77

La query carica TUTTE le colonne della tabella `quotes` (incluso `html_content`, `signature_token`, dati firma, etc.) solo per mostrare 6 campi nella tabella e calcolare 4 KPI. Per aziende con molti preventivi, questo trasferisce dati inutili.

**Fix:** Usare `.select("id, quote_number, client_name, title, status, total, created_at")`.

---

### Bug 4 (P1): Duplicazione in Preventivi clona `created_by` originale
**File:** `src/pages/azienda/marketing/Preventivi.tsx`, riga 103

La destrutturazione esclude campi firma/date, ma NON `created_by`. Il preventivo duplicato mantiene il `created_by` dell'originale — se un utente A duplica un preventivo creato da B, il clone risulta creato da B. Inoltre `contact_id` viene copiato senza verifica.

**Fix:** Sovrascrivere `created_by` con l'utente corrente nel payload.

---

### Bug 5 (P2): No company_id filter su QuoteBuilder e QuoteDetail
**File:** `QuoteBuilder.tsx` righe 167-171, `QuoteDetail.tsx` righe 66-71

Le query caricano preventivi solo per `id` senza `.eq("company_id", ...)`. Defense-in-depth mancante — un utente con accesso potrebbe visualizzare/modificare preventivi di un'altra azienda se indovinasse l'UUID.

**Fix:** Aggiungere `.eq("company_id", companyId)` dove il context è disponibile.

---

### Bug 6 (P2): Builder usa query keys inline
**File:** `src/pages/azienda/marketing/QuoteBuilder.tsx`

Usa `["quote", id]`, `["quote-items", id]`, `["quote-attachments", id]`, `["marketing-contacts", companyId]`, `["article-templates", companyId]`, `["quote-pdf-materials", companyId]` — nessuna dalla factory.

**Fix:** Migrare a `queryKeys.quotes.detail(id)`, `queryKeys.quotes.items(id)`, etc.

---

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/pages/azienda/marketing/Preventivi.tsx` | Optimized select + query keys factory + fix created_by in duplicazione | Performance / Cache / Dati |
| `src/pages/azienda/marketing/QuoteBuilder.tsx` | Invalidare detail+items dopo save + company_id filter + query keys factory | Cache / Sicurezza |
| `src/pages/azienda/marketing/QuoteDetail.tsx` | company_id filter sulla query | Sicurezza |

3 file, 6 bug. Nessun cambio UX. Backward-compatible.

