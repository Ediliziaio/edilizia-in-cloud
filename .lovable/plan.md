

# Audit Round 2 — Ordini / Magazzino / Calendario

## Stato delle correzioni precedenti

Tutti i fix principali del round 1 sono stati implementati correttamente:
- RPC `change_order_status` creata e usata in OrderDetail, OrdersList, edge function
- Conflict detection bridge `employeeByUserId` funzionante
- Legacy installments con check idempotente
- Limiti query aumentati (10000/5000)

## Bug residui trovati

### Bug 1 (P1): OrdersList delete non invalida il calendario
**File:** `OrdersList.tsx`, righe 441-443
La mutation `deleteOrderMutation.onSuccess` invalida solo `["orders"]`, NON `["calendar-orders"]`. Dopo aver eliminato un ordine dalla lista, il calendario continua a mostrarlo fino a refresh.

### Bug 2 (P1): OrdersList bulk delete non invalida il calendario
**File:** `OrdersList.tsx`, riga 473
`handleBulkDelete` invalida solo `["orders"]`, NON `["calendar-orders"]`. Stesso problema del Bug 1 per eliminazioni multiple.

### Bug 3 (P1): OrderDetail item update non invalida il magazzino
**File:** `OrderDetail.tsx`, righe 450-456
`updateSingleItemMutation.onSuccess` invalida `order-items`, `forecast-*` ma NON `["warehouse-items"]` e `["warehouse-badge-counts"]`. Cambiare lo stato di un articolo (es. da "ordinato" a "in_magazzino") non si riflette nel magazzino fino a refresh.

### Bug 4 (P1): OrderDetail add item non invalida il magazzino
**File:** `OrderDetail.tsx`, righe 481-483
`addItemMutation.onSuccess` invalida solo `order-items`. Nuovo articolo non appare nel magazzino.

## Piano correzioni

### File 1: `src/pages/azienda/OrdersList.tsx`
- `deleteOrderMutation.onSuccess` (riga 442): aggiungere `queryClient.invalidateQueries({ queryKey: ["calendar-orders"] })`
- `handleBulkDelete` (riga 473): aggiungere `queryClient.invalidateQueries({ queryKey: ["calendar-orders"] })`

### File 2: `src/pages/azienda/OrderDetail.tsx`
- `updateSingleItemMutation.onSuccess` (riga 450): aggiungere invalidazione di `["warehouse-items"]` e `["warehouse-badge-counts"]`
- `addItemMutation.onSuccess` (riga 481): aggiungere invalidazione di `["warehouse-items"]` e `["warehouse-badge-counts"]`

Totale: 2 file, 4 invalidazioni mancanti. Nessun rischio di regressione.

