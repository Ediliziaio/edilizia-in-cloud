

# Aggiungere ordinamento colonne con frecce su/giù nelle tabelle del Previsionale

## Obiettivo
Ogni colonna delle tabelle nei tab Incassato, Margine, Previsione Costi e Previsionale di Cassa avrà un header cliccabile con freccia su/giù per ordinare le righe in ordine crescente/decrescente.

## Approccio

### 1. Creare un componente riutilizzabile `SortableTableHead`
**File nuovo: `src/components/ui/sortable-table-head.tsx`**
- Componente che wrappa `TableHead` aggiungendo un'icona freccia (ArrowUp/ArrowDown/ArrowUpDown) e l'handler `onClick`
- Props: `column` (chiave), `label`, `currentSort`, `onSort`, `className`
- Stato visivo: freccia neutra (grigia) quando non attivo, freccia su o giù quando attivo

### 2. Creare un hook riutilizzabile `useTableSort`
**File nuovo: `src/hooks/useTableSort.ts`**
- Gestisce stato `{ column: string, direction: "asc" | "desc" }`
- Espone `sortConfig`, `toggleSort(column)`, `sortData(items, accessors)`
- Al click: prima volta = asc, secondo click = desc, terzo = reset

### 3. Integrare nei 4 tab

**CollectedTab.tsx** — tabella "Già incassato" (5 colonne: Data, Ordine, Cliente, Tipo, Importo)
- Aggiungere `useTableSort`, sostituire `TableHead` statici con `SortableTableHead`
- Ordinare `filteredCollected` prima del render

**MarginTab.tsx** — tabella ordini margine (7 colonne: Cliente, Commessa, Fatt.Imp., Costi Var., Margine €, Margine %, Stato)
- Stessa integrazione, ordinare `orders` 

**CashForecastTab.tsx** — tabella movimenti (5 colonne: Data, Descrizione, Ordine, Categoria, Importo)
- Ordinare `transactions`

**CostsForecastTab.tsx** — tabelle costi (headers dinamici via `CostCard`)
- Passare sort config al componente `CostCard`, ordinare `rows`

**CostsTable.tsx** — già fornito nel contesto, ha molte colonne
- Stessa integrazione per tutte le colonne dati (escluse Checkbox e Azioni)

### 4. Dettaglio UX
- Header cliccabile con `cursor-pointer` e hover leggero
- Icona `ArrowUpDown` (grigia) di default, `ArrowUp`/`ArrowDown` quando attivo
- Ordinamento numerico per importi/percentuali, alfabetico per testo, cronologico per date
- Nessuna modifica ai dati sottostanti, solo ordinamento visuale

