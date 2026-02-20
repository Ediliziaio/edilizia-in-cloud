

# Analisi Sezione Calendario e Appuntamenti

## Stato Generale: Funzionante con un bug significativo nei filtri

La sezione comprende 9 file (1 pagina + 7 componenti + 1 utility + 1 tipo): calendario lavori con 4 viste (mese, settimana, heatmap, Gantt), appuntamenti con CRUD completo, dialog modifica date ordine, drag-and-drop nel Gantt, statistiche lead time e carico lavoro, filtri per stato/cliente/operaio/squadra.

---

## BUG TROVATO

### 1. Filtri dipendente e squadra esterna NON funzionano - mismatch nomi campo (Priorita: Alta)

**File**: `src/pages/azienda/Calendar.tsx` (righe 54-63 e 174-185)

La query Supabase alla riga 56-57 fetcha i dati con i nomi di relazione:
- `order_employees(employee:employees(id, first_name, last_name))`
- `order_external_teams(external_team:external_teams(id, name))`

Supabase restituisce i dati sotto le chiavi `order_employees` e `order_external_teams`.

Tuttavia, il tipo `CalendarOrder` (in `src/types/calendar.ts`, righe 20-32) definisce i campi come:
- `assigned_employees`
- `assigned_external_teams`

Il cast `as CalendarOrder[]` alla riga 63 non trasforma i dati, cambia solo il tipo TypeScript. A runtime, `order.assigned_employees` e sempre `undefined`.

**Conseguenze**:
1. **Filtro dipendente**: quando attivo, filtra via TUTTI gli ordini (perche `order.assigned_employees?.some(...)` restituisce `undefined`, che e falsy, quindi `!hasEmployee` e `true` e l'ordine viene escluso)
2. **Filtro squadra esterna**: stesso problema, filtra via tutti gli ordini
3. **Iniziali dipendenti** in CalendarMonthView, CalendarWeekView e DraggableOrderBar: non mostrano mai le iniziali (funzione `getEmployeeInitials` accede a `order.assigned_employees` che e `undefined`)
4. **Nomi squadre esterne** nei tooltip: non vengono mai mostrati

**Impatto**: le 4 viste calendario non mostrano MAI i nomi dei dipendenti/squadre assegnate, e i filtri per operaio/squadra sono completamente non funzionanti.

**Fix**: Rinominare i campi nel tipo `CalendarOrder` da `assigned_employees`/`assigned_external_teams` a `order_employees`/`order_external_teams`, e aggiornare tutti i riferimenti in:
- `src/types/calendar.ts` (definizione tipo)
- `src/pages/azienda/Calendar.tsx` (filtri)
- `src/lib/calendarUtils.ts` (funzioni helper)
- `src/components/calendar/CalendarMonthView.tsx` (tooltip)
- `src/components/calendar/CalendarWeekView.tsx` (card eventi)
- `src/components/calendar/CalendarHeatmapView.tsx` (popover dettaglio)
- `src/components/calendar/CalendarGanttView.tsx` (sidebar + barra)
- `src/components/calendar/DraggableOrderBar.tsx` (tooltip)

---

## DEAD CODE TROVATO

Nessun dead code trovato. Tutti gli import e le variabili sono utilizzati.

---

## NESSUN ALTRO BUG TROVATO

- Vista Mese: rendering giorni, eventi posa/merce/appuntamenti, navigazione mese corretti
- Vista Settimana: responsive mobile (Collapsible) e desktop (griglia 7 colonne), progress bar carico
- Vista Heatmap: calcolo carico lavoro, statistiche mensili (media, picco, giorni vuoti, critici), popover dettaglio con navigazione ordine
- Vista Gantt: zoom 4 livelli (settimana/mese/trimestre/anno), drag-and-drop date con salvataggio, today indicator, milestone (posa + merce), lead time, ordini non pianificati
- EditOrderDatesDialog: salvataggio 4 date (inizio/fine lavori, posa, merce) con date picker
- AppointmentDialog: CRUD completo, assegnazione utente, collegamento ordine, eliminazione
- LinkedAppointments: lista appuntamenti ordine con checkbox completamento
- LeadTimeStats: calcolo lead time medio/min/max con colorazione
- calendarUtils: `hasLogisticRisk` confronta date stringa (funziona perche formato ISO yyyy-MM-dd e ordinabile lessicograficamente)
- Filtri stato e cliente: funzionano correttamente

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/types/calendar.ts` | Rinominare `assigned_employees` -> `order_employees` e `assigned_external_teams` -> `order_external_teams` | Alta |
| `src/pages/azienda/Calendar.tsx` | Aggiornare riferimenti ai nuovi nomi campo nei filtri | Alta |
| `src/lib/calendarUtils.ts` | Aggiornare `getEmployeeInitials` e `hasLogisticRisk` (gia ok) | Alta |
| `src/components/calendar/CalendarMonthView.tsx` | Aggiornare accessi tooltip | Alta |
| `src/components/calendar/CalendarWeekView.tsx` | Aggiornare accessi card evento | Alta |
| `src/components/calendar/CalendarHeatmapView.tsx` | Aggiornare accessi popover | Alta |
| `src/components/calendar/CalendarGanttView.tsx` | Aggiornare accessi sidebar | Alta |
| `src/components/calendar/DraggableOrderBar.tsx` | Aggiornare accessi tooltip | Alta |

