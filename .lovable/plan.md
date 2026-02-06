

# Piano: Sezione Magazzino

## Panoramica

Creare una nuova sezione "Magazzino" che raccoglie tutti gli articoli con stato `in_magazzino` da tutti gli ordini dell'azienda. Questa vista permette di avere una panoramica completa della merce pronta per l'installazione.

---

## Design Visivo

### Layout Principale

```text
+---------------------------------------------------------------------+
| Magazzino                                                            |
| Articoli pronti per l'installazione                                  |
+---------------------------------------------------------------------+
|                                                                       |
|  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                  |
|  │ In Magazzino │ │ Da Ordinare  │ │ Ordinati     │                  |
|  │              │ │              │ │              │                  |
|  │ 12 articoli  │ │ 5 articoli   │ │ 8 articoli   │                  |
|  │ 4 ordini     │ │ 3 ordini     │ │ 4 ordini     │                  |
|  └──────────────┘ └──────────────┘ └──────────────┘                  |
|                                                                       |
|  [🔍 Cerca articolo...]  [Stato ▼]  [Ordine ▼]  [Fornitore ▼]       |
|                                                                       |
|  ┌─────────────────────────────────────────────────────────────────┐ |
|  │ Ordine ORD-001 - Mario Rossi               📅 Posa: 15/02/2026  │ |
|  ├─────────────────────────────────────────────────────────────────┤ |
|  │ ┌───────────────────────────────────────────────────────────┐   │ |
|  │ │ 🟢 Finestra Sala (x2)          Fornitore ABC   [Stato ▼]  │   │ |
|  │ └───────────────────────────────────────────────────────────┘   │ |
|  │ ┌───────────────────────────────────────────────────────────┐   │ |
|  │ │ 🟢 Porta Ingresso (x1)         Fornitore XYZ   [Stato ▼]  │   │ |
|  │ └───────────────────────────────────────────────────────────┘   │ |
|  └─────────────────────────────────────────────────────────────────┘ |
|                                                                       |
|  ┌─────────────────────────────────────────────────────────────────┐ |
|  │ Ordine ORD-003 - Luigi Verdi               📅 Posa: 20/02/2026  │ |
|  ├─────────────────────────────────────────────────────────────────┤ |
|  │ ┌───────────────────────────────────────────────────────────┐   │ |
|  │ │ 🟢 Persiane Camera (x3)        Fornitore ABC   [Stato ▼]  │   │ |
|  │ └───────────────────────────────────────────────────────────┘   │ |
|  └─────────────────────────────────────────────────────────────────┘ |
+---------------------------------------------------------------------+
```

---

## Funzionalita Principali

### 1. Statistiche Rapide (3 Card)
- **In Magazzino**: Conteggio articoli pronti
- **Da Ordinare**: Articoli ancora da ordinare (alert)
- **Ordinati**: Articoli in attesa di arrivo

### 2. Filtri
- Ricerca per nome articolo
- Filtro per stato (tutti, da_ordinare, ordinato, in_magazzino, installato)
- Filtro per ordine specifico
- Filtro per fornitore

### 3. Vista Raggruppata per Ordine
- Ogni ordine mostra:
  - Codice ordine + nome cliente
  - Data posa prevista (se presente)
  - Lista articoli con stato e fornitore
  - Possibilita di cambiare stato direttamente

### 4. Azioni Rapide
- Cambio stato articolo con dropdown
- Click sul codice ordine per andare al dettaglio
- Azione "Segna tutti come Installati" per ordine

---

## Struttura Dati

### Query Principale

```typescript
// Fetch tutti gli order_items con i relativi ordini
const { data } = await supabase
  .from("order_items")
  .select(`
    id,
    name,
    description,
    quantity,
    status,
    supplier_id,
    purchase_price,
    order:orders!inner(
      id,
      order_code,
      expected_date,
      work_start_date,
      company_id,
      customer:profiles!orders_customer_id_fkey(first_name, last_name)
    )
  `)
  .eq("order.company_id", effectiveCompany.id)
  .order("order_id");
```

### Raggruppamento per Ordine

```typescript
interface WarehouseItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  status: OrderItemStatus;
  supplier_id?: string;
  supplier_name?: string;
  purchase_price?: number;
}

interface OrderWithItems {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string | null;
  items: WarehouseItem[];
}

// Raggruppamento
const orderGroups = useMemo(() => {
  const grouped = new Map<string, OrderWithItems>();
  
  items.forEach(item => {
    const orderId = item.order.id;
    if (!grouped.has(orderId)) {
      grouped.set(orderId, {
        orderId,
        orderCode: item.order.order_code,
        customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
        expectedDate: item.order.expected_date,
        items: [],
      });
    }
    grouped.get(orderId)!.items.push(item);
  });
  
  return Array.from(grouped.values());
}, [items]);
```

---

## Componenti

### 1. Pagina Principale: `Warehouse.tsx`

