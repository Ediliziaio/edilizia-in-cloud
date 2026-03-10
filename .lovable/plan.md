

# Audit Tecnico Banking Integration — Edilizia in Cloud

## FASE 1: Bug e Problemi Identificati

### CRITICI (P0)

| # | Area | Bug | File |
|---|------|-----|------|
| 1 | **Sync singola connessione** | `handleSyncOne(connectionId)` passa `company_id` ma **non** `connection_id`. `bank-sync` ignora il parametro e sincronizza **tutte** le connessioni attive | `BankConnectionsList.tsx:179`, `bank-sync/index.ts:40-44` |
| 2 | **Upsert con `ignoreDuplicates: true`** | Le transazioni esistenti non vengono mai aggiornate (pending→booked, aggiornamento descrizione/metadata). `ignoreDuplicates` salta completamente i record esistenti | `bank-sync/index.ts:132` |
| 3 | **`external_transaction_id` con `crypto.randomUUID()`** | Se il provider non restituisce `transactionId` ne `internalTransactionId`, viene generato un UUID casuale → la stessa transazione viene duplicata ad ogni sync | `bank-sync/index.ts:116` |
| 4 | **Sync error: log resta "running"** | Il `catch` globale in `bank-sync` non aggiorna `bank_sync_logs` — il log resta con `status: "running"` per sempre | `bank-sync/index.ts:159-162` |
| 5 | **Riconciliazione non atomica** | `confirmMatch` usa `Promise.all` con 3 query indipendenti. Se una fallisce, le altre possono andare a buon fine → dati parziali (tx linkata ma fattura non aggiornata, o viceversa) | `BankReconciliation.tsx:183-195` |
| 6 | **Redirect URL non realmente validato** | `bank-connect-start` logga un warning per URL non autorizzati ma li accetta comunque (`allowing anyway for flexibility`) → open redirect | `bank-connect-start/index.ts:39-41` |

### MEDI (P1)

| # | Area | Problema |
|---|------|----------|
| 7 | **Auto-match muta dataset durante iterazione** | `runAutoMatch` chiama `confirmMatch` che chiama `loadData()` dentro il loop `for` → dati si ricaricano durante il batch, rendendo il matching imprevedibile | `BankReconciliation.tsx:211-227` |
| 8 | **Connect-complete: status sempre "active"** | Anche con errori parziali (es. 2 su 3 account falliti), la connessione viene marcata `active`. Manca uno stato `partial` | `bank-connect-complete/index.ts:77-82` |
| 9 | **Callback fragile** | Il callback usa `connections.find(c => c.status === "authenticating")` — se ci sono 2+ connessioni in autenticazione, completa quella sbagliata | `BankConnectionsList.tsx:67-68` |
| 10 | **Unlink non atomico** | Come match: `Promise.all` con 3 query separate senza transazione | `BankReconciliation.tsx:243-250` |
| 11 | **Disconnect non pulisce error_message** | `bank-disconnect` lascia `error_message` e `last_sync_at` dalla connessione precedente, potenzialmente confondendo una riconnessione | `bank-disconnect/index.ts:33` |

## FASE 2: Piano Correzioni

### Fix 1: Sync singola connessione
**Files:** `BankConnectionsList.tsx`, `bank-sync/index.ts`
- Frontend: passare `connection_id` nel body
- Backend: se `connection_id` presente, filtrare solo quella connessione (aggiungere `.eq("id", connectionId)` alla query connections)
- Se `connection_id` assente, comportamento attuale (sync all) invariato

### Fix 2: Upsert che aggiorna record esistenti
**File:** `bank-sync/index.ts`
- Rimuovere `ignoreDuplicates: true` dall'upsert
- I record esistenti verranno aggiornati (status pending→booked, description, metadata, etc.)

