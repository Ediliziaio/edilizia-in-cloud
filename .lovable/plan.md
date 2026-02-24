

# Piano: Fix click vs drag + Ridimensionamento appuntamenti

## Problema 1: Click non apre il dialog di modifica

**Causa**: Il componente `DraggableAppointment` applica `{...listeners}` direttamente sul wrapper, intercettando tutti gli eventi mouse (compreso il click). Un click rapido viene interpretato come drag start/end e l'`onClick` interno non viene mai raggiunto.

**Soluzione**: Usare `PointerSensor` con `activationConstraint: { distance: 5 }` nel `DndContext`. Così il drag si attiva solo se il mouse si muove di almeno 5px — un click rapido passa attraverso normalmente.

File coinvolti:
- `MarketingCalendarDayView.tsx` — aggiungere `useSensors` con `PointerSensor` e `distance: 5`
- `MarketingCalendarWeekView.tsx` — stessa modifica
- `MarketingCalendarMonthView.tsx` — stessa modifica

## Problema 2: Ridimensionamento appuntamenti (durata)

**Obiettivo**: Trascinando il bordo inferiore di un appuntamento si modifica `appointment_end_time`.

**Approccio**: Aggiungere un handle di resize sul bordo inferiore della pill. Al mousedown sull'handle, tracciare il movimento verticale e calcolare il nuovo `appointment_end_time` in base alla griglia degli slot. Al mouseup, salvare su DB.

### Dettaglio implementazione

**Prerequisito**: Gli appuntamenti devono occupare visivamente più righe se la loro durata copre più slot. Attualmente ogni appuntamento è mostrato solo nello slot del suo `appointment_time`. Serve calcolare l'altezza in base a `appointment_time` → `appointment_end_time`.

### Modifiche componenti

**`DraggableAppointment.tsx`** — Aggiungere:
- Prop `onResize: (id: string, newEndTime: string) => void`
- Prop `slotDurationMinutes: number`
- Prop `slotHeightPx: number` (altezza in px di uno slot per calcolo proporzionale)
- Un div handle `.resize-handle` posizionato sul bordo inferiore (`cursor-s-resize`, `h-1.5`)
- Logica mousedown/mousemove/mouseup sull'handle per calcolare il delta in minuti e il nuovo end time
- L'handle non propaga l'evento al drag (stopPropagation)

**`MarketingCalendarDayView.tsx`** e **`MarketingCalendarWeekView.tsx`**:
- Calcolare l'altezza visiva dell'appuntamento: `spanSlots = (endMin - startMin) / slotDurationMinutes`, poi `height = spanSlots * slotHeightPx`
- Posizionare l'appuntamento con `position: absolute` dentro lo slot, con `top` calcolato dall'offset e `height` dalla durata
- Lo slot droppable diventa `position: relative` per contenere gli appuntamenti posizionati
- Nuova prop `onResizeAppointment: (id: string, newEndTime: string) => void`

**`MarketingCalendar.tsx`**:
- Nuova funzione `handleResizeAppointment(id, newEndTime)`:
  - Update su DB: `supabase.from("appointments").update({ appointment_end_time: newEndTime }).eq("id", id)`
  - Toast di conferma
  - `refetchAppointments()`
- Passare `onResizeAppointment` alle viste Day e Week

### Struttura visiva

```text
Prima (ogni apt in 1 slot):
  09:00  ▏ [Apt A - 09:00]
  09:30  ▏ 
  10:00  ▏ [Apt B - 10:00]

Dopo (apt con altezza proporzionale):
  09:00  ▏ ┌─ Apt A ──────────┐
  09:30  ▏ │                  │
  10:00  ▏ └──── ═══ resize ──┘  ← handle
         ▏ ┌─ Apt B ──────────┐
  10:30  ▏ └──── ═══ resize ──┘
```

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/DraggableAppointment.tsx` | Aggiunta handle resize + logica mouse tracking |
| `src/components/marketing/MarketingCalendarDayView.tsx` | `useSensors` con distance, appuntamenti con altezza proporzionale, prop `onResizeAppointment` |
| `src/components/marketing/MarketingCalendarWeekView.tsx` | Stesse modifiche del DayView |
| `src/components/marketing/MarketingCalendarMonthView.tsx` | Solo `useSensors` con distance (no resize nella vista mese) |
| `src/pages/azienda/marketing/MarketingCalendar.tsx` | Nuova `handleResizeAppointment` + passaggio prop |

Nessuna modifica DB (il campo `appointment_end_time` esiste già nella tabella `appointments`).

