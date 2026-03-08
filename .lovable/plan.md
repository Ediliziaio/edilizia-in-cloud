

## Piano: Tabella Costi — Colonne più larghe + Scroll orizzontale

### Problema
La tabella usa `table-fixed` con larghezze percentuali strette (3%-13%), rendendo il contenuto troppo compresso. Non c'è scroll orizzontale dedicato alla tabella.

### Modifiche — File: `src/components/forecast/CostsTable.tsx`

**1. Rimuovere `table-fixed` e usare larghezze minime fisse (px)**
- Riga 293: rimuovere `className="table-fixed"` dalla `<Table>`
- Sostituire tutte le `w-[X%]` sulle `TableHead` con `min-w-[Xpx]` più generose:
  - Checkbox: `w-[44px]`
  - Nome: `min-w-[180px]`
  - Origine: `min-w-[100px]`
  - Tipo: `min-w-[90px]`
  - Fornitore: `min-w-[130px]`
  - Categoria: `min-w-[110px]`
  - Imponibile: `min-w-[110px]`
  - IVA: `min-w-[70px]`
  - Totale Lordo: `min-w-[120px]`
  - Ricorrenza: `min-w-[110px]`
  - Scadenza: `min-w-[110px]`
  - Stato: `min-w-[130px]`
  - Ritardo: `min-w-[80px]`
  - Ordine: `min-w-[100px]`
  - Azioni: `min-w-[120px]`

**2. Scroll orizzontale solo sulla tabella**
- Il wrapper `<div className="rounded-md border overflow-hidden">` (riga 292) diventa `overflow-x-auto` per abilitare lo scroll orizzontale quando le colonne superano la larghezza del contenitore.

Queste due modifiche insieme fanno sì che la tabella abbia colonne leggibili con dimensioni minime garantite, e quando non c'è spazio sufficiente appare una scrollbar orizzontale solo sulla tabella.

