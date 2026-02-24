
# Audit Enterprise - Sezione Magazzino

## Stato Attuale (AS-IS)

La sezione Magazzino e' funzionalmente completa con:
- 4 viste: Lista (collapsible per ordine), Kanban (drag & drop dnd-kit), Calendario, Giacenze (stock persistente)
- Filtri: ricerca, stato, ordine, fornitore, quick filter (urgenti, settimana corrente/prossima)
- Stats con progress ring, valori per stato, conteggio ordini
- Alert urgenza con soglia 7g/3g e classificazione warning/critical
- Giacenze: CRUD articoli, movimenti carico/scarico, storico, task collegati, registrazione costi
- Hook dati centralizzato `useWarehouseData` per viste ordini
- Export CSV e stampa
- Multi-tenancy con company_id

## Problemi Identificati

### P1 - Duplicazione: `STATUS_CONFIG` in 2 file (diversa struttura)
**File**: `types/warehouse.ts` (solo `label`), `WarehouseKanbanColumn.tsx` (righe 15-45, con `label`, `color`, `bgColor`, `icon`)
**Problema**: La versione in `WarehouseKanbanColumn` e' un superset della versione base. Avere due `STATUS_CONFIG` con nomi identici ma strutture diverse crea confusione.
**Fix**: Estendere `STATUS_CONFIG` in `types/warehouse.ts` per includere `color`, `bgColor` e `icon`. Rimuovere la versione locale da KanbanColumn.

### P1 - Duplicazione: `COST_CATEGORIES` in 2 file
**File**: `StockItemDialog.tsx` (riga 26), `StockMovementDialog.tsx` (riga 24)
**Problema**: Array identico `["Materiali", "Magazzino", "Attrezzature", "Consumabili", "Altro"]` duplicato.
**Fix**: Estrarre in `types/warehouse.ts` e importare in entrambi.

### P1 - Duplicazione: logica urgenza in 3 file
**File**: `WarehouseKanbanCard.tsx` (righe 33-41), `WarehouseListView.tsx` (righe 89-101), `WarehouseAlerts.tsx` (righe 62-66) + `useWarehouseData.ts` (righe 277-286)
**Problema**: La stessa logica di calcolo urgenza (daysUntil <= 7, daysUntil <= 3, status check) e' implementata 4 volte con leggere variazioni.
**Fix**: Creare funzioni utility `isItemUrgent(item)`, `isItemCritical(item)`, `getDaysUntilPosa(item)` in `types/warehouse.ts` per centralizzare la logica.

### P1 - Duplicazione: `getSupplierName` in 2 file
**File**: `useWarehouseData.ts` (riga 260, restituisce `null`), `WarehouseStockTab.tsx` (riga 77, restituisce `"—"`)
**Problema**: Due implementazioni quasi identiche con diverso fallback (null vs "—"). Lo StockTab ha la propria query suppliers (uguale) ma usa la stessa queryKey quindi condivide la cache. Tuttavia la funzione `getSupplierName` e' ridefinita localmente.
**Fix**: Esportare `getSupplierName` dal hook e passarlo come prop/param allo StockTab, oppure estrarre come utility. Dato che lo StockTab ha bisogno del fallback "—" in UI, la soluzione piu' pulita e' rimuovere la funzione locale nello StockTab e usare `getSupplierName(id) || "—"` inline.

### P1 - Duplicazione: `OrderGroup` in CalendarView vs `OrderWithItems`
**File**: `WarehouseCalendarView.tsx` (righe 28-36), `types/warehouse.ts` (`OrderWithItems`)
**Problema**: `OrderGroup` ha gli stessi campi base di `OrderWithItems` piu' `readyCount` e `pendingCount`. Potrebbe estendere il tipo condiviso.
**Fix**: Usare un tipo locale che estende `OrderWithItems` con i campi aggiuntivi, oppure calcolare readyCount/pendingCount inline dal campo `items` gia' presente.

### P2 - `insertCostRecord` funzione standalone in StockTab
**File**: `WarehouseStockTab.tsx` (righe 83-101)
**Problema**: La funzione di inserimento costo e' inline nel componente. Non e' duplicata ma appartiene al data layer.
**Stato**: Accettabile come P2. Non duplicata, nessun intervento immediato.

---

## Piano Interventi

### Intervento 1 - Estendere `types/warehouse.ts` con costanti e utility condivise

