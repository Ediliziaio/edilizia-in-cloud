
# Piano: Doppia Visualizzazione Ordini (Tabella + Pipeline) con Filtri Data

## Panoramica

Trasformare la pagina Ordini in una vista flessibile con:
1. **Toggle Tabella/Pipeline** - Switch per passare tra le due modalita
2. **Vista Pipeline (Kanban)** - Ordini organizzati in colonne per stato
3. **Filtri Data Avanzati** - Filtro per Data Contratto, Data Posa e Arrivo Merce

---

## Design Visivo

### Header con Toggle Visualizzazione

```
+---------------------------------------------------------------------+
| Ordini                                                               |
| Gestisci gli ordini...                      [📊 Tabella] [🗂 Pipeline]  [+ Nuovo Ordine] |
+---------------------------------------------------------------------+
```

### Sezione Filtri Ampliata

```
+---------------------------------------------------------------------+
| 🔍 [Cerca per codice, descrizione...]                                |
| [Stato ▼] [Pagamenti ▼] [Data Contratto ▼] [Arrivo Merce ▼] [Data Posa ▼] |
+---------------------------------------------------------------------+
```

Ogni filtro data sara un Popover con un mini-form:
- Range "Da - A" oppure
- Opzioni rapide: "Oggi", "Questa settimana", "Questo mese", "Prossimi 7 giorni"

### Vista Pipeline (Nuova)

```
+---------------------------------------------------------------------+
|  Contratto     |  In Produzione |  In Magazzino  |  Posa Completata |
|  Firmato (3)   |  (5)           |  (2)           |  (8)             |
+---------------+----------------+----------------+------------------+
|  ┌──────────┐ |  ┌──────────┐  |  ┌──────────┐  |  ┌──────────┐    |
|  │ ORD-001  │ |  │ ORD-005  │  |  │ ORD-012  │  |  │ ORD-003  │    |
|  │ Mario R. │ |  │ Luigi V. │  |  │ Anna B.  │  |  │ Marco P. │    |
|  │ €5.400   │ |  │ €12.000  │  |  │ €8.200   │  |  │ €15.000  │    |
|  │ 📅 15 Feb│ |  │ 🔔 Acc.1 │  |  │ ✅ OK    │  |  │ ✅ OK    │    |
|  └──────────┘ |  └──────────┘  |  └──────────┘  |  └──────────┘    |
|  ┌──────────┐ |  ┌──────────┐  |                |  ┌──────────┐    |
|  │ ORD-002  │ |  │ ORD-008  │  |                |  │ ORD-007  │    |
|  │ ...      │ |  │ ...      │  |                |  │ ...      │    |
|  └──────────┘ |  └──────────┘  |                |  └──────────┘    |
+---------------+----------------+----------------+------------------+
```

---

## Struttura Componenti

### Nuovi Componenti da Creare

| Componente | Descrizione |
|------------|-------------|
| `OrdersViewToggle.tsx` | Toggle Tabella/Pipeline con icone |
| `OrdersTableView.tsx` | Vista tabella estratta dal file attuale |
| `OrdersPipelineView.tsx` | Vista pipeline/kanban per stato |
| `OrdersPipelineColumn.tsx` | Singola colonna della pipeline |
| `OrdersPipelineCard.tsx` | Card ordine nella pipeline |
| `DateRangeFilter.tsx` | Filtro data con range picker |

---

## Dettagli Tecnici

### 1. Stato per Toggle Visualizzazione

```typescript
// In OrdersList.tsx
const [viewMode, setViewMode] = useState<"table" | "pipeline">("table");
```

### 2. Nuovi Stati per Filtri Data

```typescript
// Filtri data con range
const [contractDateRange, setContractDateRange] = useState<{
  from: Date | undefined;
  to: Date | undefined;
}>({ from: undefined, to: undefined });

const [warehouseDateRange, setWarehouseDateRange] = useState<{
  from: Date | undefined;
  to: Date | undefined;
}>({ from: undefined, to: undefined });

const [expectedDateRange, setExpectedDateRange] = useState<{
  from: Date | undefined;
  to: Date | undefined;
}>({ from: undefined, to: undefined });
```

### 3. Logica Filtro Date

```typescript
const filteredOrders = orders.filter((order) => {
  // ... filtri esistenti ...

  // Filtro Data Contratto (created_at)
  const matchesContractDate = 
    (!contractDateRange.from || new Date(order.created_at) >= contractDateRange.from) &&
    (!contractDateRange.to || new Date(order.created_at) <= contractDateRange.to);

  // Filtro Arrivo Merce
  const matchesWarehouseDate = 
    !order.warehouse_arrival_date ||
    ((!warehouseDateRange.from || new Date(order.warehouse_arrival_date) >= warehouseDateRange.from) &&
     (!warehouseDateRange.to || new Date(order.warehouse_arrival_date) <= warehouseDateRange.to));

  // Filtro Data Posa
  const matchesExpectedDate = 
    !order.expected_date ||
    ((!expectedDateRange.from || new Date(order.expected_date) >= expectedDateRange.from) &&
     (!expectedDateRange.to || new Date(order.expected_date) <= expectedDateRange.to));

  return matchesSearch && matchesStatus && matchesPayment && 
         matchesContractDate && matchesWarehouseDate && matchesExpectedDate;
});
```

