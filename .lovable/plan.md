

# Piano: Slot griglia dinamici in base alla durata del calendario

## Situazione attuale

- La griglia Day/Week usa `HALF_HOURS` fisso (slot da 30 min)
- I calendari hanno un campo `duration_minutes` (es. 60 min = 1 ora, 30 min, ecc.)
- Gli appuntamenti si possono creare a qualsiasi orario libero (input manuale)
- Il drag & drop invece "snappa" sullo slot della griglia

## Cosa cambia

Il drag & drop e la griglia devono adattarsi alla durata del calendario selezionato:
- Se il calendario ha `duration_minutes = 60` → slot da 1 ora (griglia `h-16`)
- Se `duration_minutes = 30` → slot da 30 min (griglia `h-8`)
- Se più calendari sono selezionati con durate diverse → usa il minimo (slot più granulare)

## Interventi

### 1. `marketingCalendarConstants.ts` — funzione generatrice dinamica

Aggiungere:
```typescript
export function buildTimeSlots(slotMinutes: number): string[] {
  const slots: string[] = [];
  for (let m = 8 * 60; m < 22 * 60; m += slotMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}
```

Mantenere `HALF_HOURS` e `HOURS` per retrocompatibilità.

### 2. `MarketingCalendar.tsx` — calcolo `slotDurationMinutes`

- Calcolare `slotDurationMinutes` dal minimo dei `duration_minutes` dei calendari selezionati (default 30 se nessuno selezionato)
- Passare `slotDurationMinutes` come prop a `DayView` e `WeekView`

### 3. `MarketingCalendarDayView.tsx` — slot dinamici

- Nuova prop `slotDurationMinutes: number`
- Usare `buildTimeSlots(slotDurationMinutes)` al posto di `HALF_HOURS`
- Altezza slot: `h-16` per 60 min, `h-8` per 30 min, `h-6` per 15 min (proporzionale)
- `getAppointmentsForSlot` usa `slotDurationMinutes` come range
- Label laterale: mostra orario su ogni slot (per 60 min) o solo su `:00` (per 30 min)

### 4. `MarketingCalendarWeekView.tsx` — stessa logica

- Nuova prop `slotDurationMinutes: number`
- Stessa logica del DayView: slot dinamici, altezza proporzionale

### 5. Nessuna modifica alla creazione/modifica appuntamenti

Gli appuntamenti continuano a poter essere creati a qualsiasi orario (input libero nel dialog). Solo la griglia di visualizzazione e il drag & drop usano gli slot.

## File coinvolti

| File | Azione |
|------|--------|
| `src/lib/marketingCalendarConstants.ts` | Aggiunta `buildTimeSlots()` |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Prop `slotDurationMinutes`, slot dinamici |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Prop `slotDurationMinutes`, slot dinamici |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Calcolo e passaggio `slotDurationMinutes` |

Nessuna modifica DB. Nessuna modifica backend.

