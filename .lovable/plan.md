

# Fix: Filtro appuntamenti nella vista Carico (Heatmap)

## Bug trovato

La vista Carico (Heatmap) usa `hiddenEventTypes?.has("appointment")` per filtrare gli appuntamenti, ma il valore effettivo impostato dal pannello Layer in `Calendar.tsx` è `"appuntamento"` (italiano). Risultato: disattivare il layer "Appuntamenti" nel pannello non ha effetto sulla Heatmap — gli appuntamenti vengono sempre contati.

Le altre viste (Mese e Settimana) usano correttamente `"appuntamento"`.

## Fix

| File | Modifica |
|------|----------|
| `src/components/calendar/CalendarHeatmapView.tsx` riga 79 | Cambiare `"appointment"` → `"appuntamento"` |

Una sola riga da modificare. Nessun altro problema trovato nel resto del calendario.

