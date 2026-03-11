

## Fase 1: Estendere `useMarginData` + Creare `useBreakEvenHistorical`

Questa prima fase prepara tutta la logica dati. La UI verrà nella fase 2.

### 1. `src/hooks/useMarginData.ts` — Aggiungere campi annuali

Aggiungere all'interfaccia `MarginData`:
- `breakEvenAnnual: number` — break-even mensile × 12
- `breakEvenMonthOfYear: number` — mese dell'anno in cui si raggiunge il pareggio (1-12, 0 se non raggiungibile)
- `yearlyRevenue: number` — fatturato annuale stimato

Nei calcoli finali (dopo riga ~270):
- `breakEvenAnnual = breakEvenRevenue * 12`
- `yearlyRevenue = currentMonthlyRevenue * 12`
- `breakEvenMonthOfYear`: calcolo cumulativo mese per mese confrontando ricavi medi mensili vs costi fissi mensili cumulati

### 2. `src/hooks/useBreakEvenHistorical.ts` — Nuovo file

Hook che:
- Raggruppa gli ordini per anno (`created_at`)
- Per ogni anno calcola: fatturato totale, costi variabili totali, margine lordo, margine %
- Applica i costi fissi mensili correnti (da `useMarginData`) come proxy per calcolare il break-even annuale storico
- Restituisce un array `{ year, revenue, variableCosts, fixedCosts, netProfit, breakEvenRevenue }` per il grafico storico

Nessuna modifica al database. Nessun componente UI in questa fase.

