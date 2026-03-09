

# Fase 1 — Migrazione DB Correttiva

Una singola migrazione SQL per aggiungere tutti i campi e funzioni mancanti rispetto alla spec originale.

---

## Campi da aggiungere

### Tabella `scadenze`
- `order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL`
- `prima_nota_entry_id UUID REFERENCES prima_nota_entries(id) ON DELETE SET NULL`
- `alert_days_before INT DEFAULT 7`
- `alert_sent_at TIMESTAMPTZ`
- `is_auto_generated BOOLEAN DEFAULT false`
- `auto_source TEXT`

### Tabella `prima_nota_entries`
- `order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL`
- `account_label TEXT`

### Tabella `purchase_order_items`
- `order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL`

### Tabella `purchase_orders`
- `supplier_reference TEXT`
- `delivery_address TEXT`
- `sent_at TIMESTAMPTZ`
- `confirmed_at TIMESTAMPTZ`

---

## Funzioni da creare/sostituire

### `mark_scadenza_paid` — Riscrittura completa
- Aggiunge parametro `p_account_label TEXT`
- Crea automaticamente `prima_nota_entry` con `order_item_id`, `account_label`
- Aggiorna `scadenze.prima_nota_entry_id` con back-reference
- Gestione pagamento parziale: se `p_amount < remaining` → status `parziale`, altrimenti `pagata`

### `get_prima_nota_saldo` — Fix signature
- Aggiunge `entry_count BIGINT` al return type
- Mantiene compatibilità con i parametri attuali `p_from_date`/`p_to_date`

### `get_scadenzario_summary` — Fix nomi campi
- Rinomina return: `entrate_attese` → `entrate_previste`, `uscite_attese` → `uscite_previste`
- Aggiunge `questo_mese_count`/`questo_mese_amount`

### `check_overdue_scadenze` — Fix
- Opera su `status = 'da_pagare'` (lo status effettivo nella tabella) invece di `'pending'`/`'overdue'`

### `create_oda_from_order` — Riscrittura
- Accetta `p_item_ids UUID[]` per selezionare articoli specifici
- Popola `order_item_id` in `purchase_order_items`
- Aggiorna `order_items.status = 'ordinato'`

### Trigger `before_insert_purchase_order`
- Auto-assegna `oda_number` via `generate_oda_number()` se NULL all'INSERT
- Permette di rimuovere la chiamata RPC manuale nel codice frontend

---

## Impatto sul codice frontend

Dopo la migrazione, aggiornerò:

1. **`useScadenzario.ts`** — Aggiornare tipo `Scadenza` con nuovi campi, aggiornare `markPaid` per passare `p_account_label`
2. **`usePrimaNota.ts`** — Aggiornare tipo `PrimaNotaSaldo` con `entry_count`, tipo `PrimaNotaEntry` con `account_label`/`order_item_id`
3. **`usePurchaseOrders.ts`** — Rimuovere chiamata manuale `generate_oda_number` nel `createMutation` (ora il trigger lo fa automaticamente), rendere `oda_number` opzionale nell'insert
4. **`MarkPaidDialog.tsx`** — Aggiungere campo `account_label` (select conto/cassa)
5. **`NewScadenzaDialog.tsx`** — Aggiungere campo `alert_days_before`
6. **`NewEntryDialog.tsx`** — Aggiungere campo `account_label`

---

## Riepilogo deliverable

| Azione | Dettaglio |
|---|---|
| 1 migrazione SQL | ALTER TABLE x3, CREATE/REPLACE FUNCTION x5, CREATE TRIGGER x1 |
| 6 file frontend | Aggiornamento tipi + nuovi campi UI |

