

# Piano: Vista Carico di Lavoro con Heatmap

## Panoramica

Aggiungere una quarta vista "Carico" al calendario con heatmap mensile. Ogni cella del giorno ha un colore proporzionale al numero di lavori attivi, permettendo di individuare immediatamente sovraccarichi e periodi vuoti.

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/types/calendar.ts` | Modifica | Aggiungere `"heatmap"` a `CalendarViewType` |
| `src/components/calendar/CalendarHeatmapView.tsx` | Crea | Nuovo componente heatmap |
| `src/pages/azienda/Calendar.tsx` | Modifica | Aggiungere toggle "Carico" e rendering |

---

## Dettagli Implementazione

### 1. Tipo (`src/types/calendar.ts`)

Estendere il tipo union:
```typescript
export type CalendarViewType = "month" | "week" | "gantt" | "heatmap";
```

### 2. CalendarHeatmapView.tsx

**Layout**: Griglia mensile 7 colonne (Lun-Dom), come la vista Mese ma con celle colorate per intensita.

**Scala colori**:

| Lavori | Colore | Significato |
|--------|--------|-------------|
| 0 | Grigio chiaro (`bg-muted`) | Giorno vuoto |
| 1-2 | Verde (`bg-green-200`) | Carico leggero |
| 3-4 | Giallo (`bg-yellow-200`) | Carico medio |
| 5-6 | Arancione (`bg-orange-300`) | Carico alto |
| 7+ | Rosso (`bg-red-400`) | Sovraccarico |

**Logica conteggio**: Un ordine conta come attivo in un giorno se:
- Il giorno rientra nel range `work_start_date` - `work_end_date`
- Oppure coincide con `expected_date` o `warehouse_arrival_date`

**Interazioni**:
- Hover su cella: tooltip con conteggio e primi 3 ordini
- Click su ordine nel tooltip: navigazione a dettaglio ordine

**Pannello statistiche** sotto la griglia con 4 indicatori:
- Media lavori/giorno feriale
- Giorno di picco (data + conteggio)
- Giorni vuoti feriali
- Giorni critici (5+ lavori)

### 3. Calendar.tsx

- Aggiungere icona `BarChart3` da lucide-react per il toggle "Carico"
- Disponibile su desktop e mobile
- Rendering condizionale del nuovo componente

---

## Risultato Atteso

| Prima | Dopo |
|-------|------|
| 3 viste (Mese, Settimana, Gantt) | 4 viste (+Carico) |
| Nessuna visuale di sovraccarico | Heatmap con colori intuitivi |
| Analisi periodi vuoti manuale | Immediata tramite celle grigie |
| Nessuna statistica carico | Media, picco, vuoti, critici |

