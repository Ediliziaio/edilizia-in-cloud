

# Fix allineamento colonne tabella Marginalità

## Problema
Dalla screenshot si vede che le intestazioni delle colonne non sono allineate con i valori delle righe. I valori numerici (Fatt. Imp., Costi Var., Margine €, Margine %) sono `text-right` nelle celle ma le intestazioni tramite `SortableTableHead` non propagano correttamente l'allineamento — il flex container interno allinea il testo a sinistra anche quando la classe `text-right` è impostata.

## Causa tecnica
`SortableTableHead` (riga 17-28 di `sortable-table-head.tsx`) usa `<div className="flex items-center gap-1">` internamente. Anche con `className="text-right"` sul `<TableHead>`, il div flex interno non rispetta `text-right` — serve `justify-end` sul div per colonne numeriche.

## Fix

### 1. Aggiornare `SortableTableHead`
Passare la classe `text-right`/`text-center` anche al div interno, convertendola in `justify-end`/`justify-center` per il flex container.

### 2. Aggiungere larghezze fisse alle colonne della tabella Marginalità
Impostare `w-[...]` o `min-w-[...]` su ogni colonna per garantire distribuzione uniforme:
- Cliente: `min-w-[140px]`
- Commessa: `min-w-[130px]`  
- Fatt. Imp.: `w-[120px] text-right`
- Costi Var.: `w-[120px] text-right`
- Margine €: `w-[120px] text-right`
- Margine %: `w-[100px] text-right`
- Stato: `w-[110px] text-center`

### 3. Miglioramenti UX minori
- Aggiungere `tabular-nums` alle celle numeriche per allineamento cifre
- Padding più consistente tra header e celle

