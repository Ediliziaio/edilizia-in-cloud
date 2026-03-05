

# Carico: Solo Pose e Lavori

## Problema
La vista Carico attualmente mostra tutte le tipologie (posa, merce, appuntamenti, lavori) in base ai filtri Layer. L'utente vuole che mostri **solo** pose e lavori in corso — niente arrivo merce, niente appuntamenti.

## Modifiche

### `src/components/calendar/CalendarHeatmapView.tsx`

1. **`getWorkloadForDay()`**: Rimuovere il blocco "Check merce" (righe 62-65) e rimuovere il conteggio appuntamenti (righe 79-81). Il totale sarà solo ordini con posa o lavoro.

2. **Celle del calendario**: Rimuovere le icone merce (Package) e appuntamento (CalendarClock) dalle celle.

3. **Popover dettaglio giorno**: Rimuovere la sezione che elenca gli appuntamenti. Mostrare solo ordini di tipo posa e lavoro.

4. **Props**: Rimuovere la prop `appointments` dato che non serve più. Rimuovere anche il filtro `hiddenEventTypes` per merce/appuntamento (la Heatmap mostrerà sempre e solo posa+lavoro, indipendentemente dai layer).

### `src/pages/azienda/Calendar.tsx`
- Rimuovere il passaggio di `appointments` alla `CalendarHeatmapView`.

