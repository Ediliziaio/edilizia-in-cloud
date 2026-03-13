

## Piano: Riconciliazione Anagrafica Fiscale ↔ Clienti Cantieri (INT-01)

### Adattamento critico

Il prompt fa riferimento a una tabella `clienti` che **non esiste**. I clienti cantieri sono nella tabella `profiles` (con `company_id`, `first_name`, `last_name`, `email`, `phone`, `fiscal_code`, `address`). Il piano viene adattato per usare `profiles` come sorgente.

---

### 1. Migration SQL

Aggiungere a `anagrafiche_native`:
- `cliente_id UUID REFERENCES profiles(id) ON DELETE SET NULL` — link opzionale
- `sync_from_cliente BOOLEAN NOT NULL DEFAULT false`
- `last_synced_at TIMESTAMPTZ`
- Partial index su `cliente_id WHERE cliente_id IS NOT NULL`

Creare tabella audit `anagrafica_reconciliation_log` con RLS company-scoped.

Creare trigger `sync_anagrafica_from_cliente()` su `profiles` che aggiorna `anagrafiche_native` quando `sync_from_cliente = true`. Campi mappati: `first_name || ' ' || last_name → ragione_sociale`, `fiscal_code → codice_fiscale`, `email`, `phone → telefono`, `address → indirizzo_via`.

### 2. Hook `useAnagraficaReconciliation.ts`

Nuovo file `src/hooks/billing/useAnagraficaReconciliation.ts` con:
- `useAnagraficheWithReconciliation(companyId)` — fetch anagrafiche con join su profiles via `cliente_id`
- `useSuggestedMatches(companyId)` — confronto client-side tra anagrafiche senza `cliente_id` e profili: match esatto su `fiscal_code`, similarity su nome (bigram). No P.IVA nei profiles.
- `useLinkAnagraficaToCliente()` — mutation per collegare
- `useUnlinkAnagraficaFromCliente()` — mutation per scollegare

### 3. UI: Tab Riconciliazione in AnagraficheList

Aggiornare `AnagraficheList.tsx` aggiungendo `Tabs` wrapper con due tab:
- **"Anagrafiche"** — contenuto attuale
- **"Riconciliazione"** — nuovo pannello con:
  - Sezione "Match suggeriti" (per codice fiscale e nome simile) con pulsanti Collega/Collega+Sync
  - Sezione "Già collegate" con tabella e pulsante Scollega
  - Sezione "Non collegate" con combobox di ricerca manuale per collegamento

### 4. Tab Fatture in CompanyCustomerDetail

Aggiornare `CompanyCustomerDetail.tsx`:
- Query `anagrafica_by_cliente` per trovare l'anagrafica collegata al profilo
- Query `documenti_fiscali` filtrata per `anagrafica_id` dell'anagrafica collegata
- Aggiungere sezione "Fatture" sotto gli ordini (o come tab se esistono già tab) con:
  - Empty state con CTA a Riconciliazione se non collegato
  - Lista fatture compatta se collegato

### 5. Aggiornare types

Aggiungere a `AnagraficaNative` in `src/types/fatturazione.ts`:
- `cliente_id?: string | null`
- `sync_from_cliente?: boolean`
- `last_synced_at?: string | null`

---

### File da creare/modificare

| File | Azione |
|---|---|
| Migration SQL | Creare (via migration tool) |
| `src/hooks/billing/useAnagraficaReconciliation.ts` | Creare |
| `src/pages/azienda/fatturazione/AnagraficheList.tsx` | Aggiungere tab Riconciliazione |
| `src/pages/azienda/CompanyCustomerDetail.tsx` | Aggiungere sezione Fatture |
| `src/types/fatturazione.ts` | Aggiungere campi nuovi |

