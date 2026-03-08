

## Piano: Filtro Visibilità Colonne nella Tabella Costi

### Cosa si fa
Aggiungere un dropdown "Colonne" sopra la tabella (accanto al bottone "Aggiungi") che permette di selezionare/deselezionare le colonne visibili. Lo stato viene mantenuto in un `useState` con tutte le colonne attive di default.

### File: `src/components/forecast/CostsTable.tsx`

1. **Definire le colonne configurabili** come array costante:
   - `origin` (Origine), `costType` (Tipo), `supplier` (Fornitore), `category` (Categoria), `amount` (Imponibile), `vatRate` (IVA), `gross` (Totale Lordo), `recurrence` (Ricorrenza), `dueDate` (Scadenza), `status` (Stato), `delay` (Ritardo), `order` (Ordine)
   - Colonne sempre visibili: checkbox, Nome, Azioni

2. **Aggiungere stato** `visibleColumns: Set<string>` inizializzato con tutte le colonne attive.

3. **Aggiungere un `DropdownMenu`** con icona `Settings2` e label "Colonne" nella toolbar sopra la tabella, contenente checkbox per ogni colonna.

4. **Wrappare condizionalmente** ogni `<TableHead>` e `<TableCell>` con `visibleColumns.has(key)` per mostrare/nascondere le colonne.

5. **Aggiornare il footer** `colSpan` per calcolarsi dinamicamente in base alle colonne visibili.

