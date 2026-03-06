

# Aggiungere ordinamento colonne alla tabella Ordini

## Modifica

**File: `src/components/orders/OrdersTable.tsx`**

Integrare `useTableSort` e `SortableTableHead` (già esistenti) per rendere tutte le colonne dati ordinabili con frecce su/giù.

**Colonne ordinabili** (escluse Checkbox e Azioni):
- Codice (`order_code`)
- Data (`created_at`)
- Descrizione (`description`)
- Cliente (nome completo)
- Tot. Ivato (calcolato)
- Imponibile (`total_amount`)
- Incassato (calcolato via `getAmountCollected`)
- Da Ricevere (calcolato via `getAmountDue`)
- Costi Var. (da `orderCosts`)
- Margine (da `orderCosts`)
- Venditore (da `salespeopleMap`)
- Manodopera (da `laborMap`)
- Pagamenti (pending count)
- Stato (`status.name`)

**Approccio**:
1. Importare `useTableSort` e `SortableTableHead`
2. Definire gli accessors con i valori calcolati (totalIvato, collected, due, margin, ecc.) — per i campi calcolati, pre-calcolarli in un oggetto intermedio o usare le funzioni helper inline
3. Wrappare `orders` con `useTableSort`, poi iterare `sortedItems` invece di `orders` nel `TableBody`
4. Sostituire ogni `<TableHead>` statico con `<SortableTableHead>` (tranne checkbox e azioni)

Nessuna modifica alla logica funzionale, solo ordinamento visuale.

