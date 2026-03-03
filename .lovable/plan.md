

# Analisi "Tempo Medio di Chiusura" + Miglioramenti Statistici Esperti

## Problema Attuale

Il KPI `avg_time_to_close` nella RPC calcola:
```
AVG(opportunity.updated_at - opportunity.created_at)
```
Questo misura il tempo **dalla creazione dell'opportunità** al cambio stato in "won". Ma il ciclo di vendita reale parte **dal primo contatto del lead** (`marketing_contacts.created_at`), non dalla creazione dell'opportunità.

## Piano di Miglioramento

### 1. Fix RPC: Tempo medio corretto (lead → won)

Aggiornare `get_marketing_dashboard_stats` per calcolare:
- **`avg_lead_to_won_days`**: media dei giorni da `marketing_contacts.created_at` a `marketing_opportunities.updated_at` (solo status='won'), tramite JOIN su `contact_id`
- **`median_lead_to_won_days`**: mediana (più robusta della media, non viene distorta da outlier estremi)
- Mantenere anche `avg_time_to_close` attuale (opportunità → won) come KPI secondario rinominato "Tempo in Pipeline"

### 2. Nuovo KPI: Sales Velocity

Formula standard di sales analytics:
```
Sales Velocity = (N° opportunità aperte × Win Rate × Ticket Medio) / Ciclo Medio (gg)
```
Un singolo numero in €/giorno che indica la velocità con cui la pipeline genera fatturato. Calcolato nella RPC.

### 3. Nuovo KPI: Revenue per Lead (RPL)

```
RPL = Fatturato Totale / Lead Nuovi
```
Indica il valore economico medio generato da ogni lead acquisito, indipendentemente dalla conversione. Utile per valutare la qualità delle fonti.

### 4. Pipeline Pesata (Weighted Pipeline)

Attualmente la pipeline mostra solo il valore delle opportunità aperte. Una pipeline pesata moltiplica il valore di ogni opportunità per la probabilità di chiusura basata sulla posizione nel funnel:
- Stage iniziale → 10-20%
- Stage intermedio → 40-60%  
- Stage avanzato → 70-90%

Calcolata nella RPC assegnando peso proporzionale alla posizione dello stage.

### 5. UI: Sezione "Ciclo di Vendita" nel Forecast

Sostituire i 2 box "Tempo medio 1° contatto" e "Tempo medio chiusura" con una sezione più ricca:

| Metrica | Descrizione |
|---------|-------------|
| Ciclo Medio Lead→Won | Media giorni dal lead al contratto |
| Mediana Ciclo | Più affidabile della media |
| Tempo in Pipeline | Dalla creazione opportunità al won |
| Sales Velocity | €/giorno generati dalla pipeline |
| Revenue per Lead | Fatturato / Lead nuovi |
| Pipeline Pesata | Valore ponderato per probabilità |

### 6. Insight automatici aggiuntivi

Nuove regole in `DashboardInsights`:
- Se mediana ciclo > 30gg → warning "Ciclo di vendita lungo"
- Se sales velocity in calo vs periodo precedente → alert
- Se RPL < CPL → warning "Il costo per lead supera il valore generato"

### File da modificare

| Azione | File |
|--------|------|
| Migrazione | RPC `get_marketing_dashboard_stats` (nuovi campi) |
| Modifica | `useMarketingDashboard.ts` (tipi KpiData) |
| Modifica | `DashboardForecast.tsx` (sezione ciclo vendita arricchita) |
| Modifica | `DashboardKPICards.tsx` (RPL card) |
| Modifica | `DashboardInsights.tsx` (nuove regole) |
| Modifica | `MarketingDashboard.tsx` (export CSV) |

