

# Verifica e Fix: Filtri Calendario, Appuntamenti e Collegamento Ordini

## Problemi trovati

### 1. BUG: AppointmentDialog dentro CalendarMonthView non aggiorna la lista
Quando si modifica un appuntamento cliccandolo nella vista mese, il callback `onSaved` (riga 295) fa solo `setEditingAppointment(null)` ma **non invalida la query** `["appointments"]`. Risultato: dopo la modifica il calendario non si aggiorna finche' non si ricarica la pagina.

**Stesso problema** nella `CalendarWeekView` (da verificare).

**Fix**: aggiungere `queryClient.invalidateQueries({ queryKey: ["appointments"] })` nel `onSaved` di entrambe le viste, e anche `hideMarketingFields` prop mancante.

### 2. BUG: "Lavori in corso" non visibili nella vista Mese
Il pannello Layer ha il toggle "Lavori in corso" che imposta `hiddenEventTypes.has("lavoro")`, ma la `CalendarMonthView.getEventsForDay()` **non genera mai eventi di tipo "lavoro"** (gestisce solo `posa`, `merce`, `appointment`, `google_busy`). La `CalendarWeekView` invece li gestisce correttamente (righe 77-84).

**Fix**: Aggiungere la generazione degli eventi "lavoro" (work_start_date → work_end_date range) anche in `CalendarMonthView.getEventsForDay()`.

### 3. BUG: filtro "Appuntamenti" nel Layer non filtra appuntamenti per risorsa
Quando si deseleziona un operaio nel Layer, gli ordini vengono filtrati per risorsa, ma gli **appuntamenti** rimangono visibili indipendentemente dall'assegnazione. Questo è coerente col design (gli appuntamenti usano il filtro "Assegnato a" separato), quindi nessun intervento.

### 4. Collegamento ordini-calendario: OK
- `EditOrderDatesDialog` salva le date e invalida `["calendar-orders"]` → il calendario si aggiorna
- Gli ordini con `work_start_date`, `expected_date` o `warehouse_arrival_date` appaiono correttamente
- Le modifiche al magazzino (warehouse_arrival_date) si riflettono sugli eventi "merce"

## File da modificare

### `src/components/calendar/CalendarMonthView.tsx`
1. Aggiungere eventi "lavoro" in `getEventsForDay()` per work_start_date/work_end_date range
2. Nel `onSaved` di AppointmentDialog: aggiungere invalidazione query + `hideMarketingFields`
3. Aggiungere `useQueryClient` import

### `src/components/calendar/CalendarWeekView.tsx`
1. Nel `onSaved` di AppointmentDialog: aggiungere invalidazione query + verificare `hideMarketingFields`

### Dettaglio tecnico

Per gli eventi "lavoro" in CalendarMonthView, aggiungere nella funzione `getEventsForDay`:
```tsx
if (!hiddenEventTypes.has("lavoro") && order.work_start_date) {
  const workStart = parseISO(order.work_start_date);
  const workEnd = order.work_end_date ? parseISO(order.work_end_date) : workStart;
  if (day >= workStart && day <= workEnd) {
    events.push({ type: "lavoro" as any, order, color: "#22C55E" });
  }
}
```

Il tipo `CalendarEvent.type` dovrà essere esteso per includere `"lavoro"` e il rendering dovrà gestire l'icona `Wrench` per quel tipo.

Per l'invalidazione query nell'AppointmentDialog interno:
```tsx
onSaved={() => {
  setEditingAppointment(null);
  queryClient.invalidateQueries({ queryKey: ["appointments"] });
}}
```

