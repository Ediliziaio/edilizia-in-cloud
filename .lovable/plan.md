

# Analisi Corretto Funzionamento — Modulo Preventivi

Ho analizzato tutte le componenti del modulo (DB, frontend, edge functions) e ho trovato **diversi problemi critici** che impediscono il funzionamento corretto. Ecco il riepilogo:

---

## Bug Critici (impediscono il funzionamento)

### 1. Column mismatch: `pdf_url` vs `pdf_storage_path`
- **DB** ha la colonna `pdf_storage_path`
- **Edge functions** (`generate-quote-pdf`, `quote-sign`) usano `pdf_url` che **non esiste**
- Il PDF non viene salvato nel DB e non viene mostrato nella pagina firma
- **Fix**: Aggiornare le edge functions per usare `pdf_storage_path`

### 2. Column mismatch: `valid_until` vs `expires_at`
- **DB** ha la colonna `expires_at`
- **Edge functions** (`quote-sign`, `send-quote-signature`, `generate-quote-pdf`) usano `valid_until` che **non esiste**
- Il check scadenza non funziona, la data validità non appare nell'email ne nel PDF
- **Fix**: Aggiornare le edge functions per usare `expires_at`

### 3. Column mismatch: `file_path` vs `storage_path` (quote_pdf_materials)
- **DB** ha `storage_path`
- **Edge function** `generate-quote-pdf` seleziona `file_path` che **non esiste**
- I PDF allegati non vengono mai incorporati nel documento generato
- **Fix**: Aggiornare la select nella edge function a `storage_path`

### 4. `expires_at` mai calcolata
- Il `QuoteBuilder` salva `validity_days` ma non calcola `expires_at` (data effettiva di scadenza)
- L'edge function `quote-sign` controlla `expires_at` per la scadenza, ma è sempre `NULL`
- I preventivi non scadono mai
- **Fix**: Calcolare `expires_at = now() + validity_days * interval '1 day'` nel QuoteBuilder (o meglio con un trigger DB)

### 5. Storage policies mancanti
- I bucket `quote-materials` e `quote-pdfs` esistono ma **non hanno policy RLS**
- Gli upload/download dei PDF falliranno con errore 403 per gli utenti autenticati
- Le edge functions usano `service_role` quindi funzionano, ma il frontend (SettingsQuoteMaterials) usa il client anon
- **Fix**: Creare policy per upload/read/delete sui bucket

---

## Bug Minori (funzionamento parziale)

### 6. Duplicazione preventivo — colonne inesistenti nello spread
- In `Preventivi.tsx` la destructuring include `pdf_storage_path` (OK) ma non gestisce `expires_at` — la duplica includerà una data di scadenza vecchia
- **Fix**: Aggiungere `expires_at` alla destructuring e ricalcolarla

### 7. Edge function `send-quote-signature` — riferimento a `quote.total`
- La colonna `total` nel DB è di tipo `numeric`, non `number` — `toFixed(2)` dovrebbe funzionare ma il valore arriva come stringa da Supabase
- Rischio minore, ma meglio fare un cast: `Number(quote.total || 0).toFixed(2)`

### 8. QuoteSignPage — errori silenziosi
- I `catch` nei handler `handleSign` e `handleRefuse` sono vuoti — l'utente non vede mai un messaggio di errore
- **Fix**: Aggiungere `toast.error` o un messaggio visivo

---

## Piano di Fix

### Migration SQL
- Creare storage policies per `quote-materials` e `quote-pdfs`
- Opzionalmente: trigger per calcolare `expires_at` automaticamente da `validity_days`

### Edge Functions (3 file)
- `generate-quote-pdf`: `pdf_url` → `pdf_storage_path`, `valid_until` → `expires_at`, `file_path` → `storage_path`
- `send-quote-signature`: `valid_until` → `expires_at`
- `quote-sign`: `pdf_url` → `pdf_storage_path`, `valid_until` → `expires_at`

### Frontend (3 file)
- `QuoteBuilder.tsx`: calcolare `expires_at` nel save
- `Preventivi.tsx`: aggiungere `expires_at` alla destructuring nella duplicazione
- `QuoteSignPage.tsx`: aggiungere error handling nei catch

