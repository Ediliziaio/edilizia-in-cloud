

# Fix bug: cambio stato articolo e aggiornamento previsionale

## Bug 1: Stato articolo non si aggiorna

**Causa**: In `OrderItemsList.tsx`, quando si cambia lo stato tramite il dropdown (riga 363-367), viene chiamato `onItemsChange`. Ma in `OrderDetail.tsx` (riga 570-573), `onItemsChange` cerca solo articoli nuovi senza `id`:

```typescript
onItemsChange={(newItems) => {
  const newItem = newItems.find(ni => !ni.id);
  if (newItem) addItemMutation.mutate(newItem);
}}
```

Gli articoli esistenti con stato modificato vengono ignorati.

**Fix**: Modificare `handleStatusChange` in `OrderItemsList.tsx` per usare `onItemUpdate` (che salva direttamente su DB) invece di `onItemsChange` quando `onItemUpdate` e disponibile:

```typescript
const handleStatusChange = (index: number, status: OrderItemStatus) => {
  const updatedItem = { ...items[index], status };
  if (onItemUpdate) {
    onItemUpdate(updatedItem);
  } else {
    const newItems = [...items];
    newItems[index] = updatedItem;
    onItemsChange(newItems);
  }
};
```

## Bug 2: Previsionale non aggiornato dopo modifica date

**Causa**: `updateSingleItemMutation.onSuccess` invalida solo `["order-items", id]` ma non le query del previsionale che leggono da `order_items` con join su `orders`.

**Fix**: Aggiungere invalidazione delle query del previsionale in `onSuccess`:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["order-items", id] });
  queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
  toast.success("Articolo aggiornato");
},
```

## File coinvolti
- `src/components/orders/OrderItemsList.tsx` — fix `handleStatusChange`
- `src/pages/azienda/OrderDetail.tsx` — aggiungere invalidazione query previsionale

