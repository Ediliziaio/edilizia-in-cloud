

# Rimuovere la vista Settimana dal Calendario

## Modifiche

### `src/types/calendar.ts`
- Rimuovere `"week"` da `CalendarViewType`: `"month" | "gantt" | "heatmap"`

### `src/pages/azienda/Calendar.tsx`
1. **Import**: Rimuovere `CalendarWeekView` e l'icona `CalendarRange`
2. **Toggle button** (righe 345-348): Rimuovere il `ToggleGroupItem` con `value="week"`
3. **Rendering** (righe 537-546): Rimuovere il blocco `view === "week" ? <CalendarWeekView ... />`

### `src/components/calendar/CalendarWeekView.tsx`
- Eliminare il file (non più utilizzato)

