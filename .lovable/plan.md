

# Prompt 3 — Calendario: Vista Settimanale + Drag & Drop + Conflict Detection + Reminder

Il documento chiede 4 fix per il calendario. Ecco il piano.

---

## FIX 3A — Vista Settimanale

### Nuovo componente: `src/components/calendar/CalendarWeekView.tsx`
- 7 colonne (Lun-Dom), righe orarie dalle 06:00 alle 20:00 (slot da 30 min)
- Mostra ordini (posa, lavoro, merce) come blocchi giornalieri nella fascia superiore (all-day)
- Mostra appuntamenti con orario come blocchi posizionati nella griglia oraria
- Mostra Google busy slots
- Navigazione settimana avanti/indietro
- Riceve stesse props della MonthView (orders, appointments, busySlots, hiddenEventTypes, etc.)

### Modifiche a `Calendar.tsx`
- Aggiungere `"week"` al type `CalendarViewType` in `src/types/calendar.ts`
- Aggiungere toggle "Settimana" nel ToggleGroup (icona `CalendarDays`)
- Renderizzare `CalendarWeekView` quando `view === "week"`

---

## FIX 3B — Drag & Drop eventi (nella vista settimanale)
- Nella WeekView, gli appuntamenti e gli ordini con date sono draggabili tra i giorni della settimana
- Al drop: modale di conferma "Spostare [evento] da [giorno1] a [giorno2]?"
- Al conferma: aggiorna `appointment_date` (per appuntamenti) o `expected_date`/`work_start_date`/`work_end_date` (per ordini) via Supabase
- Uso di `@dnd-kit/core` (già installato nel progetto)
- Invalidazione query dopo salvataggio

---

## FIX 3C — Conflict Detection risorse
### Nuovo hook: `src/hooks/useConflictDetection.ts`
- Riceve ordini e appuntamenti
- Raggruppa per `employee_id + data` → trova giorni con 2+ eventi assegnati allo stesso dipendente
- Restituisce una `Map<string, CalendarEvent[]>` con i conflitti

### UI
- Badge rosso "X conflitti" visibile nell'header del calendario quando ci sono conflitti
- Nella vista settimanale/mensile: celle con conflitto hanno bordo rosso e tooltip con dettagli
- Popover cliccabile con lista dei conflitti e link ai rispettivi ordini/appuntamenti

---

## FIX 3D — Reminder automatici pre-evento

### Database Migration
- Aggiungere colonna `reminder_minutes integer DEFAULT NULL` alla tabella `appointments`
- Aggiungere colonna `reminder_sent boolean DEFAULT false`
- Creare tabella `appointment_reminders_sent` se non esiste già (da verificare — il plan.md dice che esiste già dalla Fase 2 P1)

### UI — AppointmentDialog
- Aggiungere dropdown "Promemoria" con opzioni: Nessuno, 1h prima, 2h prima, 24h prima
- Salvare il valore in `reminder_minutes` (60, 120, 1440, null)

### Backend
- La edge function `check-scheduled-triggers` (già esistente) includerà logica per controllare appuntamenti con `reminder_minutes IS NOT NULL AND reminder_sent = false` e `appointment_date + appointment_time - reminder_minutes <= NOW()`
- Inserisce notifica interna via `lifecycle_notifications`

---

## File da creare/modificare

| File | Azione |
|------|--------|
| `src/types/calendar.ts` | Aggiungere `"week"` a CalendarViewType |
| `src/components/calendar/CalendarWeekView.tsx` | Nuovo componente vista settimanale con DnD |
| `src/hooks/useConflictDetection.ts` | Nuovo hook conflict detection |
| `src/pages/azienda/Calendar.tsx` | Toggle settimana, badge conflitti, render WeekView |
| `src/components/appointments/AppointmentDialog.tsx` | Dropdown reminder |
| Migration SQL | Colonne `reminder_minutes`, `reminder_sent` su appointments |
| `supabase/functions/check-scheduled-triggers/index.ts` | Aggiungere logica reminder appuntamenti |

