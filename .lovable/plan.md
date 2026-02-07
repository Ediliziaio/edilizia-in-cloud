

# Piano: Drag & Drop Gantt, Filtri e Vista Giornaliera con Lead Time

## Panoramica Funzionalita

Implementare 4 miglioramenti principali per la sezione Calendario:

1. **Drag & Drop** - Trascinare le barre nel Gantt per spostare le date degli ordini
2. **Filtri** - Filtrare per stato ordine e cliente
3. **Vista Giornaliera** - Aggiungere livello zoom "Settimana" con dettaglio giorni
4. **Lead Time** - Calcolo automatico tempo da contratto firmato a chiusura lavori

---

## 1. Drag & Drop nel Gantt

### Architettura

Utilizzare `@dnd-kit` gia presente nel progetto (usato in Pipeline e Warehouse).

| Componente | Ruolo |
|------------|-------|
| `DndContext` | Wrapper per gestire drag events |
| `useDraggable` | Hook per rendere le barre trascinabili |
| `DragOverlay` | Preview durante il trascinamento |

### Logica di Spostamento

Quando l'utente rilascia la barra:
1. Calcolare la nuova posizione X in pixel
2. Convertire in numero di giorni dall'inizio del periodo visibile
3. Calcolare la nuova `work_start_date`
4. Mantenere la durata originale (differenza tra start e end)
5. Aggiornare `work_start_date` e `work_end_date` nel database

### Vincoli

- Minimo spostamento: 1 giorno
- La barra non puo uscire dal periodo visibile durante il drag
- Feedback visivo durante il trascinamento (ombra/opacita)

### Database Update

```typescript
const handleDragEnd = async (orderId: string, newStartDate: Date, duration: number) => {
  const newEndDate = addDays(newStartDate, duration);
  
  await supabase
    .from("orders")
    .update({
      work_start_date: format(newStartDate, "yyyy-MM-dd"),
      work_end_date: format(newEndDate, "yyyy-MM-dd"),
    })
    .eq("id", orderId);
    
  // Invalidate query per refresh
  queryClient.invalidateQueries(["calendar-orders"]);
};
```

---

## 2. Filtri per Stato e Cliente

### UI Filtri

Posizionati sopra il toggle Vista Mese/Gantt:

```text
+------------------------------------------------------------------+
| Calendario Lavori                                                 |
+------------------------------------------------------------------+
| [Tutti gli stati v]  [Tutti i clienti v]  | [Mese] [Gantt] [Oggi]|
+------------------------------------------------------------------+
```

### Componenti Select

Utilizzo dei componenti `Select` gia presenti:

```typescript
// Filtro Stati
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Tutti gli stati" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Tutti gli stati</SelectItem>
    {statuses.map(s => (
      <SelectItem key={s.id} value={s.id}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
          {s.name}
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>

// Filtro Clienti
<Select value={customerFilter} onValueChange={setCustomerFilter}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Tutti i clienti" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Tutti i clienti</SelectItem>
    {uniqueCustomers.map(c => (
      <SelectItem key={c.id} value={c.id}>
        {c.first_name} {c.last_name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Query Aggiuntiva

Fetch degli stati aziendali per popolare il filtro:

```typescript
const { data: statuses } = useQuery({
  queryKey: ["order-statuses", effectiveCompany?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from("order_statuses")
      .select("id, name, color")
      .eq("company_id", effectiveCompany.id)
      .order("position");
    return data;
  },
});
```

### Logica Filtraggio

```typescript
const filteredOrders = useMemo(() => {
  return scheduledOrders.filter(order => {
    // Filtro stato
    if (statusFilter !== "all" && order.current_status_id !== statusFilter) {
      return false;
    }
    // Filtro cliente
    if (customerFilter !== "all" && order.customer_id !== customerFilter) {
      return false;
    }
    return true;
  });
}, [scheduledOrders, statusFilter, customerFilter]);
```

---

## 3. Vista Giornaliera (Settimana)

### Nuovo Livello Zoom

Aggiungere "week" ai livelli zoom esistenti:

```typescript
export type GanttZoom = "year" | "quarter" | "month" | "week";

const ZOOM_CONFIG: Record<GanttZoom, { dayWidth: number; label: string }> = {
  year: { dayWidth: 3, label: "Anno" },
  quarter: { dayWidth: 8, label: "Trimestre" },
  month: { dayWidth: 25, label: "Mese" },
  week: { dayWidth: 80, label: "Settimana" },  // NUOVO
};
```

### Layout Settimana

```text
+----------+----+----+----+----+----+----+----+
| Cliente  | Lu | Ma | Me | Gi | Ve | Sa | Do |
+----------+----+----+----+----+----+----+----+
| G.Bianchi| 10 | 11 | 12 | 13 | 14 | 15 | 16 |
|          |[▓▓▓▓▓▓▓▓▓▓▓▓]|    |    |    |    |
+----------+----+----+----+----+----+----+----+
```

### Caratteristiche Vista Settimana

- Header con giorno della settimana + numero giorno
- Larghezza colonna: 80px per giorno
- Barre piu dettagliate con orari (se implementato in futuro)
- Navigazione: settimana precedente/successiva

### Navigazione Settimana

```typescript
case "week":
  start = startOfWeek(currentDate, { weekStartsOn: 1 });
  end = endOfWeek(currentDate, { weekStartsOn: 1 });
  break;

