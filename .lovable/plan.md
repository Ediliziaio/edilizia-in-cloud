

# Piano: Vista Carico di Lavoro con Heatmap

## Panoramica

Aggiungere una quarta vista "Carico" al calendario che mostra una heatmap mensile dei giorni con intensita cromatica proporzionale al numero di lavori. Permette di individuare a colpo d'occhio i periodi sovraccarichi e quelli vuoti per bilanciare meglio la pianificazione.

---

## Struttura Visiva

```text
+----------------------------------------------------------+
|  <  Febbraio 2026                                    >   |
+----------------------------------------------------------+
|  Lun   Mar   Mer   Gio   Ven   Sab   Dom               |
|  [ ]   [ ]   [1]   [2]   [3]   [ ]   [ ]               |
|  [1]   [ ]   [4]   [5]   [2]   [ ]   [ ]   <-- celle   |
|  [3]   [1]   [ ]   [1]   [6]   [ ]   [ ]       colorate |
|  ...                                                     |
+----------------------------------------------------------+
|  Riepilogo: Media 2.3 lavori/giorno | Picco: Gio 20 (6) |
|  Giorni vuoti: 8 | Giorni critici (5+): 3               |
+----------------------------------------------------------+

Legenda colori:
  [ ] grigio chiaro = 0 lavori
  [1] verde chiaro  = 1-2
  [3] giallo        = 3-4
  [5] arancione     = 5-6
  [6] rosso         = 7+
```

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/types/calendar.ts` | Modifica | Aggiungere `"heatmap"` a `CalendarViewType` |
| `src/components/calendar/CalendarHeatmapView.tsx` | Crea | Nuovo componente heatmap |
| `src/pages/azienda/Calendar.tsx` | Modifica | Aggiungere toggle e rendering |

---

## Dettagli Tecnici

### 1. Tipo (`src/types/calendar.ts`)

```typescript
export type CalendarViewType = "month" | "week" | "gantt" | "heatmap";
```

### 2. CalendarHeatmapView.tsx

**Props**: stesse della WeekView (`orders`, `currentDate`, `onDateChange`)

**Layout**:
- Griglia mensile 7 colonne (Lun-Dom), simile alla vista Mese
- Ogni cella mostra il numero di lavori attivi quel giorno
- Sfondo cella colorato con intensita proporzionale (scala 5 livelli)
- Tooltip on hover con lista ordini del giorno
- Click su cella mostra popover con dettagli ordini

**Statistiche riepilogative sotto la griglia**:
- Media lavori/giorno lavorativo (Lun-Ven)
- Giorno con picco massimo
- Numero giorni vuoti (feriali)
- Numero giorni critici (soglia 5+)

**Logica conteggio lavori per giorno** (riusa stessa logica della WeekView):
- Range `work_start_date` - `work_end_date` conta come 1 lavoro per ogni giorno nel range
- `expected_date` e `warehouse_arrival_date` contano come eventi aggiuntivi

**Scala colori heatmap**:

| Lavori | Colore | Classe Tailwind |
|--------|--------|-----------------|
| 0 | Grigio chiaro | `bg-muted` |
| 1-2 | Verde | `bg-green-200` |
| 3-4 | Giallo | `bg-yellow-200` |
| 5-6 | Arancione | `bg-orange-300` |
| 7+ | Rosso | `bg-red-400` |

### 3. Calendar.tsx

- Aggiungere icona `BarChart3` da lucide-react per il toggle "Carico"
- Disponibile sia su desktop che mobile (non nascosto come Gantt)
- Rendering condizionale con il nuovo componente

---

## Interazione Utente

1. **Hover su cella**: tooltip con conteggio e primi 3 ordini
2. **Click su cella**: Popover con lista completa ordini del giorno (codice, cliente, tipo evento)
3. **Click su ordine nel popover**: navigazione a dettaglio ordine
4. **Navigazione mese**: frecce sinistra/destra come nelle altre viste

---

## Statistiche Riepilogative

Pannello sotto la heatmap con 4 card statistiche:

| Statistica | Calcolo |
|------------|---------|
| Media giornaliera | Totale eventi / giorni feriali del mese |
| Giorno di picco | Giorno con max lavori + data |
| Giorni vuoti | Giorni feriali con 0 lavori |
| Giorni critici | Giorni con 5+ lavori |

---

## Risultato Atteso

| Funzionalita | Prima | Dopo |
|--------------|-------|------|
| Viste calendario | 3 (Mese, Settimana, Gantt) | 4 (+Carico) |
| Visione sovraccarico | Nessuna visuale immediata | Heatmap con colori intuitivi |
| Analisi periodi vuoti | Manuale, contando eventi | Immediata, celle grigie |
| Statistiche carico | Assenti | Media, picco, vuoti, critici |

