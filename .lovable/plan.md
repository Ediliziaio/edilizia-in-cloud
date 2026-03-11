

# Magazzino Live v2 — Allineamento al Documento Completo

## Situazione Attuale

L'implementazione MG1-MG5 precedente ha creato le basi, ma in versione **semplificata** rispetto a quanto specificato nel documento. Ecco le differenze concrete:

### Database — Gap

| Elemento | Documento | Attuale |
|----------|-----------|---------|
| `warehouse_stock.quantity_available` (GENERATED) | Colonna calcolata | Manca |
| `warehouse_stock.last_delivery_date`, `last_lot_number` | Presenti | Mancano |
| Trigger prenotazione/rilascio | `update_reservation_on_status_change` | Manca |
| `warehouse_lot_batches` schema | `quantity_received`, `quantity_remaining`, `delivery_date`, `updated_at` | Ha `quantity`, `received_date`, `expiry_date` |
| `inventory_audits` schema | `system_quantity`, `actual_quantity`, `difference` GENERATED, `audited_by`, `audited_at`, `applied_at` | Ha `expected_quantity`, `counted_quantity`, `difference` non-generated |
| `get_blocked_orders` RPC | Ritorna `work_start_date`, `blocking_items_count`, `missing_items` (JSONB dettagliato), `urgency_level` | Ritorna solo `total_items`, `missing_items` (conteggio) |
| `get_low_stock_alerts` RPC | Ritorna `name`, `deficit`, `supplier_name`, `section_name` | Ritorna `item_name`, `reorder_qty`, `supplier_id` |
| `get_order_materials_history` RPC | Accetta `p_company_id` + `p_order_id`, ritorna `order_item_name`, `unit_cost`, `performed_by_name` | Accetta solo `p_order_id` |

### Codice — Gap

| Elemento | Documento | Attuale |
|----------|-----------|---------|
| `ORDER_ITEM_STATUS_CONFIG` con `borderColor`, `description` | Esportato dal hook | Manca nel hook |
| `useWarehouseStats` hook | Presente con stats aggregate | Manca |
| `useUpdateOrderItemStatusMutation` | Con `deliveryDate`, `lotNumber`, `stockItemId` | Manca |
| `useApplyAuditAdjustmentMutation` | Crea movimento rettifica + aggiorna stock + segna audit | Solo aggiorna stock + audit |
| `useAddLotBatchMutation` | Aggiorna `last_lot_number`/`last_delivery_date` su warehouse_stock | Solo inserisce lotto |
| `BlockedOrdersPanel` | Urgency badges (critica/alta/normale), lista materiali mancanti, compact mode, navigazione | Versione semplificata |
| `LowStockAlertsPanel` | Esauriti vs sotto soglia, supplier name, deficit, compact mode | Versione semplificata |
| `OrderMaterialsHistory` | Timeline con icone per tipo, costo, lotto, performer | Solo lista base |
| `InventoryAuditDialog` | Con `InventoryAuditsList` separato, applica rettifica con movimento | Versione semplificata |
| Query keys strutturati (`magazzinoKeys`) | Pattern organizzato | Query keys sparse |

## Piano di Implementazione

### Step 1 — Migration DB: Allineare schema e RPCs

Una singola migration che:
1. Aggiunge `quantity_available` (GENERATED), `last_delivery_date`, `last_lot_number` a `warehouse_stock`
2. Allinea `warehouse_lot_batches`: rinomina colonne (`quantity` → `quantity_received`, add `quantity_remaining`, `received_date` → `delivery_date`, add `updated_at`, rimuovi `expiry_date`)
3. Allinea `inventory_audits`: rinomina colonne (`expected_quantity` → `system_quantity`, `counted_quantity` → `actual_quantity`), rendi `difference` GENERATED, aggiungi `audited_by`, `audited_at`, `applied_at`
4. Crea trigger `update_reservation_on_status_change` per gestire prenotazioni/rilasci automaticamente
5. Ricrea le 3 RPC con le signature complete del documento (urgency_level, missing_items JSONB, etc.)

### Step 2 — Riscrivere `useMagazzinoLive.ts`

Sostituire completamente il file con la versione completa dal documento:
- Tipi allineati (BlockedOrder con urgency_level e missing_items array, LowStockAlert con deficit/supplier_name/section_name, etc.)
- `ORDER_ITEM_STATUS_CONFIG` con tutti i campi (borderColor, description)
- `magazzinoKeys` per query keys strutturati
- Tutti gli hooks: `useBlockedOrders(companyId)`, `useLowStockAlerts(companyId)`, `useOrderMaterialsHistory(companyId, orderId)`, `useLotBatches(companyId, stockItemId?)`, `useInventoryAudits(companyId)`, `useWarehouseStats(companyId)`
- Mutations complete: `useUpdateOrderItemStatusMutation`, `useAddLotBatchMutation` (con update warehouse_stock), `useCreateInventoryAuditMutation`, `useApplyAuditAdjustmentMutation` (con movimento rettifica)

### Step 3 — Riscrivere i 4 componenti UI

Sostituire i componenti semplificati con le versioni complete del documento:

1. **`BlockedOrdersPanel.tsx`** — Accetta `companyId` + `compact`, urgency badges (critica/alta/normale), lista materiali mancanti con status badges, navigazione ordine
2. **`LowStockAlertsPanel.tsx`** — Accetta `companyId` + `compact`, sezione esauriti (rosso) e sotto soglia (giallo), deficit, supplier name
3. **`OrderMaterialsHistory.tsx`** — Accetta `companyId` + `orderId`, timeline con icone per tipo movimento, costo totale, lotto, performer
4. **`InventoryAuditDialog.tsx`** + `InventoryAuditsList` — Dialog con form inventario, lista audit separata con pulsante "Applica rettifica"

### Step 4 — Aggiornare i consumatori

- **`Warehouse.tsx`**: passare `companyId` ai pannelli, aggiungere stats card con `useWarehouseStats`
- **`WarehouseStockTab.tsx`**: aggiornare per passare `companyId` al dialog inventario
- Aggiornare qualsiasi altro file che importa i vecchi tipi dal hook

### File da modificare
1. Nuova migration SQL
2. `src/hooks/useMagazzinoLive.ts` (riscrittura)
3. `src/components/warehouse/BlockedOrdersPanel.tsx` (riscrittura)
4. `src/components/warehouse/LowStockAlertsPanel.tsx` (riscrittura)
5. `src/components/warehouse/OrderMaterialsHistory.tsx` (riscrittura)
6. `src/components/warehouse/InventoryAuditDialog.tsx` (riscrittura)
7. `src/pages/azienda/Warehouse.tsx` (aggiornare props)
8. `src/components/warehouse/WarehouseStockTab.tsx` (aggiornare props)

