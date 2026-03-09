

# Piano V2 Tesoreria — Gap Analysis e Implementazione

Il documento V2 migliora il modulo Tesoreria già implementato con correzioni di sicurezza, un helper condiviso, categorizzazione avanzata, scadenza connessioni e sync schedulata. Ecco cosa manca:

---

## Gap identificati (V2 vs implementazione attuale)

| Gap | Dettaglio |
|---|---|
| **Shared helper `goCardless.ts`** | V2 richiede `_shared/goCardless.ts` con `getGoCardlessToken()` e `gcFetch()` con retry automatico su 401. Attualmente ogni edge function duplica il codice token. |
| **`categorizeTransaction` migliorata** | V2 ha regex più ricchi (assicurazioni, ristorazione, trasferte, SALARIO, PAGA, etc.). Attuale ha solo 6 pattern basici. |
| **`expires_at` su `bank_connections`** | V2 richiede colonna `expires_at` (90gg da creazione) + indice + banner scadenza UI. Manca nel DB attuale. |
| **Redirect URL validation** | V2 richiede validazione server-side dell'origin in `bank-connect-start`. Attualmente nessuna validazione. |
| **`is_case_sensitive` su `bank_categorization_rules`** | Colonna mancante nella tabella. |
| **RPC `get_treasury_summary` corretta** | V2 usa subquery separate senza GROUP BY (l'attuale usa JOIN + GROUP BY che può dare risultati errati con 0 conti). |
| **Banner scadenza connessioni** | UI: banner arancione se scade entro 15gg, rosso se scaduta. Non presente. |
| **Categorie badge aggiornate** | V2 aggiunge: Assicurazioni (blue), Ristorazione (pink), Trasferte (cyan), Entrata (green). Mancano nel `TransactionsFeed`. |
| **Rate limiting 500ms tra account** | V2 richiede delay 500ms tra sync di account diversi. Non presente. |
| **Pending transactions** | V2 processa anche `txData.transactions.pending` oltre a `booked`. Attuale processa solo `booked`. |
| **PROMPT 7: `bank-sync-all-companies`** | Edge function per sync schedulata di tutte le company attive. Non implementata. |
| **`banking_set_updated_at` trigger name** | V2 usa nome dedicato `banking_set_updated_at` vs `set_updated_at` generico. Minore. |

---

## Piano di implementazione

### 1. Migration DB — Aggiornamenti schema
- `ALTER TABLE bank_connections ADD COLUMN expires_at timestamptz`
- `CREATE INDEX idx_bank_connections_expires ON bank_connections(expires_at)`
- `ALTER TABLE bank_categorization_rules ADD COLUMN is_case_sensitive boolean NOT NULL DEFAULT false`
- `CREATE INDEX idx_bank_accounts_active ON bank_accounts(is_active) WHERE is_active = true`
- `DROP + CREATE FUNCTION get_treasury_summary` con subquery corrette (no GROUP BY)

### 2. Shared helper `_shared/goCardless.ts`
- `getGoCardlessToken()` — ottieni token fresh
- `gcFetch(path, token, options, retry)` — wrapper con retry automatico su 401
- `categorizeTransaction(description, creditorName, amount)` — regex avanzati (11 categorie)

### 3. Refactor edge functions per usare helper condiviso
- `bank-test-connection` — usa `getGoCardlessToken()`
- `bank-connect-start` — aggiunge validazione `redirect_url` (origin check) + salva `expires_at`
- `bank-connect-complete` — usa `gcFetch` con retry + `Promise.allSettled` per account paralleli
- `bank-sync` — usa `gcFetch`, aggiunge 500ms delay tra account, processa anche pending transactions
- `bank-disconnect` — usa `getGoCardlessToken()`
- `bank-list-institutions` — usa `gcFetch`

### 4. Nuova edge function `bank-sync-all-companies`
- Auth via service role key header
- Seleziona tutte le company con connessioni attive
- Per ciascuna invoca `bank-sync` con `company_id`

### 5. UI Updates
- **`BankConnectionsList.tsx`**: aggiungere banner scadenza (arancione <15gg, rosso se scaduta)
- **`TransactionsFeed.tsx`**: aggiungere categorie mancanti (Assicurazioni, Ristorazione, Trasferte, Entrata) con colori V2

### File da creare/modificare
- **Nuovo**: `supabase/functions/_shared/goCardless.ts`
- **Nuovo**: `supabase/functions/bank-sync-all-companies/index.ts`
- **Modificati**: 6 edge functions bank-*, `BankConnectionsList.tsx`, `TransactionsFeed.tsx`
- **Migration**: 1 SQL per schema updates + RPC fix

