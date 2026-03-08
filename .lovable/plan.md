

# Prompt 1 — Performance Critica: Dashboard RPC + Magazzino Server-side

## Panoramica

Due interventi principali per ridurre drasticamente i tempi di caricamento:
- **Dashboard**: 15 query parallele → 1 singola RPC
- **Magazzino**: 2000 item client-side → server-side filtering + memoizzazione supplier

---

## FIX 1A — Dashboard: RPC Aggregata

### Database Migration
Creare una funzione PostgreSQL `get_dashboard_kpis` che aggrega tutti i KPI in una singola chiamata, accettando `p_company_id`, `p_date_from`, `p_date_to`, `p_status_id` (opzionale). Restituisce un JSONB con:
- `total_orders`, `total_customers`, `open_tickets`, `pending_revenue`, `pending_orders_count`
- `recent_orders` (ultimi 5)
- `cash_flow` (this_month_income, unpaid_costs, next_month)
- `ceo_strip` (revenue/margin this/prev month)
- `urgent_items` (articoli con scadenza ≤7gg)
- `weekly_deadlines` (receivables, costs, works entro 7gg)
- `financial_alerts`
- `monthly_balance` (ultimi 6 mesi entrate/uscite)
- `revenue_ytd` (per mese)
- `aging_receivables` (overdue/thisWeek/thisMonth/future)
- Statistiche periodo precedente per delta

### Frontend (`useCompanyDashboardData.ts`)
- Sostituire le 15 query `Promise.all` con una singola `supabase.rpc('get_dashboard_kpis', {...})`
- Aumentare `staleTime` da 2 min a 10 min
- Mappare il risultato JSONB ai tipi esistenti (`DashboardStats`, `CeoStrip`, `CashFlow`, ecc.)
- Rimuovere tutta la logica di aggregazione client-side (loop su pending revenue, monthly balance, revenue YTD, aging)

---

## FIX 1B — Magazzino: Server-side Filtering

### Frontend (`useWarehouseData.ts`)
1. **Passare filtri alla query Supabase** invece di `.limit(2000)` + filtro client-side:
   - `status` → `.eq('status', filter)`
   - `search` → `.ilike('name', '%search%')`
   - `supplier_id` → `.eq('supplier_id', filter)`
   - `order_id` → `.eq('order_id', filter)`
   - Quick filters (urgent, overdue, thisWeek) → date filters nella query
   - Aggiungere `.range(page * PAGE_SIZE, (page+1) * PAGE_SIZE - 1)` con `PAGE_SIZE = 50`

2. **Memoizzare supplier Map**:
   ```typescript
   const supplierMap = useMemo(() => 
     new Map(suppliers.map(s => [s.id, s.name])), [suppliers]
   );
   // getSupplierName: supplierMap.get(id) invece di suppliers.find()
   ```

3. **Conteggi badge** (active, urgent, overdue): fare 3 query `COUNT` separate leggere con `{ count: 'exact', head: true }` e filtri appropriati, così i badge non dipendono dal caricamento di 2000 record

4. Aggiungere `queryKey` che include tutti i filtri per re-fetch automatico al cambio filtro

### Non incluso (P2)
- Virtualizzazione con `@tanstack/react-virtual` — richiede modifiche ai componenti di rendering delle liste, da fare in un secondo step
- `staleTime` dashboard già presente a 5 min nel warehouse

---

## File da modificare

| File | Modifica |
|------|----------|
| **Migration SQL** | Creare `get_dashboard_kpis()` |
| `src/hooks/useCompanyDashboardData.ts` | Sostituire 15 query con 1 RPC, staleTime 10min |
| `src/hooks/useWarehouseData.ts` | Server-side filtering, paginazione, supplier Map |

