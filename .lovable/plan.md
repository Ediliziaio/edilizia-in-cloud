

# Piano: Calendario Mensile con Date Posa/Merce + Modifica Date nel Gantt

## Riepilogo Modifiche

### 1. Calendario Mensile - Nuova Visualizzazione

**Situazione attuale**: Mostra barre multi-giorno basate su `work_start_date` → `work_end_date`

**Nuova logica**: Mostrare due tipi di eventi distinti per giorno:

| Tipo | Campo | Colore | Icona |
|------|-------|--------|-------|
| Data Posa | `expected_date` | Blu | 🔨 Hammer |
| Arrivo Merce | `warehouse_arrival_date` | Arancione | 📦 Package |

**Layout cella calendario**:
```text
+------------------------+
|  15                    |
|  📦 ORD-001 (Merce)    |  <- Arrivo merce
|  🔨 ORD-002 (Posa)     |  <- Data posa
+------------------------+
```

**Legenda aggiornata**:
```text
[📦 Arancione] Arrivo Merce
[🔨 Blu] Data Posa Prevista
```

---

### 2. Gantt - Dialog Modifica Date

**Situazione attuale**: Drag & drop per spostare le barre (funziona ma poco preciso)

**Nuova funzionalità**: Click su barra → Apre dialog con:
- Data Inizio Lavori (`work_start_date`)
- Data Fine Lavori (`work_end_date`)
- Data Posa Prevista (`expected_date`)
- Data Arrivo Merce (`warehouse_arrival_date`)

**UI Dialog**:
```text
+----------------------------------------+
| Modifica Date - ORD-2026-001           |
| Giuseppe Bianchi                        |
+----------------------------------------+
|                                         |
| Data Inizio Lavori    [📅 17 Feb 2026] |
| Data Fine Lavori      [📅 24 Feb 2026] |
|                                         |
| Data Posa Prevista    [📅 25 Feb 2026] |
| Arrivo Merce          [📅 13 Feb 2026] |
|                                         |
|            [Annulla]    [Salva]        |
+----------------------------------------+
```

---

## Dettagli Tecnici

### Modifiche ai Tipi

Aggiungere `warehouse_arrival_date` a `CalendarOrder`:

```typescript
export interface CalendarOrder {
  // ... campi esistenti
  warehouse_arrival_date: string | null;  // NUOVO
}
```

### Query Calendario

Aggiornare la query per includere `warehouse_arrival_date`:

```typescript
.select(`
  id,
  order_code,
  description,
  expected_date,
  warehouse_arrival_date,  // NUOVO
  work_start_date,
  work_end_date,
  ...
`)
```

### CalendarMonthView - Nuova Logica

```typescript
// Per ogni giorno, trova ordini con posa O merce in quel giorno
const getEventsForDay = (day: Date) => {
  const events: CalendarEvent[] = [];
  
  orders.forEach(order => {
    // Evento Posa
    if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
      events.push({
        type: 'posa',
        order,
        color: '#3B82F6', // blu
        icon: 'hammer',
      });
    }
    
    // Evento Arrivo Merce
    if (order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) {
      events.push({
        type: 'merce',
        order,
        color: '#F59E0B', // arancione
        icon: 'package',
      });
    }
  });
  
  return events;
};
```

### Dialog Modifica Date - Nuovo Componente

Creare `EditOrderDatesDialog.tsx`:

```typescript
interface EditOrderDatesDialogProps {
  order: CalendarOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function EditOrderDatesDialog({ order, open, onOpenChange, onSave }) {
  const [workStartDate, setWorkStartDate] = useState(order.work_start_date);
  const [workEndDate, setWorkEndDate] = useState(order.work_end_date);
  const [expectedDate, setExpectedDate] = useState(order.expected_date);
  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState(order.warehouse_arrival_date);

  const handleSave = async () => {
    await supabase.from('orders').update({
      work_start_date: workStartDate,
      work_end_date: workEndDate,
      expected_date: expectedDate,
      warehouse_arrival_date: warehouseArrivalDate,
    }).eq('id', order.id);
    
    queryClient.invalidateQueries(['calendar-orders']);
    onSave();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica Date - {order.order_code}</DialogTitle>
          <DialogDescription>
            {order.customer.first_name} {order.customer.last_name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Date Picker per ogni campo */}
          <DateField label="Data Inizio Lavori" value={workStartDate} onChange={setWorkStartDate} />
          <DateField label="Data Fine Lavori" value={workEndDate} onChange={setWorkEndDate} />
          <Separator />
          <DateField label="Data Posa Prevista" value={expectedDate} onChange={setExpectedDate} />
          <DateField label="Arrivo Merce" value={warehouseArrivalDate} onChange={setWarehouseArrivalDate} />
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Integrazione nel Gantt

In `DraggableOrderBar.tsx`, aggiungere click handler:

```typescript
// Stato per dialog
const [editDialogOpen, setEditDialogOpen] = useState(false);

const handleBarClick = (e: React.MouseEvent) => {
  // Se non stava trascinando, apri dialog
  if (!isDragging && !transform?.x) {
    setEditDialogOpen(true);
  }
};

return (
  <>
    <button onClick={handleBarClick} ...>
      {/* Barra ordine */}
    </button>
    
    <EditOrderDatesDialog 
      order={order}
      open={editDialogOpen}
      onOpenChange={setEditDialogOpen}
    />
  </>
);
```

---

## File da Modificare/Creare

| N. | File | Azione | Descrizione |
|----|------|--------|-------------|
| 1 | `src/types/calendar.ts` | Modifica | Aggiungere `warehouse_arrival_date` |
| 2 | `src/pages/azienda/Calendar.tsx` | Modifica | Includere `warehouse_arrival_date` nella query |
| 3 | `src/components/calendar/CalendarMonthView.tsx` | Modifica | Nuova logica per eventi posa/merce |
| 4 | `src/components/calendar/EditOrderDatesDialog.tsx` | Creare | Dialog modifica date |
| 5 | `src/components/calendar/DraggableOrderBar.tsx` | Modifica | Integrare dialog al click |

---

## Comportamento Finale

### Calendario Mensile
- Mostra **pallini colorati** per data posa (blu) e arrivo merce (arancione)
- Ogni ordine può avere entrambi gli eventi in giorni diversi
- Click su evento → vai al dettaglio ordine

### Gantt
- Barre trascinabili per spostare date lavoro (drag & drop esistente)
- **Click su barra** → apre dialog per modificare tutte le date
- Dopo modifica → refresh automatico del calendario

