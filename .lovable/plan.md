
# Piano: Pulizia e Correzione Codice Magazzino

## Problemi Identificati

### 1. Warning Console: Ref su DropdownMenu (CRITICO)

Il console log mostra un warning:
```
Warning: Function components cannot be given refs.
Check the render method of `WarehouseKanbanCard`.
```

**Causa**: La card usa `useSortable` che passa attributi ref al Card, ma il componente `DropdownMenu` (che e un `DropdownMenuPrimitive.Root`) non puo ricevere ref. Quando si usa `asChild` sul trigger, tutto funziona, ma il warning persiste perche la struttura del componente non e ottimale.

**Soluzione**: Isolare il DropdownMenu dal contesto drag-and-drop avvolgendolo in un div che blocca la propagazione degli eventi.

---

### 2. Codice Obsoleto / Ridondante

**File: `WarehouseKanbanCard.tsx`**
- Import `CSS` e `useSortable` dalla libreria dnd-kit ma `transform` e `transition` non sono necessari dato il nuovo design minimal
- La variabile `style` viene creata ma potrebbe essere semplificata

**File: `WarehouseKanbanColumn.tsx`**  
- Import `SortableContext` e `verticalListSortingStrategy` ma il sorting tra card nella stessa colonna non e implementato (solo drop su colonne)
- Potenziale inefficienza: il `SortableContext` non serve se non si fa reordering interno

---

### 3. Tipo WarehouseItem Duplicato

L'interfaccia `WarehouseItem` e definita in **4 file diversi**:
- `Warehouse.tsx`
- `WarehouseAlerts.tsx`
- `WarehouseListView.tsx`
- `WarehouseKanbanCard.tsx`
- `WarehouseKanbanColumn.tsx`
- `WarehouseKanbanView.tsx`
- `WarehouseCalendarView.tsx`
- `WarehouseStats.tsx`

**Problema**: Ogni file ha la propria copia, alcune con campi leggermente diversi (es. `warehouse_arrival_date` solo in alcuni). Questo rende difficile la manutenzione.

**Soluzione**: Creare un file `src/types/warehouse.ts` con le definizioni condivise.

---

### 4. Stato `updated_at` Non Usato

Nel file `Warehouse.tsx` e `WarehouseListView.tsx`, il campo `updated_at` viene fetchato dal database ma non viene mai visualizzato o usato.

---

## Modifiche Proposte

### File da Modificare

| File | Azione |
|------|--------|
| `src/types/warehouse.ts` | **NUOVO** - Creare types condivisi |
| `WarehouseKanbanCard.tsx` | Correggere warning ref, rimuovere codice non necessario |
| `WarehouseKanbanColumn.tsx` | Rimuovere `SortableContext` non necessario |
| `WarehouseKanbanView.tsx` | Pulizia import |
| `WarehouseAlerts.tsx` | Usare types condivisi |
| `WarehouseListView.tsx` | Usare types condivisi |
| `WarehouseCalendarView.tsx` | Usare types condivisi |
| `WarehouseStats.tsx` | Usare types condivisi |
| `Warehouse.tsx` | Usare types condivisi |

---

### 1. Nuovo File Types (`src/types/warehouse.ts`)

```typescript
export type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

export interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  updated_at?: string | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    warehouse_arrival_date?: string | null;
    company_id: string;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

export interface OrderWithItems {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string | null;
  items: WarehouseItem[];
}

export const STATUS_CONFIG: Record<OrderItemStatus, { label: string }> = {
  da_ordinare: { label: "Da Ordinare" },
  ordinato: { label: "Ordinato" },
  in_magazzino: { label: "In Magazzino" },
  installato: { label: "Installato" },
};
```

---

### 2. Fix WarehouseKanbanCard.tsx

Problema principale: il `DropdownMenu` riceve un ref dal `useSortable` che non puo gestire.

**Soluzione**:
```typescript
// PRIMA (genera warning)
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button onClick={(e) => e.stopPropagation()}>
      ...
    </Button>
  </DropdownMenuTrigger>
  ...
</DropdownMenu>

// DOPO (corretto)
<div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button>...</Button>
    </DropdownMenuTrigger>
    ...
  </DropdownMenu>
</div>
```

Inoltre, rimuovere `CSS` e la variabile `style` non necessaria se non usata.

---

### 3. Semplificare WarehouseKanbanColumn.tsx

Rimuovere `SortableContext` dato che il sorting interno alla colonna non e implementato:

```typescript
// PRIMA
<SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
  <div className="space-y-3">
    {items.map(item => <WarehouseKanbanCard ... />)}
  </div>
</SortableContext>

// DOPO (semplificato)
<div className="space-y-3">
  {items.map(item => <WarehouseKanbanCard ... />)}
</div>
```

Questo elimina codice superfluo e migliora le performance.

---

## Riepilogo Cambiamenti

1. **Creare `src/types/warehouse.ts`**: Centralizzare tutti i tipi relativi al magazzino
2. **Correggere warning ref**: Wrappare il DropdownMenu in un div con stopPropagation
3. **Rimuovere SortableContext**: Non necessario per il drop su colonne
4. **Aggiornare tutti i file warehouse**: Importare i tipi dal nuovo file condiviso
5. **Rimuovere codice non usato**: `CSS.Transform`, variabili `style` non utilizzate

---

## Impatto

- **Zero breaking changes**: Tutto funziona come prima
- **Console pulita**: Nessun warning
- **Codice piu mantenibile**: Tipi centralizzati
- **Migliori performance**: Meno contesti React inutili

