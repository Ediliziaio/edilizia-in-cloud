

# Verifica Vista Settimana e Carico (Heatmap) — Risultati

## Vista Settimana: OK

La vista settimana gestisce correttamente tutti e tre i tipi di evento:
- **Posa** (expected_date): riga 72-74
- **Merce** (warehouse_arrival_date): riga 75-77
- **Lavoro** (work_start_date → work_end_date range): righe 78-87, con logica anti-duplicato vs posa
- **Appuntamenti** e **Google busy**: righe 89-101
- Filtri `hiddenEventTypes` applicati correttamente su tutti i tipi

Nessun bug trovato.

## Vista Carico (Heatmap): 2 problemi trovati

### BUG 1: Heatmap non rispetta i filtri Layer (hiddenEventTypes)

La `CalendarHeatmapView` **non riceve** `hiddenEventTypes` come prop. Di conseguenza, la funzione `getWorkloadForDay()` conta **sempre** tutti i tipi di evento (posa, merce, lavoro) indipendentemente dai toggle nel pannello Layer.

Se l'utente disattiva "Arrivo merce" nel Layer, la vista Mese e Settimana nascondono quegli eventi, ma la Heatmap continua a contarli.

**Fix**: Passare `hiddenEventTypes` alla Heatmap e filtrare di conseguenza in `getWorkloadForDay()`.

### BUG 2: Heatmap non include appuntamenti nel conteggio carico

La Heatmap conta solo ordini (posa/merce/lavoro) ma **ignora completamente gli appuntamenti**. Questo rende il calcolo del "carico giornaliero" incompleto — un giorno con 0 ordini ma 3 appuntamenti risulta vuoto.

**Fix**: Passare `filteredAppointments` alla Heatmap e includerli nel conteggio.

## File da modificare

### `src/components/calendar/CalendarHeatmapView.tsx`
1. Aggiungere props `hiddenEventTypes` e `appointments` all'interfaccia
2. Aggiornare `getWorkloadForDay()` per rispettare i filtri e includere appuntamenti
3. Aggiornare il popover per mostrare anche gli appuntamenti
4. Aggiornare le iconcine nella cella per mostrare l'icona appuntamento

### `src/pages/azienda/Calendar.tsx`
1. Passare `hiddenEventTypes` e `filteredAppointments` alla `CalendarHeatmapView` (riga 548-552)

### Dettaglio tecnico

**Props aggiornate:**
```tsx
interface CalendarHeatmapViewProps {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  hiddenEventTypes?: Set<string>;
}
```

**Logica `getWorkloadForDay` aggiornata:**
```tsx
function getWorkloadForDay(orders, day, hiddenEventTypes) {
  // filtra posa/merce/lavoro in base a hiddenEventTypes
  // stessa logica attuale ma con check su hidden
}
```

**In Calendar.tsx:**
```tsx
<CalendarHeatmapView
  orders={scheduledOrders}
  appointments={filteredAppointments}
  currentDate={currentDate}
  onDateChange={setCurrentDate}
  hiddenEventTypes={hiddenEventTypes}
/>
```

