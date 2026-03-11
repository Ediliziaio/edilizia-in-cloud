

# Cruscotto Aziendale V2 — Piano di implementazione

## Scope

Trasformare il cruscotto da dashboard a tab in un **singolo scroll verticale** ordinato per urgenza, seguendo la sequenza CR1 → CR2 → CR3 → CR4 del documento fornito.

## Modifiche

### 1. `src/hooks/useCruscottoData.ts` — CR1: 2 nuove query + 2 nuovi tipi

- Aggiungere `TodayData` e `CashFlowForecastData` come interfacce esportate
- Aggiungere query `cruscotto-today` (lead oggi, appuntamenti oggi, crediti scaduti, fornitori 7gg) con `staleTime: 60_000`
- Aggiungere query `cruscotto-cashflow-forecast` (incassi 30/60/90gg + fatturato mese/trimestre/YTD) con `staleTime: 300_000`
- Aggiornare il return con `todayData`, `cashFlowForecast` e `isLoading` aggiornato

### 2. Nuovi componenti — CR2: 4 file

| File | Funzione |
|------|----------|
| `src/components/cruscotto/CruscottoHero.tsx` | 4 card: Fatturato (mese/trim/YTD), Cash Flow Mese, Posizione Netta, Salute Aziendale (radiale SVG) |
| `src/components/cruscotto/AlertPanel.tsx` | Sostituisce CruscottoAlerts — alert con CTA navigabili, ordinati critical→warning→info, collapsible |
| `src/components/cruscotto/TodayFocus.tsx` | 4 tile: Lead oggi, Appuntamenti oggi, Crediti scaduti, Fornitori 7gg + lista fornitori |
| `src/components/cruscotto/CashFlowForecast.tsx` | Cash flow netto, burn rate, margine, barre incassi 30/60/90gg |

**Adattamenti rispetto al prompt:** `CruscottoHero` importerà `KpiData` da `@/hooks/useMarketingDashboard` (dove è definito, non da `useCruscottoData`). `WeeklySnapshot` riceve prop `data` (non `weeklyAgenda`).

### 3. `src/pages/azienda/CruscottoAziendale.tsx` — CR3: Layout singolo scroll

- Rimuovere import `CruscottoAlerts`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, icone tab non più usate
- Aggiungere import dei 4 nuovi componenti
- Destructuring: aggiungere `todayData`, `cashFlowForecast`
- Layout: header sticky con filtri inline → Hero → AlertPanel → TodayFocus → Finanza (2 col) → Vendite/Pipeline (3 col) → Operazioni (2 col) → HR/Trend (3 col) → Marketing
- Mantiene `SectionErrorBoundary`, `EmptyStateGuide`, `DrilldownDrawer`, `TargetProgressBar`

### 4. CR4: Verifiche di integrazione

- Tutti i tipi esportati da `useCruscottoData.ts`
- `KpiData` importato dal path corretto (`useMarketingDashboard`)
- Nessun import residuo di `CruscottoAlerts` in CruscottoAziendale
- Route di navigazione verificate: `/azienda/marketing/contatti`, `/azienda/marketing/calendario`, `/azienda/ordini`, `/azienda/costi`, `/azienda/marketing/opportunita` — tutte esistenti in `companyRoutes.tsx`

## File coinvolti

- **Modificati:** `src/hooks/useCruscottoData.ts`, `src/pages/azienda/CruscottoAziendale.tsx`
- **Nuovi:** `src/components/cruscotto/CruscottoHero.tsx`, `AlertPanel.tsx`, `TodayFocus.tsx`, `CashFlowForecast.tsx`
- **Non toccati:** tutti i componenti esistenti riutilizzati (FinanzaCashFlow, PipelineForecast, MarketingControl, OperationsDelivery, WeeklySnapshot, HRPerformance, CruscottoTrend, etc.)