Aggiornare `src/types/warehouse.ts` con:
- `STATUS_CONFIG` esteso: aggiungere `color`, `bgColor`, `icon` (import icone lucide)
- `COST_CATEGORIES` array
- `getDaysUntilPosa(item: WarehouseItem): number | null` - calcola giorni alla posa
- `isItemUrgent(item: WarehouseItem): boolean` - true se daysUntil <= 7 e status non pronto
- `isItemCritical(item: WarehouseItem): boolean` - true se daysUntil <= 3 e status non pronto
- `getUrgencyLabel(daysUntil: number): string` - restituisce "OGGI", "Domani" o "{n}g"

### Intervento 2 - Aggiornare WarehouseKanbanColumn.tsx
- Rimuovere `STATUS_CONFIG` locale (righe 15-45)
- Importare da `types/warehouse.ts`

### Intervento 3 - Aggiornare StockItemDialog.tsx e StockMovementDialog.tsx
- Rimuovere `COST_CATEGORIES` locale
- Importare da `types/warehouse.ts`

### Intervento 4 - Aggiornare WarehouseKanbanCard.tsx
- Rimuovere logica urgenza inline (righe 33-47)
- Usare `getDaysUntilPosa`, `isItemUrgent`, `isItemCritical`, `getUrgencyLabel` importati

### Intervento 5 - Aggiornare WarehouseListView.tsx
- Rimuovere `isOrderUrgent` e `isOrderCritical` locali (righe 89-101)
- Usare le utility importate (applicandole agli items del gruppo)

### Intervento 6 - Aggiornare useWarehouseData.ts
- Usare `isItemUrgent` importata nel calcolo `urgentItemsCount`

### Intervento 7 - Aggiornare WarehouseCalendarView.tsx
- Rimuovere `OrderGroup` locale, usare `OrderWithItems` esteso o calcolare readyCount/pendingCount inline dagli items

### Intervento 8 - Rimuovere `getSupplierName` duplicata in StockTab
- Rimuovere la funzione locale
- Usare `suppliers.find(s => s.id === id)?.name || "—"` inline o importare la versione dal hook

---

## Checklist Sicurezza e Multi-Tenancy

| Area | Stato |
|------|-------|
| company_id su query order_items | OK (filtro inner join) |
| company_id su query warehouse_stock | OK |
| company_id su query suppliers | OK |
| company_id su insert warehouse_stock | OK |
| company_id su insert warehouse_movements | N/A (FK su stock_item_id) |
| company_id su insert company_costs | OK |
| RLS su order_items | OK |
| RLS su warehouse_stock | OK |
| RLS su warehouse_movements | OK |
| Validazione input (nome, quantita') | OK |
| Nessuna API key esposta | OK |
| effectiveCompany per impersonificazione | OK |
| Query limit (2000 items) | OK |

## Checklist Performance

| Area | Stato attuale | Dopo intervento |
|------|--------------|-----------------|
| STATUS_CONFIG | 2 versioni (diversa struttura) | 1 versione completa |
| COST_CATEGORIES | 2 copie | 1 costante condivisa |
| Logica urgenza | 4 implementazioni | 3 funzioni utility |
| getSupplierName | 2 copie (diverso fallback) | 1 + inline fallback |
| OrderGroup | tipo locale + OrderWithItems | Riusato/esteso |
| suppliers query | Shared queryKey (cache OK) | Invariato |
| staleTime items (5min) | OK | Invariato |

## File Modificati (Previsti)

1. `src/types/warehouse.ts` - aggiunta STATUS_CONFIG esteso, COST_CATEGORIES, utility urgenza
2. `src/components/warehouse/WarehouseKanbanColumn.tsx` - import STATUS_CONFIG
3. `src/components/warehouse/StockItemDialog.tsx` - import COST_CATEGORIES
4. `src/components/warehouse/StockMovementDialog.tsx` - import COST_CATEGORIES
5. `src/components/warehouse/WarehouseKanbanCard.tsx` - import utility urgenza
6. `src/components/warehouse/WarehouseListView.tsx` - import utility urgenza
7. `src/hooks/useWarehouseData.ts` - import isItemUrgent
8. `src/components/warehouse/WarehouseCalendarView.tsx` - rimozione OrderGroup locale
9. `src/components/warehouse/WarehouseStockTab.tsx` - rimozione getSupplierName locale

## Note

Nessuna modifica strutturale al database. Nessuna modifica al comportamento funzionale. Tutti gli interventi sono refactor behavior-preserving che eliminano duplicazioni e centralizzano tipi/costanti/utility. Il file WarehouseStockTab (415 righe) ha una complessita' gestibile e non necessita di splitting. La funzione `insertCostRecord` resta inline come P2 accettabile.