### 4. Componente DateRangeFilter

```typescript
interface DateRangeFilterProps {
  label: string;
  range: { from: Date | undefined; to: Date | undefined };
  onRangeChange: (range: { from: Date | undefined; to: Date | undefined }) => void;
}

function DateRangeFilter({ label, range, onRangeChange }: DateRangeFilterProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[180px]">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {range.from || range.to ? (
            // Mostra range selezionato
            formatDateShort(range.from) + " - " + formatDateShort(range.to)
          ) : (
            label
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        {/* Quick filters */}
        <div className="space-y-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setToday()}>Oggi</Button>
          <Button size="sm" variant="ghost" onClick={() => setThisWeek()}>Questa settimana</Button>
          <Button size="sm" variant="ghost" onClick={() => setThisMonth()}>Questo mese</Button>
        </div>
        <Separator />
        {/* Date pickers Da - A */}
        <div className="grid grid-cols-2 gap-2">
          <Calendar mode="single" selected={range.from} onSelect={...} />
          <Calendar mode="single" selected={range.to} onSelect={...} />
        </div>
        <Button onClick={() => onRangeChange({ from: undefined, to: undefined })}>
          Cancella
        </Button>
      </PopoverContent>
    </Popover>
  );
}
```

### 5. Vista Pipeline

```typescript
function OrdersPipelineView({ orders, statuses }: Props) {
  // Raggruppa ordini per stato
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, OrderWithDetails[]> = {};
    
    // Inizializza tutte le colonne (anche vuote)
    statuses.forEach(status => {
      grouped[status.id] = [];
    });
    
    // Popola con ordini
    orders.forEach(order => {
      if (order.current_status_id && grouped[order.current_status_id]) {
        grouped[order.current_status_id].push(order);
      }
    });
    
    return grouped;
  }, [orders, statuses]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses
        .sort((a, b) => a.position - b.position)
        .map(status => (
          <OrdersPipelineColumn 
            key={status.id}
            status={status}
            orders={ordersByStatus[status.id]}
          />
        ))}
    </div>
  );
}
```

### 6. Card Pipeline

```typescript
function OrdersPipelineCard({ order }: { order: OrderWithDetails }) {
  const pendingPayments = getPendingPayments(order);
  
  return (
    <Link to={`/azienda/ordini/${order.id}`}>
      <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer">
        <div className="space-y-2">
          {/* Codice */}
          <p className="font-medium text-sm">{order.order_code || "—"}</p>
          
          {/* Cliente */}
          <p className="text-sm text-muted-foreground">
            {order.customer?.first_name} {order.customer?.last_name}
          </p>
          
          {/* Totale */}
          <p className="font-semibold">{formatCurrency(order.total_amount)}</p>
          
          {/* Footer: Data Posa + Badge Pagamenti */}
          <div className="flex items-center justify-between">
            {order.expected_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {formatDateShort(order.expected_date)}
              </span>
            )}
            
            {pendingPayments.length > 0 ? (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                {pendingPayments.join(", ")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-600 border-green-300">
                OK
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
```

---

## Layout Filtri (Responsive)

### Desktop
```
[🔍 Cerca...                    ] [Stato ▼] [Pagamenti ▼]
[Data Contratto ▼] [Arrivo Merce ▼] [Data Posa ▼]        [Pulisci Filtri]
```

### Mobile
Tutti i filtri in colonna verticale, collassabili in un accordion "Filtri Avanzati".

---

## File da Modificare/Creare

| File | Azione |
|------|--------|
| `src/pages/azienda/OrdersList.tsx` | Refactor principale con toggle e filtri |
| `src/components/orders/OrdersTableView.tsx` | **Nuovo** - Estrazione vista tabella |
| `src/components/orders/OrdersPipelineView.tsx` | **Nuovo** - Vista pipeline |
| `src/components/orders/OrdersPipelineCard.tsx` | **Nuovo** - Card per pipeline |
| `src/components/orders/DateRangeFilter.tsx` | **Nuovo** - Filtro data range |

---

## Riepilogo Funzionalita

1. **Toggle Visualizzazione**: Switch tra Tabella e Pipeline con icone (LayoutList, Columns3)
2. **Vista Pipeline**: Colonne per ogni stato ordine, card draggable (opzionale in futuro)
3. **Filtro Data Contratto**: Range picker sulla data creazione ordine
4. **Filtro Arrivo Merce**: Range picker sulla data warehouse_arrival_date
5. **Filtro Data Posa**: Range picker sulla data expected_date
6. **Quick Filters**: Oggi, Questa settimana, Questo mese, Prossimi 7 giorni
7. **Reset Filtri**: Pulsante per pulire tutti i filtri attivi
8. **Responsive**: Filtri collassabili su mobile, pipeline scrollabile orizzontalmente

