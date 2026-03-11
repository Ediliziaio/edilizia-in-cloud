

# Magazzino Live — Piano di Implementazione Completo (MG1 → MG5)

Il magazzino attuale e' statico: 4 stati, movimenti base carico/scarico, nessun collegamento intelligente con gli ordini. Il documento caricato descrive un sistema "live" con prenotazioni, scarico automatico, alert blocchi, inventario fisico e lotti. **Nessuna di queste funzionalita' esiste ancora nel progetto.**

## Cosa manca (tutto)

| Area | Stato |
|------|-------|
| Nuovi stati order_items (in_arrivo, prenotato) | Manca |
| Colonne estese order_items (lot_number, delivery_date, quantity_reserved, auto_deducted) | Manca |
| Colonne estese warehouse_stock (reorder_quantity, quantity_reserved, quantity_available) | Manca |
| Nuovi movement_type (scarico_automatico, prenotazione, rilascio, rettifica, reso_fornitore) | Manca |
| Tabella warehouse_lot_batches | Manca |
| Tabella inventory_audits | Manca |
| Trigger scarico automatico a installazione | Manca |
| Trigger prenotazione/rilascio | Manca |
| RPC get_blocked_orders | Manca |
| RPC get_low_stock_alerts | Manca |
| RPC get_order_materials_history | Manca |
| Hook useMagazzinoLive.ts | Manca |
| Componenti UI (BlockedOrdersPanel, LowStockAlertsPanel, OrderMaterialsHistory, InventoryAuditDialog) | Manca |
| Kanban a 6 colonne | Manca |
| Integrazione nella pagina Warehouse e OrderDetail | Manca |

## Piano di Esecuzione

Data la complessita', procedera' in ordine sequenziale come descritto nel documento.

### Step 1 — Migration DB (MG1)
Una singola migration SQL che:
- Estende order_items con nuovi stati + colonne
- Estende warehouse_stock con quantity_reserved, quantity_available (computed), reorder_quantity
- Estende warehouse_movements con nuovi tipi + colonne (order_id, lot_number, unit_cost, company_id)
- Crea warehouse_lot_batches + inventory_audits con RLS
- Crea trigger scarico automatico (order_item → installato)
- Crea trigger prenotazione/rilascio
- Crea 3 RPC (blocked_orders, low_stock_alerts, order_materials_history)
- Indici per performance

### Step 2 — Hook useMagazzinoLive.ts (MG2)
Nuovo file con:
- Tipi estesi (OrderItemStatusExtended, BlockedOrder, LowStockAlert, etc.)
- ORDER_ITEM_STATUS_CONFIG con 6 stati
- Query hooks: useBlockedOrders, useLowStockAlerts, useOrderMaterialsHistory, useLotBatches, useInventoryAudits, useWarehouseStats
- Mutation hooks: useUpdateOrderItemStatusMutation, useAddLotBatchMutation, useCreateInventoryAuditMutation, useApplyAuditAdjustmentMutation

### Step 3 — Componenti UI (MG3)
4 nuovi componenti:
- `BlockedOrdersPanel.tsx` — pannello ordini bloccati per materiali mancanti
- `LowStockAlertsPanel.tsx` — alert sottoscorta con esauriti/sotto soglia
- `OrderMaterialsHistory.tsx` — timeline movimenti per commessa
- `InventoryAuditDialog.tsx` + `InventoryAuditsList` — inventario fisico con rettifica

### Step 4 — Integrazione pagine (MG4)
- **Warehouse.tsx**: aggiungere stats card + BlockedOrdersPanel + LowStockAlertsPanel in cima
- **OrderDetail.tsx**: aggiungere sezione storico movimenti materiali
- **WarehouseStockTab.tsx**: aggiungere pulsante "Inventario fisico" + InventoryAuditDialog
- Aggiornare i form order_item per includere delivery_date e lot_number

### Step 5 — Kanban esteso (MG5)
- Kanban a 6 colonne (aggiungere in_arrivo e prenotato)
- Indicatore urgenza sulle card per ordini con lavori imminenti
- Aggiornare STATUS_CONFIG in types/warehouse.ts con i nuovi stati

### File coinvolti
1. Nuova migration SQL
2. `src/hooks/useMagazzinoLive.ts` (nuovo)
3. `src/types/warehouse.ts` (aggiornare con nuovi stati)
4. `src/components/warehouse/BlockedOrdersPanel.tsx` (nuovo)
5. `src/components/warehouse/LowStockAlertsPanel.tsx` (nuovo)
6. `src/components/warehouse/OrderMaterialsHistory.tsx` (nuovo)
7. `src/components/warehouse/InventoryAuditDialog.tsx` (nuovo)
8. `src/pages/azienda/Warehouse.tsx` (integrare alert + stats)
9. `src/pages/azienda/OrderDetail.tsx` (integrare storico materiali)
10. `src/components/warehouse/WarehouseStockTab.tsx` (inventario fisico)
11. `src/components/warehouse/WarehouseKanbanView.tsx` (6 colonne)
12. `src/components/warehouse/WarehouseKanbanColumn.tsx` (nuovi stati)
13. `src/components/warehouse/WarehouseKanbanCard.tsx` (indicatore urgenza)

Data la dimensione, implementero' MG1+MG2+MG3 nel primo passaggio, poi MG4+MG5 nel secondo.

