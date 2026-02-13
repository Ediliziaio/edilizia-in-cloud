

# Piano: Scarico Automatico Giacenze + Storico Movimenti

## Problemi Attuali

1. **`stock_item_id` e `vat_rate` non vengono salvati**: sia `CreateOrder.tsx` che `EditOrder.tsx` omettono questi campi nel mapping `itemsToInsert`
2. **Nessuno scarico automatico**: quando l'ordine viene salvato con articoli prelevati da magazzino, la quantita in `warehouse_stock` non viene decrementata e nessun movimento viene registrato
3. **Nessuno storico movimenti**: nel tab Giacenze non e possibile vedere i movimenti di carico/scarico per articolo

---

## 1. Correzione Salvataggio Articoli

In entrambi i file (`CreateOrder.tsx` e `EditOrder.tsx`), aggiungere `stock_item_id` e `vat_rate` al mapping `itemsToInsert`:

```text
const itemsToInsert = orderItems.map((item, index) => ({
  order_id: ...,
  name: item.name,
  description: item.description || null,
  quantity: item.quantity,
  status: item.status,
  position: index,
  supplier_id: item.supplier_id || null,
  purchase_price: item.purchase_price || 0,
  vat_rate: item.vat_rate ?? 22,
  stock_item_id: item.stock_item_id || null,
}));
```

---

## 2. Scarico Automatico al Salvataggio Ordine

Dopo l'insert degli `order_items`, per ogni articolo con `stock_item_id` valorizzato:
- Decrementare `warehouse_stock.quantity` della quantita prelevata
- Creare un record in `warehouse_movements` con `movement_type = 'scarico'` e `order_item_id` collegato

Questo va fatto sia in `CreateOrder.tsx` (alla creazione) sia in `EditOrder.tsx` (al salvataggio modifiche, gestendo i delta).

Per `EditOrder`, dato che fa delete + re-insert degli items, la logica sara:
- Calcolare quali articoli con `stock_item_id` sono nuovi (non presenti prima)
- Solo per quelli nuovi eseguire lo scarico

Per semplicita e robustezza, il flusso sara:
- Salvare gli items con `returning` per ottenere gli ID generati
- Per ogni item con `stock_item_id`, decrementare lo stock e inserire il movimento

---

## 3. Storico Movimenti nel Tab Giacenze

Aggiungere un bottone "Storico" (icona History) per ogni riga della tabella stock in `WarehouseStockTab.tsx`. Al click, apre un Dialog/Sheet che mostra i movimenti dell'articolo selezionato:

- Query `warehouse_movements` filtrato per `stock_item_id`
- Colonne: Data, Tipo (Carico/Scarico con badge colorato), Quantita, Note, Ordine collegato (se presente)
- Ordinati per data decrescente

---

## File da Modificare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/azienda/CreateOrder.tsx` | Modifica | Aggiungere `stock_item_id` + `vat_rate` al mapping items, scarico automatico dopo salvataggio |
| `src/pages/azienda/EditOrder.tsx` | Modifica | Aggiungere `stock_item_id` + `vat_rate` al mapping items, scarico automatico per nuovi articoli da stock |
| `src/components/warehouse/WarehouseStockTab.tsx` | Modifica | Aggiungere bottone Storico e dialog movimenti per articolo |

Nessuna migrazione DB necessaria.

---

## Dettagli Tecnici

### Scarico automatico (CreateOrder)

Dopo l'insert degli items, aggiungere:

```text
// Dopo insert order_items con .select() per ottenere gli ID
const stockItems = itemsWithIds.filter(i => i.stock_item_id);
for (const item of stockItems) {
  // Decrementa warehouse_stock
  await supabase.rpc(...)  // oppure update diretto
  // Crea movimento
  await supabase.from("warehouse_movements").insert({
    stock_item_id: item.stock_item_id,
    order_item_id: item.id,
    movement_type: "scarico",
    quantity: item.quantity,
    notes: "Prelievo automatico per ordine",
    performed_by: user.id,
  });
}
```

Per l'update della quantita, usare un update diretto con query sulla quantita corrente:

```text
const { data: currentStock } = await supabase
  .from("warehouse_stock")
  .select("quantity")
  .eq("id", item.stock_item_id)
  .single();

await supabase
  .from("warehouse_stock")
  .update({ quantity: Math.max(0, currentStock.quantity - item.quantity) })
  .eq("id", item.stock_item_id);
```

### Dialog Storico Movimenti (WarehouseStockTab)

Nuovo state:

```text
const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
```

Query movimenti quando `historyItem` e selezionato:

```text
const { data: movements } = useQuery({
  queryKey: ["stock-movements", historyItem?.id],
  queryFn: ..., // select da warehouse_movements + join order_items per ottenere ordine
  enabled: !!historyItem,
});
```

UI: Dialog con tabella movimenti (data, tipo con badge verde/rosso, quantita, note, link ordine).

