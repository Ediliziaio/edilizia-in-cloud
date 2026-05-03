# FASE 0 — MP-CG-03 (RPC SP Riclassificato + Rating)

Branch: `feat/controllo-gestione-mp1` (continuazione locale, no push main)

## Mapping schema reale
| Atteso | Reale | Adattamento |
|---|---|---|
| `warehouse_stock.quantita`/`costo_medio` | `quantity`/`unit_cost` | rinominato |
| `invoices.payment_status` | non esiste; usa `total - paid_amount > 0` | filtro `total > paid_amount` |
| `invoice_payments(amount)` | OK | |
| `bank_accounts.current_balance/is_active` | OK | |
| `purchase_orders.importo_anticipato/importo_fatturato` | non esiste | anticipi fornitori = 0 (stub) |
| `liquidazioni_iva` | non esiste | crediti IVA = 0 |
| `f24_credits` | non esiste | crediti F24 = 0 |
| `f24_entries(stato='da_pagare')` | OK | |
| `loans` | non esiste | mutui MLT = 0 (stub) |
| `supplier_payments` | non esiste | usa solo `purchase_orders.total` per debiti fornitori |
| `cedolini.netto_dipendente/data_pagamento/data_versamento_inps/periodo_competenza` | non esistono | usa `cedolini.netto`, `mese`/`anno`. Debiti personale/previdenziali = 0 quando non c'è data versamento (assumiamo pagati) |
| `cassa_movimenti_riepilogo` (view) | non esiste | cassa = 0 (lo SP avrà solo la liquidità banche) |
| `auth_company_id()` | `get_my_company_id()` | come MP-CG-01/02 |
| `auth_has_role('super_admin')` | `has_role(auth.uid(), 'super_admin'::app_role)` | |

## Decisioni
1. RPC SP è "best effort": se mancano dati ausiliari, ritorna 0 senza errore. La quadratura `attivo - passivo` viene comunque calcolata.
2. Wizard import bilancio (P2 del prompt) = differito a fase frontend (MP-CG-05) — qui solo l'API DB.
3. Cron snapshot rating mensile: edge function creata + schedule registrato in `config.toml`.
