

## VENDOR-REP-03: Already Implemented — Missing Only Side-by-Side Comparison

### Current State

All three objectives from VENDOR-REP-03 are already done **except** the side-by-side agent comparison:

| Feature | Status |
|---|---|
| Funnel visivo (`VenditoriFunnel.tsx`) | Done — horizontal bars, conversion rates, won/lost coloring |
| Ranking agenti (`VenditoriRanking.tsx`) | Done — sortable table with semaphore badges, team footer |
| Confronto fianco a fianco | **Not implemented** |

### What needs to be built

**New component: `VenditoriConfronto.tsx`**
- Two agent selectors side by side
- Compare all KPI metrics in a two-column layout (Agent A vs Agent B)
- Each metric row shows: label, value A, bar comparison, value B
- Color highlight showing which agent is better on each metric
- Reuses existing `VendorKPI` data from `kpiList`

**Update `VenditoriPerformanceReport.tsx`**
- Add a 4th tab: "Confronto" with a `GitCompareArrows` icon
- Mount `VenditoriConfronto` passing `kpiList`

### Technical approach
- The component receives `kpiList: VendorKPI[]` and manages two local `useState` for agent selection
- For each KPI field, render a horizontal comparison bar showing relative performance
- Fields compared: fatturato, tasso_chiusura, tasso_show_up, importo_medio, opp_vinte, tasso_app_to_close, avg_giorni_chiusura, pipeline, nuovi_contatti
- For `avg_giorni_chiusura`, lower is better (invert the "winner" logic)
- Uses existing `formatCurrency` from `@/lib/formatters`

