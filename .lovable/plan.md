

# Nascondere articoli degli ordini completati dal filtro "Da Lavorare"

## Problema
Attualmente il filtro "Da Lavorare" esclude solo gli articoli con status `installato`. Ma se un ordine ha raggiunto l'ultima fase del Progress Tracker (l'`order_status` con `position` più alta), i suoi articoli dovrebbero uscire automaticamente dalla vista attiva — anche se il singolo articolo non è marcato `installato`.

## Soluzione

### 1. Aggiungere `current_status_id` alla query warehouse
In `useWarehouseData.ts`, includere `current_status_id` nella select dell'ordine:
```
order:orders!inner(
  id, order_code, expected_date, work_start_date,
  warehouse_arrival_date, company_id, current_status_id,
  customer:profiles!orders_customer_id_fkey(first_name, last_name)
)
```

### 2. Fetch degli order_statuses della company
Aggiungere una query per caricare gli `order_statuses` della company, per determinare quale sia l'ultima fase (quella con `position` massima).

### 3. Aggiornare il filtro "active"
Nel blocco `filteredItems`, il filtro `active` diventa:
```
// Escludi articoli installati O articoli il cui ordine è all'ultima fase
filtered = filtered.filter(item => {
  if (item.status === "installato") return false;
  if (lastStatusId && item.order.current_status_id === lastStatusId) return false;
  return true;
});
```

### 4. Aggiornare il tipo `WarehouseItem`
Aggiungere `current_status_id` all'interfaccia `order` in `src/types/warehouse.ts`.

### 5. Aggiornare `activeItemsCount`
Usare la stessa logica per il conteggio nel badge.

### File modificati
- `src/types/warehouse.ts` — aggiungere `current_status_id` al tipo
- `src/hooks/useWarehouseData.ts` — query + fetch statuses + logica filtro

