

# Dashboard Enterprise 2.0 — Stato e Piano Target Settimanali

## Stato Attuale

L'analisi del codice conferma che la **Dashboard Enterprise 2.0 è già completamente implementata** nelle iterazioni precedenti:

- **RPC `get_marketing_dashboard_stats`**: include pipeline_active_value, forecast_30d, forecast_min/max, avg_time_to_first_contact, avg_time_to_close, conversion rates, enhanced alerts (stale_leads_2h, show_rate_below_threshold, pipeline_declining), show_rate per commerciale, roi_pct per fonte
- **DashboardStrategicKPI**: 6 card grandi con progress bar target e delta %
- **DashboardForecast**: Pipeline + Forecast con range min/max e conversion rates
- **DashboardInsights**: Sintesi strategica rule-based
- **DashboardAlerts**: 3 livelli severità (critico/attenzione/informativo)
- **DashboardFunnel**: Bottleneck evidenziato in rosso con avg_days_in_stage
- **DashboardSalesTable**: Show rate, media team, evidenziazione sopra/sotto media
- **DashboardSourcesTable**: ROI %, CPL, CPA con ordinamento per ROI
- **DashboardCallCenter**: Tabella operatori completa
- **Layout**: ordine corretto (KPI → Alert → Insights → Funnel+Forecast → Sales → CallCenter → Sources → Trend)

## Unica feature mancante: Target Settimanali Configurabili

### 1. Migrazione DB: tabella `sales_targets`

Nuova tabella con:
- `id`, `company_id`, `user_id`, `period_type` (weekly/monthly)
- `target_revenue`, `target_contracts`, `target_appointments`, `target_calls`
- RLS: SELECT per tutti i membri del company, ALL per admin
- Unique constraint su `(company_id, user_id, period_type)`

### 2. Nuovo componente: `SalesTargetsDialog.tsx`

Dialog accessibile dal header della dashboard (pulsante "Target") che permette di configurare target settimanali per ogni commerciale:
- Carica la lista team members + target esistenti
- Form con input per Fatturato, Contratti, Appuntamenti per ogni utente
- Upsert su salvataggio

### 3. Modifica: `DashboardSalesTable.tsx`

- Fetch `sales_targets` per il company_id
- Per ogni commerciale mostra colonna "Target" e "% Completamento"
- Progress bar colorata: verde >80%, giallo 50-80%, rosso <50%

### 4. Modifica: `MarketingDashboard.tsx`

- Import e rendering di `SalesTargetsDialog` nel header, accanto ai pulsanti Aggiorna/Esporta
- Visibile solo per admin (`permissions.isAdmin`)

### 5. Riepilogo file

| Azione | File |
|--------|------|
| Migrazione | Tabella `sales_targets` + RLS + indici |
| Crea | `SalesTargetsDialog.tsx` |
| Modifica | `DashboardSalesTable.tsx` — colonna target + progress |
| Modifica | `MarketingDashboard.tsx` — pulsante Target nel header |

