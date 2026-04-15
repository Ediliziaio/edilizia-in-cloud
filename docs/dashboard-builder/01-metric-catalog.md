# 01 — Catalogo Metriche (20 base)

Ogni metrica ha: **id** (stabile, usato nei layout), **categoria**, **SQL template** parametrico, **aggregazioni** supportate, **dimensioni** (breakdown), **value_type**, **requires_role** (opzionale).

Le SQL template usano placeholder `{company_id}`, `{from}`, `{to}`, `{status_id}`, `{breakdown}`. Il resolver backend li sostituisce con parametri tipizzati — **mai string concat dal frontend**.

---

## 🟢 FINANZA (6 metriche)

### 1. `revenue_total`
- **Nome:** Fatturato totale
- **Value type:** `currency`
- **Aggregazioni:** `sum` (default), `avg`, `min`, `max`
- **Dimensioni:** `month`, `week`, `day`, `customer`, `order_status`, `none`
- **SQL base:**
  ```sql
  SELECT COALESCE(SUM(total_amount), 0) AS value
  FROM orders
  WHERE company_id = {company_id}
    AND created_at BETWEEN {from} AND {to}
    AND ({status_id} IS NULL OR current_status_id = {status_id})
  ```

### 2. `revenue_real`
- **Nome:** Incassi reali
- **Value type:** `currency`
- **Source:** `invoice_payments.amount`
- **Dimensioni:** `month`, `week`, `day`, `payment_method`, `customer`
- **SQL base:**
  ```sql
  SELECT COALESCE(SUM(amount), 0) FROM invoice_payments
  WHERE company_id = {company_id}
    AND payment_date BETWEEN {from} AND {to}
  ```

### 3. `margin_total`
- **Nome:** Margine operativo
- **Value type:** `currency`
- **SQL base:**
  ```sql
  SELECT COALESCE(SUM(
    o.total_amount
    - COALESCE((SELECT SUM(quantity*purchase_price) FROM order_items WHERE order_id=o.id),0)
    - COALESCE((SELECT SUM(total_cost) FROM order_external_teams WHERE order_id=o.id),0)
  ), 0)
  FROM orders o
  WHERE o.company_id = {company_id} AND o.created_at BETWEEN {from} AND {to}
  ```
- **Dimensioni:** `month`, `customer`, `order_status`

### 4. `payments_real`
- **Nome:** Pagamenti reali (costi pagati)
- **Value type:** `currency`
- **SQL base:**
  ```sql
  SELECT COALESCE(SUM(amount), 0) FROM company_costs
  WHERE company_id = {company_id} AND is_paid = true
    AND paid_date BETWEEN {from} AND {to}
  ```
- **Dimensioni:** `month`, `category`

### 5. `overdue_receivables`
- **Nome:** Crediti scaduti
- **Value type:** `currency`
- **SQL base:**
  ```sql
  SELECT COALESCE(SUM(balance_amount), 0) FROM orders
  WHERE company_id = {company_id}
    AND expected_date < CURRENT_DATE
    AND COALESCE(balance_amount, 0) > 0
  ```
- **Dimensioni:** `customer`, `bucket` (0-30gg, 30-60gg, 60+gg)

### 6. `cashflow_forecast_30d`
- **Nome:** Forecast cassa 30 giorni
- **Value type:** `currency`
- **SQL:** incassi attesi da `orders.balance_amount` con `expected_date ∈ [now, +30d]` − costi pianificati da `company_costs.is_paid=false` con `due_date ∈ [now, +30d]`
- **Dimensioni:** `week`, `none`

---

## 📦 ORDINI (5 metriche)

### 7. `orders_count`
- **Nome:** Numero ordini
- **Value type:** `count`
- **Aggregazioni:** `count` (default)
- **Dimensioni:** `month`, `week`, `day`, `order_status`, `customer`, `source`
- **SQL:** `SELECT COUNT(*) FROM orders WHERE company_id={company_id} AND created_at BETWEEN {from} AND {to}`

### 8. `orders_open`
- **Nome:** Ordini aperti
- **Value type:** `count`
- **SQL:** filtra su `current_status_id` diverso da stati "completato"/"chiuso"
- **Dimensioni:** `order_status`, `customer`, `assigned_to`

### 9. `order_average_value`
- **Nome:** Valore medio ordine
- **Value type:** `currency`
- **SQL:** `AVG(total_amount)` su orders nel periodo
- **Dimensioni:** `month`, `customer`

### 10. `order_avg_duration_days`
- **Nome:** Durata media cantiere (giorni)
- **Value type:** `duration`
- **SQL:** `AVG(work_end_date - work_start_date)` su ordini completati
- **Dimensioni:** `month`, `customer_type`