// handlePrev/handleNext
case "week":
  onDateChange(subWeeks(currentDate, 1));
  break;
```

---

## 4. Calcolo Lead Time

### Definizione

**Lead Time** = Tempo tra `created_at` (data creazione ordine/contratto) e `work_end_date` (chiusura lavori).

### Dati Necessari

```typescript
// Estendere CalendarOrder
export interface CalendarOrder {
  // ... campi esistenti
  created_at: string;  // AGGIUNGERE per lead time
  customer_id: string; // AGGIUNGERE per filtro
  current_status_id: string | null; // AGGIUNGERE per filtro
}
```

### Calcolo e Visualizzazione

**Nel Tooltip della barra Gantt:**

```typescript
// Calcolo lead time
const calculateLeadTime = (order: CalendarOrder) => {
  if (!order.work_end_date) return null;
  
  const contractDate = new Date(order.created_at);
  const endDate = new Date(order.work_end_date);
  const days = differenceInDays(endDate, contractDate);
  
  return days;
};

// Nel tooltip
<p className="text-xs text-muted-foreground">
  Lead Time: {leadTime} giorni
</p>
```

**Nella colonna sinistra del Gantt:**

```text
| Cliente / Ordine    | Lead Time |
|---------------------|-----------|
| Giuseppe Bianchi    | 45 giorni |
| ORD-2026-001        |           |
```

**Indicatore visivo:**

- Verde: < 30 giorni
- Giallo: 30-60 giorni
- Rosso: > 60 giorni

### Statistiche Lead Time

Aggiungere un riepilogo in fondo al Gantt:

```text
Lead Time Medio: 42 giorni | Min: 15g | Max: 78g
```

---

## Modifiche ai File

| File | Tipo | Modifiche |
|------|------|-----------|
| `src/types/calendar.ts` | Modifica | Aggiungere campi `created_at`, `customer_id`, `current_status_id`; aggiungere zoom "week" |
| `src/pages/azienda/Calendar.tsx` | Modifica | Aggiungere filtri, query statuses, props extra ai componenti |
| `src/components/calendar/CalendarGanttView.tsx` | Modifica | Implementare drag&drop, zoom week, lead time, colonna lead time |
| `src/components/calendar/CalendarMonthView.tsx` | Modifica | Supportare filtri (passa ordini gia filtrati) |

---

## Dettagli Tecnici

### Drag & Drop - Struttura Codice

```typescript
// CalendarGanttView.tsx
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

// Componente barra draggable
function DraggableOrderBar({ order, bar, dayWidth, color, onNavigate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { order, bar },
  });

  const style = {
    left: bar.left + (transform?.x || 0),
    width: Math.max(bar.width, dayWidth),
    backgroundColor: color,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="absolute top-2 bottom-2 rounded shadow-sm cursor-grab active:cursor-grabbing"
      style={style}
    >
      {/* contenuto barra */}
    </button>
  );
}
```

### Calcolo Nuova Data

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, delta } = event;
  if (!delta?.x) return;

  const orderData = active.data.current as { order: CalendarOrder; bar: BarInfo };
  const daysMoved = Math.round(delta.x / dayWidth);
  
  if (daysMoved === 0) return;

  const currentStart = parseISO(orderData.order.work_start_date || orderData.order.expected_date!);
  const currentEnd = orderData.order.work_end_date 
    ? parseISO(orderData.order.work_end_date) 
    : currentStart;
  
  const newStart = addDays(currentStart, daysMoved);
  const newEnd = addDays(currentEnd, daysMoved);

  await onDateChange(orderData.order.id, newStart, newEnd);
};
```

---

## UI Completa Finale

```text
+--------------------------------------------------------------------------+
| Calendario Lavori                                                         |
| Pianifica e visualizza i lavori programmati                               |
+--------------------------------------------------------------------------+
| [Tutti gli stati v] [Tutti i clienti v] | [Mese] [Gantt] | [Oggi]        |
+--------------------------------------------------------------------------+
|                                                                           |
|  <- Febbraio 2026 ->    [Settimana] [Mese] [Trimestre] [Anno]            |
|                                                                           |
+-----------------+----+----+----+----+----+----+----+----------------------+
| Cliente/Ordine  | LT | Lu | Ma | Me | Gi | Ve | Sa | Do |                |
+-----------------+----+----+----+----+----+----+----+----+                |
| G. Bianchi      | 45g| [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓]         |  <- Trascinabile |
| ORD-2026-003    |    |                                |                  |
+-----------------+----+----+----+----+----+----+----+----+                |
| M. Verdi        | 38g|              [▓▓▓▓▓▓▓▓]        |                  |
| ORD-2026-001    |    |                                |                  |
+-----------------+----+----+----+----+----+----+----+----+----------------+
|                                                                           |
| Lead Time Medio: 42g | Min: 15g | Max: 78g                               |
+--------------------------------------------------------------------------+
```

---

## Riepilogo Implementazione

1. **Drag & Drop**: Utilizzo dnd-kit per trascinare barre, calcolo delta in giorni, update database
2. **Filtri**: Select per stato e cliente, logica filtraggio in useMemo
3. **Vista Settimana**: Nuovo zoom level con dayWidth=80px, header giorni settimana
4. **Lead Time**: Calcolo differenceInDays, visualizzazione in colonna + tooltip + statistiche

