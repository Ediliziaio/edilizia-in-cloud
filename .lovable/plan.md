

# Ottimizzazione Kanban Magazzino — Card con più dettagli

## Problema
Attualmente le card Kanban mostrano solo una riga compatta: grip + quantità + nome + badge urgenza. Per vedere dettagli (cliente, ordine, fornitore, data) bisogna aprire il menu dropdown. Manca anche la possibilità di cliccare per aprire il dettaglio completo (come nella lista).

## Soluzione

### 1. Card Kanban riprogettata (layout multi-riga)

Trasformare `WarehouseKanbanCard` da layout a riga singola a card più informativa:

- **Riga 1**: Grip + Nome articolo (+ badge urgenza/ritardo a destra)
- **Riga 2**: Icone compatte con info chiave inline:
  - Quantità (`2x`)
  - Cliente (nome troncato)
  - Codice ordine
- **Riga 3** (opzionale): Fornitore + Data posa
- Indicatore note (icona StickyNote) se presenti
- Bordo sinistro colorato in base alla colonna per rinforzo visivo

### 2. Click per aprire il dettaglio

- Cliccando sulla card si apre il `WarehouseItemDetailDialog` già esistente
- Il drag funziona tramite il grip handle, il click sulla card apre il dialog
- Rimuovere il dropdown menu (non più necessario, il dialog lo sostituisce)

### 3. Passare le props necessarie

- `WarehouseKanbanView` e `WarehouseKanbanColumn` devono passare `onStatusChange`, `onUpdateNotes`, `getSupplierName`, e gestire lo stato `selectedItem` per il dialog

## File da modificare

- **`src/components/warehouse/WarehouseKanbanCard.tsx`** — Redesign layout multi-riga, aggiungere onClick, rimuovere dropdown
- **`src/components/warehouse/WarehouseKanbanColumn.tsx`** — Passare nuove props alle card
- **`src/components/warehouse/WarehouseKanbanView.tsx`** — Aggiungere stato selectedItem, renderizzare il dialog, passare callbacks

