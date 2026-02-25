

# Fix: Il resize apre il dialog "nuovo appuntamento"

## Problema

Quando l'utente rilascia il resize handle, il browser genera un evento `click` che risale fino al `DroppableSlot` sottostante. Il guard `justDragged` protegge solo dal drag-and-drop, non dal resize. Risultato: dopo ogni resize si apre il form di creazione appuntamento.

## Fix

### 1. `DraggableAppointment.tsx` — Segnalare la fine del resize al parent

Aggiungere una prop opzionale `onResizeEnd?: () => void` che viene chiamata in `handlePointerUp`, subito dopo `onResize`. I view parent (WeekView, DayView) passeranno una callback che imposta `justDragged.current = true`.

### 2. `MarketingCalendarWeekView.tsx` e `MarketingCalendarDayView.tsx`

Passare a `DraggableAppointment` una nuova prop `onResizeEnd` che setta `justDragged.current = true` + timeout 200ms (identico al drag). Così il click post-resize viene bloccato.

### 3. `MarketingCalendar.tsx` — Conferma anche per il resize

Aggiungere `window.confirm` in `handleResizeAppointment`:
_"Confermi di voler modificare la durata dell'appuntamento fino alle [nuova ora]?"_

## File da modificare

| File | Modifica |
|------|----------|
| `DraggableAppointment.tsx` | Aggiungere prop `onResizeEnd`, chiamarla in `handlePointerUp` |
| `MarketingCalendarWeekView.tsx` | Passare `onResizeEnd={() => { justDragged.current = true; setTimeout(...) }}` |
| `MarketingCalendarDayView.tsx` | Stessa logica di WeekView |
| `MarketingCalendar.tsx` | Aggiungere `window.confirm` in `handleResizeAppointment` |

