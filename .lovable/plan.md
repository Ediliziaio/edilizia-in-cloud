

# Marketing Dashboard V2 — Tab-based Layout

Trasformare la dashboard da scroll verticale infinito a cruscotto denso a tab personalizzabili.

## Panoramica

10 file da creare/modificare. I componenti esistenti (Funnel, SalesTable, etc.) vengono riusati con adattamenti minimi (prop `compact`). Il prompt fornito ha alcune prop sbagliate rispetto ai componenti reali — le correggo nel piano.

## Differenze props reali vs prompt

| Componente | Prompt dice | Realtà |
|---|---|---|
| DashboardFilters | `updateFilters` | `onUpdate` |
| DashboardSalesTable | `salesPerformance` | `sales` |
| DashboardForecast | `kpi, kpiPrev` | `kpi` (no kpiPrev) |
| SalesTargetsDialog | `open, onOpenChange` | Self-managed (DialogTrigger) |
| DashboardFilters | `compact` prop | Non esiste ancora |

## File da creare (7 nuovi)

1. **`src/hooks/useDashboardLayout.ts`** — Hook gestione tab con localStorage (come da prompt MD1, codice completo fornito)

2. **`src/components/marketing/dashboard/AlertBanner.tsx`** — Banner alert collassabile (come da prompt MD2)

3. **`src/components/marketing/dashboard/DashboardCustomizePanel.tsx`** — Sheet laterale con toggle tab (come da prompt MD5)

4. **`src/components/marketing/dashboard/tabs/TabPanoramica.tsx`** — Layout denso 4 righe: Hero cards, KPI strip, Funnel+Conversioni, Team compatto. Adattato per usare le props reali: `funnel={data.funnel} isLoading={false}`, `sales={data.sales_performance} isLoading={false}`

5. **`src/components/marketing/dashboard/tabs/TabPipeline.tsx`** — Funnel full + Forecast + Insights. Props corrette: `DashboardForecast kpi={data.kpi} isLoading={false}`, `DashboardInsights kpi/kpiPrev/sales/sources/alerts/isLoading`

6. **`src/components/marketing/dashboard/tabs/TabAttivita.tsx`** — KPI attività + Call center. Props: `callCenter={data.call_center} isLoading={false}`

7. **`src/components/marketing/dashboard/tabs/TabTeam.tsx`** — Summary + tabella performance full. Props: `sales={data.sales_performance} isLoading={false}`

8. **`src/components/marketing/dashboard/tabs/TabFonti.tsx`** — Summary fonti + tabella ROI. Props: `sources={data.sources} isLoading={false}`

9. **`src/components/marketing/dashboard/tabs/TabTrend.tsx`** — Grafico temporale. Props: `trend={data.trend} isLoading={false}`

## File da modificare (3 esistenti)

10. **`src/pages/azienda/marketing/MarketingDashboard.tsx`** — Riscrittura completa come orchestratore tab. Usa `useDashboardLayout` + `useMarketingDashboard`. Tab bar con icone, alert banner, filtri compatti. `SalesTargetsDialog` resta self-managed (non controllato via open/onOpenChange). `DashboardFilters` riceve `onUpdate` (non `updateFilters`) e `hideUserFilter`.

11. **`src/components/marketing/dashboard/DashboardFilters.tsx`** — Aggiungere prop `compact?: boolean` all'interfaccia Props. Quando compact=true: altezze ridotte (h-7), font xs, gap ridotti.

12. **`src/components/marketing/dashboard/DashboardFunnel.tsx`** — Aggiungere prop `compact?: boolean`. Quando compact=true: padding ridotti, font più piccolo, barre più basse, nessun Card wrapper.

13. **`src/components/marketing/dashboard/DashboardSalesTable.tsx`** — Aggiungere prop `compact?: boolean`. Quando compact=true: solo colonne essenziali (Commerciale, App. Svolti, Vinti, Fatturato, Chiusura%), padding ridotto, nessun Card wrapper.

## Ordine implementazione

1. `useDashboardLayout.ts` (nessuna dipendenza)
2. `AlertBanner.tsx` + `DashboardCustomizePanel.tsx` (nessuna dipendenza)
3. Modifiche compact a DashboardFilters, DashboardFunnel, DashboardSalesTable
4. 6 tab components (TabPanoramica, TabPipeline, TabAttivita, TabTeam, TabFonti, TabTrend)
5. Riscrittura MarketingDashboard.tsx (orchestratore)

