

# Piano: Drag & Drop Appuntamenti nel Calendario Marketing

## Situazione attuale

Le 3 viste calendario (Giorno, Settimana, Mese) mostrano gli appuntamenti ma non supportano drag & drop. Il progetto ha già `@dnd-kit/core` e `@dnd-kit/utilities` installati.

## Intervento

### 1. Componente wrapper draggabile — `DraggableAppointment.tsx` (nuovo)

Componente che wrappa ogni pill appuntamento con `useDraggable` di dnd-kit. Durante il drag mostra un overlay semitrasparente con titolo e orario.

### 2. Vista Mese — `MarketingCalendarMonthView.tsx`

- Wrappare il componente con `DndContext` + `DragOverlay`
- Ogni cella giorno diventa un `useDroppable` con id = `day-YYYY-MM-DD`
- Ogni pill appuntamento diventa draggabile con id = `apt-{id}`
- Al drop: callback `onDropAppointment(appointmentId, newDate)` → aggiorna solo `appointment_date`
- Highlight visivo della cella target durante il drag (bordo colorato)

### 3. Vista Settimana — `MarketingCalendarWeekView.tsx`

- Wrappare con `DndContext` + `DragOverlay`
- Ogni slot ora/giorno diventa droppable con id = `slot-YYYY-MM-DD-HH`
- Al drop: callback `onDropAppointment(appointmentId, newDate, newTime)` → aggiorna `appointment_date` + `appointment_time`

### 4. Vista Giorno — `MarketingCalendarDayView.tsx`

- Wrappare con `DndContext` + `DragOverlay`
- Ogni slot ora diventa droppable con id = `slot-YYYY-MM-DD-HH`
- Al drop: callback `onDropAppointment(appointmentId, newDate, newTime)` → aggiorna `appointment_time`

### 5. Pagina `MarketingCalendar.tsx`

- Aggiungere la funzione `handleDropAppointment(appointmentId, newDate, newTime?)`:
  - Update su DB: `supabase.from("appointments").update({ appointment_date, appointment_time }).eq("id", appointmentId)`
  - Toast di conferma con undo (opzionale)
  - `refetchAppointments()` per ricalcolare tutto (travel legs, filtri, ecc.)
- Passare `onDropAppointment` come prop a tutte e 3 le viste

### 6. UX durante il drag

- L'elemento originale diventa semi-trasparente (`opacity-30`)
- Un `DragOverlay` mostra una pill compatta con titolo e orario
- La cella/slot target si evidenzia con bordo primario
- Al rilascio: toast "Appuntamento spostato al {data}" con feedback immediato
- Se il drop è sulla stessa posizione: nessun update

## Dettaglio tecnico

```text
MarketingCalendar.tsx
  └─ handleDropAppointment(id, newDate, newTime?)
       ├─ supabase.update({ appointment_date, appointment_time })
       ├─ toast("Spostato al ...")
       └─ refetchAppointments()

MonthView / WeekView / DayView
  └─ DndContext
       ├─ onDragEnd → parse droppableId → call onDropAppointment
       ├─ Droppable cells/slots
       ├─ Draggable appointment pills
       └─ DragOverlay (floating pill)
```

## Props aggiunte alle viste

| Componente | Nuova prop |
|------------|-----------|
| `MarketingCalendarMonthView` | `onDropAppointment: (id: string, newDate: string) => void` |
| `MarketingCalendarWeekView` | `onDropAppointment: (id: string, newDate: string, newTime: string) => void` |
| `MarketingCalendarDayView` | `onDropAppointment: (id: string, newDate: string, newTime: string) => void` |

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/DraggableAppointment.tsx` | Nuovo — componente draggabile |
| `src/components/marketing/DroppableSlot.tsx` | Nuovo — componente droppable generico |
| `src/components/marketing/MarketingCalendarMonthView.tsx` | Aggiunta DndContext + draggable/droppable |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Aggiunta DndContext + draggable/droppable |
| `src/components/marketing/MarketingCalendarDayView.tsx` | Aggiunta DndContext + draggable/droppable |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Aggiunta handleDropAppointment + prop passing |

Nessuna modifica DB. Nessun nuovo endpoint. Usa solo `@dnd-kit/core` già installato.

