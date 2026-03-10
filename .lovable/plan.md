

# Audit Round 3 — Dashboard / Cruscotto

## Stato delle correzioni precedenti

Tutti i fix del round precedente sono attivi e verificati:
- ✅ `CompanyDashboard.tsx` refresh mirato su `queryKeys.dashboard.all`
- ✅ `useAdminDashboardData.ts` MRR trend con euristica migliorata
- ✅ `useCompanyDashboardData.ts` staleTime ridotto a 3 min
- ✅ `useCruscottoData.ts` operations query key senza dateRange

## Bug residui trovati

### Bug 1 (P1): `useAdminDashboardData` — allCompanies query senza limit
**File:** `src/hooks/useAdminDashboardData.ts`, riga 77
La query `supabase.from("companies").select(...)` non ha `.limit()`. Il default Supabase è 1000 righe. Con >1000 aziende, **tutti** i KPI admin sono sbagliati: MRR, churnRate, trialCount, trialExpiringSoon, mrrChartData — tutti calcolati su `allCompanies` che viene troncato silenziosamente.

**Fix:** Aggiungere `.limit(10000)` alla query riga 77.

### Bug 2 (P1): `useAdminRevenueData` — stessa query companies senza limit
**File:** `src/hooks/useAdminRevenueData.ts`, riga 145-147
Stessa problematica: la query companies viene usata per health scores, cohort analysis, forecast, upsell alerts. Troncamento silenzioso con >1000 aziende.

**Fix:** Aggiungere `.limit(10000)` alla query riga 145-147.

### Bug 3 (P1): `useAdminRevenueData` — query key non usa `queryKeys` factory
**File:** `src/hooks/useAdminRevenueData.ts`, riga 142
Usa `["admin-revenue-intelligence"]` inline invece di `queryKeys.admin.*`. Questo rende impossibile l'invalidazione mirata dalla factory e viola lo standard di progetto.

**Fix:** Aggiungere `revenueIntelligence` alla factory in `queryKeys.ts` e usarla nel hook.

### Nessun altro bug trovato
- Il cruscotto non ha refresh manuale — comportamento intenzionale (5 query parallele, staleTime 2 min)
- I filtri cruscotto sono coerenti: marketing usa date+assignees+sources+pipeline, operations usa solo statusId (snapshot operativo), finance usa date (confronto temporale). Tutte scelte funzionali legittime.
- La CompanyDashboard RPC `get_dashboard_kpis` centralizza i KPI lato server — nessun rischio di divergenza client.

## Piano correzioni

| File | Fix | Tipo |
|------|-----|------|
| `src/hooks/useAdminDashboardData.ts` | `.limit(10000)` su query companies | Scalabilità |
| `src/hooks/useAdminRevenueData.ts` | `.limit(10000)` su query companies | Scalabilità |
| `src/hooks/useAdminRevenueData.ts` | Usare `queryKeys.admin.*` | Consistenza |
| `src/lib/queryKeys.ts` | Aggiungere `revenueIntelligence` ad `admin` | Consistenza |

4 modifiche su 3 file. Nessun rischio di regressione.

