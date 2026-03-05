

# Pannello laterale destro con filtri visibilità layer

## Cosa si vuole

Un pannello laterale destro (simile allo screenshot) con:
- Campo di ricerca
- Sezione **Calendario Lavori** con checkbox per ogni operaio interno e squadra esterna assegnati agli ordini
- Sezione **Calendario Magazzino** con checkbox per mostrare/nascondere eventi logistici (arrivo merce)
- Ogni checkbox attiva/disattiva la visibilità degli eventi di quella risorsa sul calendario

## Layout

```text
┌─────────────────────────────┬──────────────┐
│                             │ Gestisci     │
│   CALENDARIO                │ visualizz.   │
│   (Mese / Settimana / ...)  │              │
│                             │ 🔍 Cerca...  │
│                             │              │
│                             │ ▾ Cal. Lavori│
│                             │   ☑ Mario R. │
│                             │   ☑ Squadra X│
│                             │              │
│                             │ ▾ Cal. Magaz.│
│                             │   ☑ Arrivo   │
│                             │     Merce    │
└─────────────────────────────┴──────────────┘
```

Su mobile: il pannello diventa collassabile sotto l'header.

## Implementazione

### Nuovo file: `src/components/calendar/CalendarLayerPanel.tsx`
- Titolo "Gestisci visualizzazione"
- Input di ricerca che filtra la lista di nomi
- Sezione collapsible **Calendario Lavori** con conteggio — checkbox colorate per ogni operaio interno (`companyEmployees`) e ogni squadra esterna (`externalTeams`)
- Sezione collapsible **Calendario Magazzino** — checkbox per "Arrivo Merce" e opzionalmente "Google Calendar"
- Props: `employees`, `externalTeams`, `visibleEmployees: Set<string>`, `visibleTeams: Set<string>`, `showMerce: boolean`, `showGoogleBusy: boolean`, `onToggle*` callbacks

### Modifica: `src/pages/azienda/Calendar.tsx`
- Aggiungere stato `visibleEmployeeIds: Set<string>` (tutti attivi di default), `visibleTeamIds: Set<string>`, `showMerce: boolean = true`, `showGoogleBusy: boolean = true`
- Layout: wrappare il contenuto calendario in `flex` con il pannello a destra (`w-64 shrink-0`)
- Filtrare `scheduledOrders` anche in base alle risorse visibili: un ordine è visibile se almeno uno dei suoi operai/squadre è attivo nel pannello (o se non ha assegnazioni)
- Filtrare `busySlots` con `showGoogleBusy`
- Passare `hiddenEventTypes` (es. `merce` se `showMerce=false`) alle viste Month/Week per escludere `warehouse_arrival_date` dal rendering

### Modifica: `CalendarMonthView.tsx` e `CalendarWeekView.tsx`
- Aggiungere prop opzionale `hiddenEventTypes?: Set<string>`
- In `getEventsForDay`, se `hiddenEventTypes.has("merce")` non aggiungere eventi tipo `merce`