```typescript
export default function Warehouse() {
  // Stati filtri
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  
  // Query articoli
  const { data: items } = useQuery({...});
  
  // Query fornitori per filtro
  const { data: suppliers } = useQuery({...});
  
  // Calcolo statistiche
  const stats = useMemo(() => {
    return {
      inMagazzino: items.filter(i => i.status === 'in_magazzino').length,
      daOrdinare: items.filter(i => i.status === 'da_ordinare').length,
      ordinati: items.filter(i => i.status === 'ordinato').length,
    };
  }, [items]);
  
  // Raggruppamento e filtri
  const filteredGroups = useMemo(() => {...}, [items, filters]);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Stat Cards */}
      {/* Filtri */}
      {/* Lista raggruppata per ordine */}
    </div>
  );
}
```

### 2. Componente Card Ordine: `WarehouseOrderCard.tsx`

```typescript
interface WarehouseOrderCardProps {
  order: OrderWithItems;
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onMarkAllInstalled: () => void;
}

function WarehouseOrderCard({ order, onStatusChange, onMarkAllInstalled }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <Link to={`/azienda/ordini/${order.orderId}`}>
              <CardTitle className="text-lg hover:underline">
                {order.orderCode || "Ordine"} - {order.customerName}
              </CardTitle>
            </Link>
            {order.expectedDate && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Posa: {formatDate(order.expectedDate)}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onMarkAllInstalled}>
            Segna tutti Installati
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {order.items.map(item => (
            <WarehouseItemRow 
              key={item.id} 
              item={item} 
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3. Componente Riga Articolo: `WarehouseItemRow.tsx`

```typescript
function WarehouseItemRow({ item, onStatusChange }: Props) {
  return (
    <div className={cn(
      "p-3 rounded-lg flex items-center justify-between",
      STATUS_CONFIG[item.status].borderColor
    )}>
      <div className="flex items-center gap-3">
        <Badge className={STATUS_CONFIG[item.status].badgeColor}>
          {item.quantity}x
        </Badge>
        <div>
          <p className="font-medium">{item.name}</p>
          {item.supplier_name && (
            <p className="text-sm text-muted-foreground">
              Fornitore: {item.supplier_name}
            </p>
          )}
        </div>
      </div>
      
      <Select
        value={item.status}
        onValueChange={(value) => onStatusChange(item.id, value)}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <SelectItem key={status} value={status}>
              {config.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

---

## Modifiche Necessarie

### File da Creare

| File | Descrizione |
|------|-------------|
| `src/pages/azienda/Warehouse.tsx` | Pagina principale Magazzino |

### File da Modificare

| File | Modifica |
|------|----------|
| `src/App.tsx` | Aggiungere route `/azienda/magazzino` |
| `src/components/layouts/CompanyLayout.tsx` | Aggiungere voce menu "Magazzino" con icona `Warehouse` |

---

## Dettagli Tecnici

### Aggiunta Menu Sidebar

```typescript
// In CompanyLayout.tsx
import { Warehouse } from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/azienda", icon: LayoutDashboard },
  { title: "Ordini", url: "/azienda/ordini", icon: ClipboardList },
  { title: "Magazzino", url: "/azienda/magazzino", icon: Warehouse }, // NUOVO
  { title: "Clienti", url: "/azienda/clienti", icon: Users },
  { title: "Assistenza", url: "/azienda/assistenza", icon: HeadphonesIcon },
  { title: "Previsionale", url: "/azienda/previsionale", icon: TrendingUp },
  { title: "Impostazioni", url: "/azienda/impostazioni", icon: Settings },
];
```

### Aggiunta Route

```typescript
// In App.tsx
import Warehouse from "@/pages/azienda/Warehouse";

// Dentro le company routes
<Route path="magazzino" element={<Warehouse />} />
```

### Mutation Cambio Stato Articolo

```typescript
const updateItemStatusMutation = useMutation({
  mutationFn: async ({ itemId, status }: { itemId: string; status: OrderItemStatus }) => {
    const { error } = await supabase
      .from("order_items")
      .update({ status })
      .eq("id", itemId);
    
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
    toast({
      title: "Stato aggiornato",
      description: "Lo stato dell'articolo e stato aggiornato.",
    });
  },
});
```

### Mutation Segna Tutti Installati

```typescript
const markAllInstalledMutation = useMutation({
  mutationFn: async (itemIds: string[]) => {
    const { error } = await supabase
      .from("order_items")
      .update({ status: "installato" })
      .in("id", itemIds);
    
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
    toast({
      title: "Articoli aggiornati",
      description: "Tutti gli articoli sono stati segnati come installati.",
    });
  },
});
```

---

## Riepilogo Funzionalita

1. **Dashboard Magazzino**: Panoramica articoli per stato
2. **Statistiche Rapide**: Card con conteggi In Magazzino, Da Ordinare, Ordinati
3. **Filtri Avanzati**: Ricerca, stato, ordine, fornitore
4. **Vista Raggruppata**: Articoli organizzati per ordine con info cliente e data posa
5. **Cambio Stato Rapido**: Dropdown per cambiare stato singolo articolo
6. **Azione di Massa**: "Segna tutti Installati" per completare un ordine
7. **Link al Dettaglio**: Click sul codice ordine per aprire il dettaglio