### Fix 3: external_transaction_id deterministico
**File:** `bank-sync/index.ts`
- Fallback deterministico: se manca `transactionId` e `internalTransactionId`, costruire un hash basato su `accountId + bookingDate + amount + description`
- Formato: `${account.external_account_id}_${tx.bookingDate}_${tx.transactionAmount?.amount}_${hash}`

### Fix 4: Error logging nel catch globale
**File:** `bank-sync/index.ts`
- Nel catch globale, aggiornare `bank_sync_logs` con `status: "error"`, `error_message`, `completed_at`
- Richiede che `syncLog` sia accessibile nel catch (gia disponibile nello scope)

### Fix 5: Riconciliazione sequenziale (non parallela)
**File:** `BankReconciliation.tsx`
- `confirmMatch`: eseguire le 3 operazioni in sequenza invece che in parallelo
- Se una fallisce, non eseguire le successive
- Stessa logica per `handleUnlink`

### Fix 6: Redirect URL realmente restrittivo
**File:** `bank-connect-start/index.ts`
- Cambiare da warning a `return errorResponse("redirect_url non autorizzato", 403)` quando l'origin non e nell'allowlist
- Aggiungere anche il published URL (`edilizia-in-cloud.lovable.app`) alla lista

### Fix 7: Auto-match stabile
**File:** `BankReconciliation.tsx`
- `runAutoMatch`: lavorare su snapshot dei dati, non chiamare `loadData()` durante il loop
- Creare versione interna di `confirmMatch` che non chiama `loadData()`
- Chiamare `loadData()` una sola volta alla fine

### Fix 8: Connect-complete con status differenziato
**File:** `bank-connect-complete/index.ts`
- Se tutti gli account falliscono → `status: "error"`
- Se parziale → `status: "active"` con `error_message` (gia presente, va bene)
- Il caso full-error manca

### Fix 9: Callback con requisition_id da URL
**File:** `BankConnectionsList.tsx`
- Salvare `requisition_id` nel URL di callback (`?bank_callback=1&ref=REQUISITION_ID`)
- Nel callback, usare il `ref` per trovare la connessione corretta
- Fallback al comportamento attuale se `ref` non presente

### Fix 10: Disconnect pulito
**File:** `bank-disconnect/index.ts`
- Aggiungere `error_message: null` nell'update della connessione

### Fix 11: No fix necessario per coerenza tesoreria
TreasuryOverview usa RPC (`get_treasury_summary`, `get_cash_flow_by_month`) che dipendono dai dati corretti in `bank_transactions` e `bank_accounts`. Fixing upsert (Fix 2-3) e riconciliazione (Fix 5) risolve le discrepanze a monte.

## File da modificare (totale: 5)

| File | Modifiche |
|------|-----------|
| `supabase/functions/bank-sync/index.ts` | Fix 1 (connection_id filter), Fix 2 (upsert update), Fix 3 (deterministic ID), Fix 4 (error log) |
| `supabase/functions/bank-connect-start/index.ts` | Fix 6 (redirect validation) |
| `supabase/functions/bank-connect-complete/index.ts` | Fix 8 (status differentiation) |
| `supabase/functions/bank-disconnect/index.ts` | Fix 10 (clean disconnect) |
| `src/components/tesoreria/BankConnectionsList.tsx` | Fix 1 (pass connection_id), Fix 9 (callback correlation) |
| `src/components/tesoreria/BankReconciliation.tsx` | Fix 5 (sequential reconciliation), Fix 7 (stable auto-match) |

## Rischi e mitigazioni

- **Upsert senza ignoreDuplicates**: i record verranno aggiornati ma i dati dal provider sono la fonte di verita — nessun rischio di perdita dati
- **Redirect restrittivo**: potrebbe bloccare ambienti non previsti. Mitigo aggiungendo il dominio pubblicato e mantenendo localhost/lovable.app
- **Riconciliazione sequenziale**: piu lenta di 50ms ma garantisce atomicita logica. Non impatta UX percepita

