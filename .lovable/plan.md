

# Fix: Sabato è giorno lavorativo, solo Domenica è festivo

## Bug trovato

La funzione `isWeekend()` di date-fns restituisce `true` sia per Sabato che per Domenica. Attualmente il codice usa `isWeekend()` in due punti:

1. **Riga 114 (statistiche)**: `monthDays.filter((d) => !isWeekend(d))` — esclude Sabato dal calcolo della media/giorno, giorni vuoti, picco e giorni critici. **Errato**: Sabato è lavorativo.

2. **Riga 180 (stile celle)**: `isWeekend(day)` — rende Sabato visivamente attenuato come la Domenica. **Errato**: Sabato dovrebbe apparire come un giorno normale.

## Fix

Sostituire `isWeekend(day)` con `getDay(day) === 0` (solo Domenica) in entrambi i punti:

### `src/components/calendar/CalendarHeatmapView.tsx`

1. **Import**: Aggiungere `getDay` dall'import di date-fns
2. **Riga 114**: `monthDays.filter((d) => getDay(d) !== 0)` — Sabato incluso nelle statistiche
3. **Riga 180**: `getDay(day) === 0` — Solo Domenica attenuata visivamente

Risultato: Media/giorno, picco, giorni vuoti e giorni critici calcolati correttamente su Lun-Sab. La Domenica resta esclusa e visivamente distinta.

