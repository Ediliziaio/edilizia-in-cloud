

# Audit Ordini / Magazzino / Calendario — Piano Correzioni

## FASE 1: Bug Identificati

### Critici (P0)

| # | Bug | File | Evidenza |
|---|-----|------|----------|
| 1 | **Status change non atomico** | `OrderDetail.tsx:296-299`, `OrdersList.tsx:421-429` | Due query separate: se la prima va a buon fine e la seconda fallisce, lo stato ordine cambia ma lo storico non viene scritto. Stesso pattern in entrambi i punti. |
| 2 | **Automazione aggiorna stato senza scrivere storico** | `process-internal-automation/index.ts:111-121` | `update_order_status` scrive solo `orders.current_status_id`, non inserisce `order_status_history`. Storico ordine diventa incompleto. |
| 3 | **Conflict detection ignora appuntamenti** | `useConflictDetection.ts:69-70` | Il commento dice "skip for now". Gli appuntamenti con `assigned_to` (user_id) non vengono confrontati con `order_employees` (employee.id). Occorre il bridge `employees.user_id` → `assigned_to`. |
| 4 | **Legacy installments: insert senza protezione idempotente** | `OrderDetail.tsx:373-387` | Se l'utente clicca due volte rapidamente, il path legacy fa due `insert` → rate duplicate. Nessun upsert, nessun constraint `(order_id, position)`, nessun check preventivo. |

### Medi (P1)

| # | Bug | File |
|---|-----|------|
| 5 | **OrdersList query ordini senza limit** | `OrdersList.tsx:99-107` | Default Supabase 1000 righe. Aziende con >1000 ordini vedono lista troncata silenziosamente. |
| 6 | **Calendar query ordini senza limit** | `Calendar.tsx:90-109` | Stesso problema: ordini nel calendario troncati a 1000. |
| 7 | **Warehouse order selector limit 200** | `useWarehouseData.ts:273` | `.limit(200)` sul dropdown ordini. Ordini piu vecchi invisibili nel filtro. |
| 8 | **Status change non invalida il calendario** | `OrderDetail.tsx:301-303`, `OrdersList.tsx:431-433` | `updateStatusMutation.onSuccess` invalida solo `["order"]`/`["orders"]`, non `["calendar-orders"]`. Il calendario mostra stato vecchio fino a refresh. |
| 9 | **Appointments query senza limit** | `Calendar.tsx:123-131` | Default 1000 appuntamenti. |

## FASE 2: Piano Correzioni

### Fix 1+2: Cambio stato atomico via RPC
**Creare una RPC** `change_order_status(p_order_id, p_new_status_id, p_changed_by)` che in una singola transazione:
1. Aggiorna `orders.current_status_id`
2. Inserisce in `order_status_history`

**Files da modificare:**
- Database migration: creare la RPC
- `OrderDetail.tsx`: sostituire le 2 query con `supabase.rpc("change_order_status", ...)`
- `OrdersList.tsx`: stesso
- `process-internal-automation/index.ts`: stesso (usando `supabase.rpc`)

### Fix 3: Conflict detection con bridge employee ↔ profile
**File:** `Calendar.tsx`, `useConflictDetection.ts`
- `Calendar.tsx`: aggiungere `user_id` alla select degli employees (`"id, first_name, last_name, user_id"`)
- Passare la mappa `employeesByUserId` a `useConflictDetection`
- `useConflictDetection.ts`: accettare `employeeMap: Map<string, {id, name}>` (da user_id a employee). Per ogni appuntamento con `assigned_to`, cercare l'employee corrispondente via `user_id`. Se trovato, aggiungere l'evento nella stessa mappa conflitti usando l'employee.id come chiave.
- Tipo aggiornato per accettare il mapping

### Fix 4: Legacy installments idempotente
**File:** `OrderDetail.tsx`
- Prima dell'insert, fare un check: `select count(*) from order_installments where order_id = ?`. Se count > 0, saltare l'insert e fare un update sulla rata specifica.
- In alternativa, usare `upsert` con `onConflict: "order_id,position"` (richiede unique constraint nel DB).
- Approccio scelto: check preventivo (no migration necessaria). Se `count > 0`, ricaricare le installments e aggiornare quella corrispondente.

### Fix 5-7, 9: Limiti query
- `OrdersList.tsx`: aggiungere `.limit(10000)` alla query ordini
- `Calendar.tsx`: aggiungere `.limit(10000)` alla query ordini e `.limit(10000)` alla query appuntamenti
- `useWarehouseData.ts`: aumentare limit dropdown ordini a `.limit(5000)`

### Fix 8: Invalidazione cache cross-modulo
**Files:** `OrderDetail.tsx`, `OrdersList.tsx`
- `updateStatusMutation.onSuccess` in entrambi: aggiungere invalidazione di `["calendar-orders"]` e `["warehouse-items"]` e `["warehouse-badge-counts"]`
- `OrderDetail.tsx` delete: aggiungere invalidazione `["calendar-orders"]`

## Riepilogo file da modificare

| File | Fix | Tipo |
|------|-----|------|
| **Database migration (RPC)** | #1, #2 | Atomicita |
| `src/pages/azienda/OrderDetail.tsx` | #1, #4, #8 | Atomicita + Idempotenza + Cache |
| `src/pages/azienda/OrdersList.tsx` | #1, #5, #8 | Atomicita + Scalabilita + Cache |
| `supabase/functions/process-internal-automation/index.ts` | #2 | Atomicita |
| `src/hooks/useConflictDetection.ts` | #3 | Conflict detection |
| `src/pages/azienda/Calendar.tsx` | #3, #6, #9 | Conflict + Scalabilita |
| `src/hooks/useWarehouseData.ts` | #7 | Scalabilita |

## Rischi e mitigazioni

- **RPC**: singola funzione SQL, testabile isolatamente. Nessun rischio di regressione — le 2 query separate vengono sostituite da una chiamata equivalente.
- **Conflict detection bridge**: funziona solo se `employees.user_id` e valorizzato. Se un employee non ha user_id, gli appuntamenti di quel profilo non genereranno conflitti — comportamento degradato ma non errato.
- **Legacy check**: il check preventivo aggiunge una query extra solo nel path legacy (ordini vecchi senza installments DB). Nessun impatto su ordini nuovi.
- **Limiti aumentati**: 10000 e sufficiente per la quasi totalita delle aziende. Per volumi superiori servira paginazione server-side (raccomandazione futura).

