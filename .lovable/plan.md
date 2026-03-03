

# Dashboard Marketing & Vendite — Enterprise 2.0

## Cosa cambia

### 1. Nuovo layout sezioni (riordinamento)
1. KPI Strategici (6 card grandi + card secondarie)
2. Alert Operativi (3 livelli: critico/attenzione/informativo)
3. Sintesi Strategica Automatica (nuovo)
4. Funnel con evidenziazione collo di bottiglia
5. Performance Commerciali (con show rate, media team, evidenziazione sopra/sotto media)
6. Call Center
7. Analisi Fonti + ROI % (colonna ROI, ordinamento per ROI)
8. Forecast & Pipeline Value (nuovo)
9. Trend Temporale (spostato in fondo)

### 2. Backend: aggiornare RPC `get_marketing_dashboard_stats`

Aggiungere al JSON di ritorno:
- `pipeline_active_value`: SUM(value) da marketing_opportunities WHERE status='open'
- `avg_time_to_first_contact`: media tempo tra created_at contatto e prima activity
- `avg_time_to_close`: media tempo tra created_at opportunità e updated_at quando status='won'
- `lead_to_appointment_rate`: appointments_set / leads_new * 100
- `appointment_to_contract_rate`: contracts_won / appointments_done * 100
- `lead_to_contract_rate`: contracts_won / leads_new * 100
- `forecast_30d`: stima basata su close_rate * avg_ticket * opportunità in fasi avanzate
- `forecast_min` / `forecast_max`: intervallo ±20%
- Alert aggiuntivi: `stale_leads_2h`, `show_rate_below_threshold`, `pipeline_declining`
- Per sales_performance: aggiungere `show_rate` per utente
- Per sources: aggiungere `roi_pct` calcolato

### 3. UI: file da creare

**Nuovi componenti:**
- `DashboardStrategicKPI.tsx` — 6 card grandi (Fatturato, Vinti, Pipeline Attiva, Forecast, Chiusura %, Show Rate) con progress bar target
- `DashboardForecast.tsx` — Card Forecast & Pipeline Value con barra min/max
- `DashboardInsights.tsx` — Box "Sintesi Strategica" con insight rule-based generati dai dati

### 4. UI: file da modificare

- `MarketingDashboard.tsx` — nuovo ordine sezioni + import nuovi componenti
- `DashboardKPICards.tsx` — diventa card secondarie (Lead, Nuovi, Lavorati, CPL, CPA, ecc.)
- `DashboardAlerts.tsx` — 3 livelli severità + nuovi alert + spostato sotto KPI
- `DashboardFunnel.tsx` — evidenziare fase con conversione più bassa in rosso + tooltip "collo di bottiglia" + tempo medio in fase
- `DashboardSalesTable.tsx` — aggiungere show rate, evidenziare sopra/sotto media team
- `DashboardSourcesTable.tsx` — aggiungere colonna ROI %, ordinamento default per ROI
- `useMarketingDashboard.ts` — nuovi tipi per dati aggiuntivi (pipeline_active_value, forecast, insights)

### 5. Migrazione DB

Una singola migrazione che fa `CREATE OR REPLACE FUNCTION get_marketing_dashboard_stats(...)` con tutti i nuovi campi calcolati. Nessuna nuova tabella necessaria.

### 6. Riepilogo file

| Azione | File |
|--------|------|
| Crea | `DashboardStrategicKPI.tsx` |
| Crea | `DashboardForecast.tsx` |
| Crea | `DashboardInsights.tsx` |
| Modifica | `MarketingDashboard.tsx` |
| Modifica | `useMarketingDashboard.ts` |
| Modifica | `DashboardKPICards.tsx` |
| Modifica | `DashboardAlerts.tsx` |
| Modifica | `DashboardFunnel.tsx` |
| Modifica | `DashboardSalesTable.tsx` |
| Modifica | `DashboardSourcesTable.tsx` |
| Migrazione | RPC `get_marketing_dashboard_stats` |

