
# Piano Fase 1: Vista Settimanale Dedicata

## Panoramica

Aggiungere una nuova vista "Settimana" al calendario, ottimizzata per la pianificazione operativa giornaliera. Questa vista mostrera i lavori su 7 giorni con maggior dettaglio rispetto alla vista Mese, includendo fasce orarie e indicatori di capacita.

---

## Architettura Attuale

| Componente | Funzione |
|------------|----------|
| `Calendar.tsx` | Pagina principale, gestisce filtri e switch vista |
| `CalendarMonthView.tsx` | Griglia 7x5/6 con eventi puntuali |
| `CalendarGanttView.tsx` | Timeline orizzontale con barre drag-and-drop |
| `CalendarViewType` | Tipo union `"month" \| "gantt"` |

---

## Nuova Architettura

```text
src/components/calendar/
+-- CalendarMonthView.tsx      (esistente)
+-- CalendarGanttView.tsx      (esistente)
+-- CalendarWeekView.tsx       (NUOVO)
+-- DraggableOrderBar.tsx      (esistente)
+-- EditOrderDatesDialog.tsx   (esistente)
+-- LeadTimeStats.tsx          (esistente)

src/types/calendar.ts
  CalendarViewType: "month" | "week" | "gantt"  (aggiornato)
```

---

## Modifiche da Effettuare

### 1. Aggiornare Tipi (`src/types/calendar.ts`)

Estendere `CalendarViewType` per includere la nuova vista:

```typescript
export type CalendarViewType = "month" | "week" | "gantt";
```

### 2. Creare CalendarWeekView.tsx

Nuovo componente con le seguenti caratteristiche:

**Layout**
- 7 colonne (Lun-Dom) con header giorno/data
- Righe per ogni ordine attivo nella settimana
- Altezza maggiore per ogni giorno (150px vs 100px della vista mese)

**Funzionalita**
- Navigazione settimana precedente/successiva
- Evidenziazione giorno corrente
- Click su ordine per aprire dettaglio
- Indicatore visivo "oggi"
- Badge con conteggio lavori per giorno
- Fasce colore per tipologia evento (Posa blu, Merce arancione, Lavori in corso verde)

**Struttura UI proposta**
```text
+----------------------------------------------------------+
|  < Settimana  8-14 Febbraio 2026                     >   |
+----------------------------------------------------------+
|  LUN 8    |  MAR 9   |  MER 10  |  GIO 11  |  VEN 12  ...|
|  [3 lavori]  [1]       [2]        [5]        [2]          |
+----------------------------------------------------------+
|  ORD-001  |          |  [POSA]  |          |              |
|  Rossi    |          |          |          |              |
+----------------------------------------------------------+
|  ORD-002  | [MERCE]  |          | [POSA]   |              |
|  Bianchi  |          |          |          |              |
+----------------------------------------------------------+
```

**Indicatori Capacita**
- Badge numerico sopra ogni giorno
- Colore semantico: verde (1-2 lavori), giallo (3-4), rosso (5+)

### 3. Modificare Calendar.tsx

**Aggiornare ToggleGroup** per includere nuova vista:

```typescript
<ToggleGroup type="single" value={view} onValueChange={...}>
  <ToggleGroupItem value="month">Mese</ToggleGroupItem>
  <ToggleGroupItem value="week">Settimana</ToggleGroupItem>  {/* NUOVO */}
  {!isMobile && (
    <ToggleGroupItem value="gantt">Gantt</ToggleGroupItem>
  )}
</ToggleGroup>
```

**Aggiornare rendering condizionale**:

```typescript
{view === "month" ? (
  <CalendarMonthView ... />
) : view === "week" ? (
  <CalendarWeekView ... />  {/* NUOVO */}
) : (
  <CalendarGanttView ... />
)}
```

---

## Dettagli Tecnici CalendarWeekView.tsx

### Props

```typescript
interface CalendarWeekViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}
```

### Logica Principale

```typescript
// Calcolo giorni della settimana
const weekDays = useMemo(() => {
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const end = endOfWeek(currentDate, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}, [currentDate]);

// Raggruppamento ordini per giorno
const getOrdersForDay = (day: Date) => {
  return orders.filter(order => {
    // Ordine attivo se il giorno rientra nel range work_start - work_end
    // OPPURE se expected_date/warehouse_arrival_date coincide
    const start = order.work_start_date ? parseISO(order.work_start_date) : null;
    const end = order.work_end_date ? parseISO(order.work_end_date) : start;
    
    if (start && end) {
      return day >= start && day <= end;
    }
    
    // Eventi puntuali
    if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) return true;
    if (order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) return true;
    
    return false;
  });
};

// Conteggio lavori per giorno (capacita)
const getWorkloadForDay = (day: Date): number => {
  return getOrdersForDay(day).length;
};

const getWorkloadColor = (count: number): string => {
  if (count <= 2) return "text-green-600 bg-green-100";
  if (count <= 4) return "text-yellow-600 bg-yellow-100";
  return "text-red-600 bg-red-100";
};
```

### Navigazione

```typescript
const handlePrevWeek = () => onDateChange(subWeeks(currentDate, 1));
const handleNextWeek = () => onDateChange(addWeeks(currentDate, 1));
```

---

## File da Creare/Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/types/calendar.ts` | Modifica | Aggiungere `"week"` a `CalendarViewType` |
| `src/components/calendar/CalendarWeekView.tsx` | Crea | Nuovo componente vista settimanale |
| `src/pages/azienda/Calendar.tsx` | Modifica | Aggiungere toggle e rendering vista week |

---

## Risultato Atteso

| Funzionalita | Prima | Dopo |
|--------------|-------|------|
| Viste disponibili | 2 (Mese, Gantt) | 3 (Mese, Settimana, Gantt) |
| Dettaglio giornaliero | Solo in Gantt zoom week | Vista dedicata ottimizzata |
| Indicatori capacita | Nessuno | Badge colorati per giorno |
| Mobile | Solo vista Mese | Mese + Settimana |

---

## Verifica Post-Implementazione

1. Aprire Calendario e verificare toggle "Settimana" presente
2. Navigare tra settimane (frecce)
3. Verificare evidenziazione giorno corrente
4. Verificare badge capacita colorati
5. Click su ordine porta al dettaglio
6. Testare su mobile (toggle disponibile)
7. Verificare filtri stato/cliente funzionanti anche in vista week
