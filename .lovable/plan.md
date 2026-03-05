

# Ottimizzazione Cruscotto Aziendale

## Obiettivo
Riorganizzare il cruscotto per mostrare subito i KPI finanziari e commerciali arricchiti, eliminare le sezioni superflue, e organizzare il dettaglio in 4 tab.

---

## 1. Rimuovere componenti (CruscottoAziendale.tsx)

Eliminare dal layout:
- `DailyPriorities` (righe 76-81)
- `WeeklyAgenda` (righe 82-85) + relativo grid wrapper
- `ExecutiveSummary` (righe 96-102) — lasciare solo HealthScore a larghezza piena
- Import relativi

---

## 2. Arricchire i KPI Finanziari (ExecutiveOverview.tsx)

Aggiungere alla lista `FINANCIAL_KPIS` questi nuovi indicatori:

| KPI | Sorgente dati | Formato |
|-----|--------------|---------|
| **N° Ordini** | `operations.activeOrders` | numero |
| **Costo Medio Ordine** | `finance.revenueThisMonth / operations.activeOrders` | valuta |
| **Entrate Mese** | `finance.thisMonthIncome` | valuta |
| **Uscite Mese** | `finance.thisMonthOutflow` | valuta |
| **Burn Rate** | `finance.thisMonthOutflow / giornoDelMese` (€/giorno) | valuta/gg |

Per rendere disponibili i dati `operations` nel componente:
- Aggiungere `operations: OperationsData` alle Props di `ExecutiveOverview`
- Passare `operations` dal componente padre
- Usare i dati nelle definizioni KPI

Grid finanziaria: da `lg:grid-cols-5` a `lg:grid-cols-6` per ospitare le card aggiuntive (11 KPI finanziari su 2 righe).

---

## 3. Riorganizzare layout con Tab (CruscottoAziendale.tsx)

Nuovo layout della pagina:

```text
┌──────────────────────────────────────┐
│ Header + Filtri                      │
├──────────────────────────────────────┤
│ Health Score (full width)            │
├──────────────────────────────────────┤
│ KPI Finanziari (strip di card)       │
│ KPI Commerciali (strip di card)      │
├──────────────────────────────────────┤
│ Alerts                               │
├──────────────────────────────────────┤
│ [Finanza] [Marketing] [Vendite] [Ops]│
│ ┌────────────────────────────────┐   │
│ │ Contenuto tab attiva           │   │
│ └────────────────────────────────┘   │
├──────────────────────────────────────┤
│ Trend (sempre visibile)              │
└──────────────────────────────────────┘
```

**Contenuto delle 4 tab:**
- **Finanza**: `FinanzaCashFlow` + `PipelineForecast`
- **Marketing**: `MarketingControl` (Funnel + Sorgenti)
- **Vendite**: `SalesControl` + `HRPerformance`
- **Operazioni**: `OperationsDelivery`

---

## File da modificare

| File | Intervento |
|------|-----------|
| `ExecutiveOverview.tsx` | Aggiungere `operations` a Props, 5 nuovi KPI finanziari, aggiornare grid |
| `CruscottoAziendale.tsx` | Rimuovere DailyPriorities/WeeklyAgenda/ExecutiveSummary, aggiungere Tabs con 4 pannelli, passare `operations` a ExecutiveOverview |
| `useCruscottoData.ts` | Nessuna modifica — i dati necessari sono già disponibili |

