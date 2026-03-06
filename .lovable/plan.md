

# Analisi e Piano di Pulizia — Sezione Costi Aziendali

## 1. Bug e Warning da correggere

### Console Warning: "Function components cannot be given refs"
- **File**: `src/components/forecast/CostsTable.tsx`
- **Causa**: `<Tooltip>` usato direttamente dentro `<TableCell>` senza wrapper. Radix Tooltip è un function component che non accetta ref. Il pattern `<Tooltip><TooltipTrigger asChild><span>...</span></TooltipTrigger>` è corretto, ma il warning viene dal fatto che `Tooltip` viene renderizzato come figlio diretto di `<td>` che tenta di passare ref.
- **Fix**: Non è un bug funzionale critico, ma per pulire la console si può wrappare in un `<div>` o usare `TooltipProvider` locale. Il warning non blocca nulla.

### Bug logico: `costAccessors` dipende da `now` e `soon` 
- **File**: `CostsTable.tsx` riga 79-100
- `now` e `soon` sono ricalcolati a ogni render (`const now = new Date()`), il che causa il `useMemo` dei `costAccessors` a rigenerarsi inutilmente ogni render perché `now` e `soon` sono nuovi oggetti ogni volta.
- **Fix**: Stabilizzare `now` con `useMemo` o `useRef` per evitare re-render della tabella.

### Edit mode: `end_date` richiesto ma non precompilato
- **File**: `CompanyCostsManager.tsx` riga 111 (`openEdit`)
- Quando si apre un costo esistente ricorrente per modifica, `end_date` viene impostato a `""`, ma il bottone "Aggiorna" è `disabled` se `recurrence !== "once" && !end_date`. Questo blocca l'utente: non può salvare senza inserire una data fine, anche se vuole solo cambiare il nome.
- **Fix**: Per i costi ricorrenti in modifica, rendere `end_date` opzionale (non bloccare il salvataggio). La generazione di nuove occorrenze avviene solo se `end_date` è compilato.

## 2. Pulizia codice

### Import non utilizzati
- `CostFormDialog.tsx` riga 5: `Filter` da lucide è usato (per categoria). OK.
- `CostFormDialog.tsx` riga 1: `useCallback` è usato. OK.
- `CostsTable.tsx`: tutti gli import sono utilizzati.
- `useCompanyCostsData.ts` riga 7: `RECURRENCE_LABELS` è usato nel CSV export. OK.
- **Nessun import morto trovato** — il codice è già abbastanza pulito.

### Variabili non referenziate
- `CostsDialogs.tsx`: import di `format` da date-fns (riga 1) — **non usato** nel file. Da rimuovere.
- `CostsDialogs.tsx`: import di `UnifiedCost` (riga 13) — **non usato** nel file (è nell'interface ma il type è in props). Da rimuovere.

## 3. Miglioramenti UX

### Stato vuoto migliorato
- La tabella mostra "Nessun costo trovato" ma senza CTA. Aggiungere un bottone "Aggiungi il primo costo" nello stato vuoto.

### Feedback mancante sulle azioni bulk
- I bottoni "Segna pagati" e "Segna non pagati" nella barra di selezione non hanno feedback di loading visivo (il `disabled` c'è ma manca un indicatore spinner).

### Footer tabella: colSpan disallineamento potenziale
- Il `colSpan` nel footer (riga 426) usa `type === "all" ? 6 : 5`, ma le colonne variano anche per "Ordine" (mostrato solo in `variable` e `all`). Verificare che i conteggi siano corretti per tutti i tab.

## 4. Performance

### `allCostsSorted` non memoizzato
- `useCompanyCostsData.ts` righe 462-478: `allCostsSorted` viene calcolato senza `useMemo`, si ricalcola a ogni render del componente padre. Da wrappare in `useMemo`.

### `now/soon` instabili in CostsTable
- Come menzionato, `const now = new Date()` causa rigenerazione continua dei memo.

## Piano di implementazione

### File da modificare:

1. **`src/components/forecast/CostsTable.tsx`**
   - Stabilizzare `now/soon` con `useMemo`
   - Aggiungere CTA nello stato vuoto

2. **`src/components/forecast/CostsDialogs.tsx`**
   - Rimuovere import inutilizzati (`format`, `UnifiedCost`)

3. **`src/components/forecast/CostFormDialog.tsx`**
   - Rendere `end_date` opzionale in modifica (non bloccare il salvataggio se non compilato)

4. **`src/hooks/useCompanyCostsData.ts`**
   - Wrappare `allCostsSorted` in `useMemo`

5. **`src/components/forecast/CompanyCostsManager.tsx`**
   - Nessun cambiamento necessario

