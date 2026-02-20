
# Analisi Sezione Calendario

## Stato Generale: Funzionante, ben strutturato

La sezione comprende 8 file (1 pagina + 7 componenti) con 4 viste (Mese, Settimana, Heatmap, Gantt), sistema appuntamenti CRUD, modifica rapida date ordini, drag-and-drop nel Gantt, lead time analytics, alert rischio logistico. Tutto funzionante.

---

## DEAD CODE TROVATO

### 1. Import duplicato `AlertTriangle` nel Gantt (Priorita: Bassa)
**File**: `src/components/calendar/CalendarGanttView.tsx`

`AlertTriangle` e importato DUE volte:
- Riga 37: `import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Calendar } from "lucide-react";`
- Riga 43: `import { AlertTriangle } from "lucide-react";`

Sono due import separati dallo stesso pacchetto, e `AlertTriangle` compare solo nella seconda riga. Non e un bug funzionale, ma e un antipattern: i due import dallo stesso modulo dovrebbero essere unificati.

**Fix**: Unificare i due import `lucide-react` in uno solo, spostando `AlertTriangle` nel primo import.

### 2. Funzione `calculateLeadTime` duplicata in DraggableOrderBar (Priorita: Bassa)
**File**: `src/components/calendar/DraggableOrderBar.tsx` (righe 50-55)

La funzione `calculateLeadTime` e definita localmente con la stessa identica logica di quella esportata da `LeadTimeStats.tsx` (riga 70-76). Si dovrebbe riusare l'import.

**Fix**: Importare `calculateLeadTime` da `./LeadTimeStats` e rimuovere la funzione locale.

---

## NESSUN BUG TROVATO

- Query ordini con join corretti (`customer`, `status`, `order_employees`, `order_external_teams`)
- Filtri (stato, cliente, operaio, squadra esterna) tutti funzionanti con logica coerente
- Appointments: CRUD completo, query con join ordine per codice
- EditOrderDatesDialog: 4 date editabili con `pointer-events-auto` sul Calendar (best practice seguita)
- Gantt drag-and-drop: aggiorna `work_start_date` e `work_end_date` con delta calcolato
- Gantt navigation: zoom 4 livelli, scroll auto su "oggi"
- Heatmap: calcolo corretto dei giorni lavorativi (esclude weekend), popover interattivi
- CalendarMonthView e CalendarWeekView: gestione appuntamenti con editing inline
- LeadTimeStats: calcolo lead time basato su `created_at` -> `work_end_date`
- `calendarUtils.ts`: funzioni condivise correttamente usate in 3 componenti
- Tutti gli import sono utilizzati (verificato file per file)

---

## RIEPILOGO INTERVENTI

| File | Intervento | Priorita |
|------|-----------|----------|
| `src/components/calendar/CalendarGanttView.tsx` | Unificare i due import da `lucide-react` | Bassa |
| `src/components/calendar/DraggableOrderBar.tsx` | Riusare `calculateLeadTime` da `LeadTimeStats` invece della copia locale | Bassa |

Nessun file da eliminare, nessun bug funzionale.
