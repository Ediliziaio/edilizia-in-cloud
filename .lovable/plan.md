

## Piano: Scrollbar orizzontale per la tabella Costi

### Problema
La tabella costi usa `table-fixed` con `overflow-hidden`, forzando tutte le colonne in larghezze percentuali compresse. Il risultato è un layout troppo stretto e poco leggibile.

### Soluzione
In `src/components/forecast/CostsTable.tsx` (riga ~292):
- Cambiare `overflow-hidden` → `overflow-x-auto` sul contenitore `div`
- Rimuovere `table-fixed` dalla `Table` e impostare una `min-width` fissa (es. `min-w-[1400px]`) così la tabella può espandersi oltre il viewport con scrollbar orizzontale
- Rimuovere le larghezze percentuali (`w-[3%]`, `w-[13%]`, ecc.) dalle colonne e usare larghezze fisse in pixel (es. `w-[40px]`, `w-[160px]`) per dare respiro a ogni colonna

Questo aggiunge una scrollbar orizzontale solo sotto la tabella, mantenendo header/stats/tabs fissi sopra.

