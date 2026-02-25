

# Fix: Il drag apre il form "nuovo appuntamento" invece di spostare

## Problema

Quando trascini un appuntamento su un nuovo slot, succedono **due cose insieme**:

1. `handleDragEnd` → sposta correttamente l'appuntamento (funziona)
2. `onClick` del `DroppableSlot` sottostante → si attiva subito dopo il drop, aprendo il dialog "Prenota appuntamento"

Il click sul slot non viene bloccato dopo un drag, quindi il browser lo interpreta come un click normale.

Inoltre l'utente vuole un **messaggio di conferma** prima dello spostamento: _"Confermi di voler spostare l'appuntamento dalle X alle Y?"_

## Fix

### 1. Bloccare il click dopo un drag (WeekView + DayView)

In `MarketingCalendarWeekView.tsx` e `MarketingCalendarDayView.tsx`:

- Aggiungere un `useRef<boolean>` chiamato `justDragged`
- In `handleDragEnd`: impostare `justDragged.current = true` e resettarlo dopo 100ms con `setTimeout`
- Nell'`onClick` del `DroppableSlot`: controllare `justDragged.current` e se `true`, non chiamare `onClickSlot`

Questo impedisce che il click post-drag apra il form di creazione.

### 2. Conferma prima dello spostamento (MarketingCalendar.tsx)

In `handleDropAppointment`:

- Prima di eseguire l'update su database, mostrare un **dialog di conferma** (usando `window.confirm` per semplicità, o un toast interattivo)
- Messaggio: _"Confermi di voler spostare l'appuntamento dalle {ora originale} alle {nuova ora}?"_
- Se l'utente annulla, non fare nulla

## File da modificare

| File | Modifica |
|------|----------|
| `MarketingCalendarWeekView.tsx` | Ref `justDragged` + guard su onClick slot |
| `MarketingCalendarDayView.tsx` | Stessa logica di WeekView |
| `MarketingCalendar.tsx` | Aggiungere `window.confirm` in `handleDropAppointment` prima dell'update |

