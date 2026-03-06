

# Scalabilità 10.000+ costi — Paginazione nella tabella Costi Aziendali

## Problema
La `CostsTable` renderizza **tutte** le righe nel DOM contemporaneamente. Con 10.000 costi il browser diventa inutilizzabile. Gli altri moduli del Previsionale usano gia `usePagination` + `TablePagination` (50 righe default), ma la sezione Costi no.

## Soluzione
Aggiungere la paginazione client-side alla `CostsTable` usando gli stessi hook e componenti gia presenti nel progetto.

### Modifiche

**`src/components/forecast/CostsTable.tsx`**:
1. Importare `usePagination` e `TablePagination`
2. Applicare `usePagination(sortedItems)` dopo il sorting — renderizzare solo `paginatedItems` nel `<TableBody>`
3. Aggiungere `<TablePagination>` sotto la tabella con controlli pagina/dimensione
4. Calcolare i `footerTotals` su `items` (tutti, non solo la pagina corrente) — cosi i totali restano globali
5. Calcolare `selectableItems` e `allSelectableIds` sulla pagina corrente per il "seleziona tutti" (seleziona solo la pagina visibile)

### Impatto
- Rendering: da N righe a max 50 per pagina
- Footer totali: rimangono calcolati su tutti gli items filtrati
- Selezione: "seleziona tutti" seleziona solo la pagina corrente
- Nessuna modifica al data layer o alle query

### File coinvolto
- `src/components/forecast/CostsTable.tsx` — unico file da modificare