### 11. `orders_by_status`
- **Nome:** Ordini per stato (pipeline)
- **Value type:** `count`
- **Default breakdown:** `order_status` (obbligatorio)
- **SQL:** `GROUP BY current_status_id`

---

## 👥 CLIENTI (3 metriche)

### 12. `customers_total`
- **Nome:** Clienti totali
- **Value type:** `count`
- **SQL:** `COUNT(DISTINCT customer_id) FROM orders WHERE company_id={company_id}`

### 13. `customers_new`
- **Nome:** Nuovi clienti nel periodo
- **Value type:** `count`
- **SQL:** clienti con **primo** ordine nel periodo (MIN(created_at) ∈ [from, to])
- **Dimensioni:** `month`, `week`

### 14. `customers_top_n`
- **Nome:** Top clienti per fatturato
- **Value type:** `currency`
- **Default breakdown:** `customer` obbligatorio, ORDER BY value DESC LIMIT N (default 10)
- **Config extra:** `limit` (5, 10, 20)

---

## 🏭 MAGAZZINO (3 metriche)

### 15. `items_urgent`
- **Nome:** Articoli urgenti (cantieri entro 7gg)
- **Value type:** `count`
- **SQL:** order_items con `status IN ('da_ordinare','ordinato','in_arrivo')` su ordini con `expected_date ∈ [now, +7d]`

### 16. `stock_value`
- **Nome:** Valore stock magazzino
- **Value type:** `currency`
- **SQL:** `SUM(stock_quantity * purchase_price)` da `stock_items`
- **Dimensioni:** `category`, `supplier`

### 17. `items_below_minimum`
- **Nome:** Articoli sotto scorta minima
- **Value type:** `count`
- **SQL:** `stock_items WHERE stock_quantity < minimum_quantity`

---

## 👷 TEAM (3 metriche)

### 18. `hours_worked_total`
- **Nome:** Ore lavorate totali
- **Value type:** `duration` (ore)
- **SQL:** somma da `team_activities.duration_hours` nel periodo
- **Dimensioni:** `month`, `week`, `team`, `member`, `order`

### 19. `teams_active_on_site`
- **Nome:** Squadre in cantiere oggi
- **Value type:** `count`
- **SQL:** squadre con attività in corso nella data corrente

### 20. `productivity_hours_per_order`
- **Nome:** Ore per ordine completato
- **Value type:** `duration`
- **SQL:** `SUM(hours) / COUNT(distinct order_id)` su ordini completati nel periodo

---

## 🗂️ Dimensioni (breakdown)

Ogni dimensione è un alias controllato server-side:

| Dimension key | Colonna / Join |
|---|---|
| `month` | `date_trunc('month', ...)` |
| `week` | `date_trunc('week', ...)` |
| `day` | `::date` |
| `customer` | `JOIN profiles` su `customer_id`, label = first_name + last_name |
| `order_status` | `JOIN order_statuses` su `current_status_id` |
| `payment_method` | direct col |
| `category` | direct col |
| `supplier` | `JOIN suppliers` |
| `team` | `JOIN teams` |
| `member` | `JOIN profiles` su member |
| `assigned_to` | direct col + join profiles |
| `bucket` | CASE WHEN... (aging) |
| `source` | direct col |
| `none` | nessun group by |

---

## 🔒 Sicurezza

- Ogni query **DEVE** avere `WHERE company_id = {company_id}` (validato dal resolver: se la SQL template non contiene questo vincolo, la migration fallisce con check constraint)
- RLS su tutte le tabelle sorgente è già attiva: funge da seconda barriera
- Metriche sensibili (es. margine) hanno `requires_role = 'company_admin'`: il resolver le rifiuta per utenti con ruolo inferiore
- Il resolver accetta solo metric_id presenti nel catalogo + filtri/breakdown da whitelist. Qualunque deviazione → 403

---

## 📊 Formato risposta del resolver

```ts
type MetricResult = {
  value: number | null;                    // per aggregate semplice
  breakdown?: Array<{                      // per metriche con group by
    key: string;                           // es. "2026-03" o "Mario Rossi"
    label: string;                         // display name
    value: number;
  }>;
  meta: {
    metric_id: string;
    aggregation: string;
    filters_applied: object;
    generated_at: string;                  // ISO
    cached: boolean;
  };
};
```

---

## ➕ Come aggiungere una nuova metrica in futuro

1. Aggiungere riga in `metric_catalog` (migration SQL dedicata)
2. SQL template con placeholder standard
3. Dimensioni supportate in JSONB
4. Aggiornare questo doc
5. Smoke test: invocare `get_metric` via Postman

**Nessun cambio UI necessario** — il builder la vede automaticamente.
