

# Sprint 2 — Grafici Chiave: Piano di Implementazione

Sprint 1 è completamente implementato. Ora si procede con i 5 grafici ad alto impatto.

---

## 1. BarChart Entrate vs Uscite — Bilancio Mese (Dashboard)

**File:** `src/hooks/useCompanyDashboardData.ts`
- Aggiungere query per gli ultimi 6 mesi di dati aggregati: per ogni mese calcolare entrate (pagamenti attesi non pagati con expected_date in quel mese) e uscite (company_costs non pagati con due_date in quel mese)
- Restituire array `monthlyBalance: { month: string; entrate: number; uscite: number }[]` nel return

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Nel widget "Bilancio Mese" (righe 343-395), sostituire le due Progress bars con un `BarChart` grouped di recharts (già installato)
- 2 barre per mese: verde per entrate, rosso per uscite
- Mantenere la card "Saldo Netto" e "Prossimo mese" sotto il grafico
- Altezza grafico: ~200px con `ResponsiveContainer`

---

## 2. AreaChart Cash Flow Cumulativo — Previsione di Cassa

**File:** `src/components/forecast/CashForecastTab.tsx`
- Sotto la hero card "Saldo Cumulativo", aggiungere un `AreaChart` recharts
- Calcolare running balance giornaliero/settimanale dalle `transactions` già calcolate nel componente: raggruppare per settimana, calcolare saldo cumulativo progressivo
- Area verde sopra lo zero, rossa sotto — usare `ReferenceLine y={0}` e gradiente
- Le zone con saldo negativo evidenziate con sfondo rosso chiaro tramite `ReferenceArea`
- ~250px altezza

---

## 3. PieChart Spese per Categoria — Sezione Costi

**File:** `src/components/forecast/CostsStatsCards.tsx`
- Aggiungere un `PieChart`/Donut recharts accanto al grafico mensile esistente
- Dati: aggregare i costi filtrati per `category`, mostrando le top 6 categorie + "Altro"
- Usare palette colori coerente

**File:** `src/hooks/useCompanyCostsData.ts`
- Aggiungere nel return un campo `categoryDistribution: { name: string; value: number }[]` calcolato aggregando `allCostsSorted` per categoria

---

## 4. Breakdown Visivo Health Score

**File:** `src/components/cruscotto/CompanyHealthScore.tsx`
- Sotto i badge testuali esistenti, aggiungere 5 barre orizzontali (una per dimensione: Margine, Cash Flow, Vendite, Show Rate, Operazioni)
- Ogni barra mostra: label a sinistra, barra colorata proporzionale al `score` (0-100), peso percentuale a destra
- Colori: verde/giallo/rosso in base allo `status` già calcolato in `calcFactors`
- Usare semplici `div` con `width` percentuale (no recharts necessario, più leggero)

---

## 5. Sparkline Fatturato YTD — Dashboard

**File:** `src/hooks/useCompanyDashboardData.ts`
- Aggiungere query per fatturato mensile YTD (da inizio anno ad oggi): per ogni mese, sommare `total_amount` degli ordini creati in quel mese
- Restituire `revenueYTD: { month: string; revenue: number }[]`

**File:** `src/pages/azienda/CompanyDashboard.tsx`
- Sopra il CEO Strip, aggiungere una Card con un `AreaChart` sparkline (senza assi, solo la linea e l'area)
- Mostra il trend del fatturato da Gennaio ad oggi con etichetta "Fatturato YTD" e valore totale
- Altezza compatta: ~80px

---

## Riepilogo file coinvolti

| File | Modifica |
|------|----------|
| `src/hooks/useCompanyDashboardData.ts` | Aggiungere `monthlyBalance[]` e `revenueYTD[]` |
| `src/pages/azienda/CompanyDashboard.tsx` | BarChart Bilancio Mese + Sparkline YTD |
| `src/components/forecast/CashForecastTab.tsx` | AreaChart cash flow cumulativo |
| `src/components/forecast/CostsStatsCards.tsx` | PieChart categorie |
| `src/hooks/useCompanyCostsData.ts` | Aggiungere `categoryDistribution[]` |
| `src/components/cruscotto/CompanyHealthScore.tsx` | Barre breakdown score |

