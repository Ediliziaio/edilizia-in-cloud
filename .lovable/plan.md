

# Miglioramento Gantt — Approccio da esperto logistico

## Problemi attuali

1. **`GanttZoom` include ancora "week"** — rimosso dalla vista calendario ma rimasto nel tipo e in tutto il Gantt (ZOOM_CONFIG, toggle, handlePrev/Next, getPeriodLabel, header rendering)
2. **Header timeline a livello singolo** — i Gantt professionali usano doppio livello (mese sopra, giorni/settimane sotto)
3. **Nessuna distinzione weekend** — sabato/domenica sono identici ai feriali
4. **Ordini non ordinati** — appaiono in ordine casuale anziché per data di inizio
5. **Nessun indicatore di progresso** — le barre non mostrano l'avanzamento temporale
6. **Milestone dots senza Tooltip component** — usano solo `title` HTML nativo
7. **Nessuna barra di capacità giornaliera** — non si vede quante risorse sono impegnate per giorno

## Modifiche pianificate

### 1. `src/types/calendar.ts`
- Rimuovere `"week"` da `GanttZoom`: `"year" | "quarter" | "month"`

### 2. `src/components/calendar/CalendarGanttView.tsx` — Riscrittura significativa

**Pulizia week:**
- Rimuovere `week` da `ZOOM_CONFIG`
- Rimuovere tutti i `case "week"` da `handlePrev`, `handleNext`, `getPeriodLabel`, `useMemo` del range date
- Rimuovere il `ToggleGroupItem value="week"` e l'import `Calendar`, `addWeeks`, `subWeeks`, `startOfWeek`, `endOfWeek`
- Rimuovere il rendering condizionale `zoom === "week"` nell'header

**Header a doppio livello:**
- Riga superiore: nomi dei mesi (come ora)
- Riga inferiore: numeri dei giorni (per zoom mese) o numeri settimane (per zoom trimestre), nulla per anno
- Header totale da 12px → ~20px (due righe)

**Weekend shading:**
- Colonne sabato/domenica con sfondo `bg-muted/40` + bordo più visibile
- Applicare sia al grid lines che all'header inferiore

**Ordinamento ordini:**
- Ordinare per `work_start_date` (o `expected_date` come fallback), poi per cognome cliente
- Ordini senza date vanno in fondo

**Barra progresso:**
- Calcolare % avanzamento = `(oggi - inizio) / (fine - inizio)` clamped 0-100%
- Renderizzare una porzione più scura della barra fino alla % corrente
- Solo per ordini con `work_start_date` e `work_end_date`

**Milestone con Tooltip proper:**
- Sostituire i `div` con `title` con `Tooltip` + `TooltipTrigger` + `TooltipContent` di Radix
- Mostrare data formattata e label nel tooltip

**Barra capacità giornaliera (resource row):**
- Riga in basso della timeline che mostra quanti ordini sono attivi per ogni giorno
- Colorazione: verde (1-2), giallo (3-4), rosso (5+) — parametrizzabile
- Aiuta il responsabile logistico a bilanciare il carico

### 3. `src/components/calendar/DraggableOrderBar.tsx`
- Aggiungere prop `progress` (0-100) per renderizzare la porzione completata della barra con un colore più scuro
- Mostrare la durata in giorni sulla barra quando c'è spazio

## Impatto
- Nessun cambiamento funzionale al drag-and-drop o al salvataggio date
- UX molto più professionale e leggibile per la pianificazione logistica
- Rimozione codice morto (week zoom)

