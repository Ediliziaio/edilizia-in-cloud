
# Analisi Sezione Magazzino

## Stato Generale: Funzionante, ben strutturato

La sezione Magazzino comprende 10 file (1 pagina + 1 hook + 8 componenti) con 4 viste (Lista, Kanban, Calendario, Giacenze), sistema di alert urgenze, filtri avanzati, drag-and-drop, esportazione CSV/stampa, gestione movimenti con integrazione Costi Aziendali. Tutto funzionante correttamente.

---

## DEAD CODE TROVATO

### 1. `forwardRef` inutile in WarehouseListView (Priorita: Bassa)
**File**: `src/components/warehouse/WarehouseListView.tsx`

Il componente e wrappato con `forwardRef` e accetta un parametro `ref`, ma il genitore (`Warehouse.tsx`, riga 325) non passa mai un ref:
```tsx
<WarehouseListView orderGroups={filteredGroups} ... />
// Nessun ref={...} passato
```
**Fix**: Rimuovere `forwardRef`, convertire in componente funzionale standard. Rimuovere l'import `forwardRef` dalla riga 1.

### 2. Tipo `GroupBy = "supplier"` mai usato (Priorita: Bassa)
**File**: `src/hooks/useWarehouseData.ts` (riga 13)

Il tipo `GroupBy` include `"supplier"` ma:
- Il selettore nel UI (`Warehouse.tsx` riga 186-195) offre solo "order", "date", "status"
- La logica in `filteredGroups` non ha un caso specifico per "supplier" (raggruppa sempre per ordine)
- Nessun altro file lo usa

**Fix**: Rimuovere `"supplier"` dal tipo `GroupBy`.

---

## NESSUN BUG TROVATO

- Query con `.limit(2000)` per sicurezza: OK
- Drag-and-drop Kanban con `dnd-kit`: corretto, `PointerSensor` con distance threshold
- Movimenti magazzino: logica carico/scarico con `Math.max(0, newQty)` per evitare negativi
- Integrazione Costi Aziendali: registra correttamente il costo su `company_costs` al carico
- Filtri rapidi (urgenti, settimana corrente, prossima): logica date corretta con `differenceInDays`
- Alert ordini urgenti: logica coerente con i filtri
- StockMovementHistoryDialog: join corretto con `order_items` per mostrare codice ordine
- Export CSV: esporta tutti i filteredItems (non solo la pagina visibile)
- Tutti gli import sono utilizzati in ogni file

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/components/warehouse/WarehouseListView.tsx` | Rimuovere `forwardRef` wrapper e import (ref mai passato) | Bassa |
| `src/hooks/useWarehouseData.ts` | Rimuovere `"supplier"` dal tipo `GroupBy` | Bassa |

Nessun file da eliminare, nessun bug funzionale.
