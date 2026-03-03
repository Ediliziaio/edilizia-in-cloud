

# Fix Logica Fatturato + Aggiunta Contratti Persi

## Situazione Attuale

La logica backend è già corretta:
- **Fatturato** = `SUM(value) WHERE status='won'` ✓
- **Pipeline Attiva** = `SUM(value) WHERE status='open'` ✓

## Cosa manca: KPI "Contratti Persi"

L'utente vuole vedere anche i **Contratti Persi** (opportunità con `status='lost'`): conteggio e valore.

## Modifiche

### 1. RPC `get_marketing_dashboard_stats` — Migrazione DB
Aggiungere al calcolo:
- `contracts_lost` (COUNT WHERE status='lost')
- `revenue_lost` (SUM value WHERE status='lost')
- Stessi filtri periodo/assegnazione/fonte/pipeline dei contratti vinti
- Aggiungere anche nel periodo precedente per il delta %

### 2. `useMarketingDashboard.ts` — Tipi
Aggiungere a `KpiData`:
- `contracts_lost: number`
- `revenue_lost: number`

### 3. `DashboardKPICards.tsx` — Nuova card
Aggiungere 2 card:
- **Contratti Persi** (number, con icona rossa)
- **Valore Perso** (currency)

### 4. `DashboardInsights.tsx`
Aggiungere insight rule-based: se `contracts_lost > contracts_won` → segnalare.

### 5. Export CSV in `MarketingDashboard.tsx`
Aggiungere righe Contratti Persi e Valore Perso nell'export.

| Azione | File |
|--------|------|
| Migrazione | RPC `get_marketing_dashboard_stats` |
| Modifica | `useMarketingDashboard.ts` |
| Modifica | `DashboardKPICards.tsx` |
| Modifica | `DashboardInsights.tsx` |
| Modifica | `MarketingDashboard.tsx` |

