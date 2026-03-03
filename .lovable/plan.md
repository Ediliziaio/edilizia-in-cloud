

# Dashboard Marketing & Vendite — Piano Implementazione

## Analisi Dati Esistenti

Tabelle disponibili e campi rilevanti:

```text
marketing_contacts     → id, company_id, source, assigned_to, city, province, contact_type, tags, created_at
marketing_opportunities → id, company_id, contact_id, stage_id, pipeline_id, status (open/won/lost), value, assigned_to, source, created_at, updated_at
marketing_pipeline_stages → id, pipeline_id, company_id, name, position, auto_status
appointments           → id, company_id, contact_id, assigned_to, status, is_completed, appointment_date, appointment_type
marketing_contact_activities → activity_type, contact_id, company_id, created_at, metadata

Tabelle MANCANTI: call_logs, campaign_costs → sezione Call Center e CPL/CPA nascosti con tooltip "Dati non disponibili"
```

## Struttura Implementativa

### 1. DB: Creare RPC aggregata `get_marketing_dashboard_stats`

Una singola RPC che riceve filtri (date_from, date_to, assigned_user_ids, sources, stages) e restituisce un unico JSON con tutte le metriche:

- **Lead totali/nuovi** (count da `marketing_contacts`)
- **Contatti lavorati** (count contacts con almeno un'activity o opportunity)
- **Appuntamenti fissati/svolti** (count da `appointments` con/senza is_completed)
- **Show rate** (svolti/fissati)
- **Opportunita per stage** (count + sum value per stage, ordinati per position) — dati funnel
- **Contratti vinti** (opportunities status=won, sum value)
- **Ticket medio** (fatturato/contratti vinti)
- **Tasso chiusura** (won / appuntamenti svolti)
- **Performance per assegnato** (group by assigned_to)
- **Performance per fonte** (group by source)
- **Alert** (lead senza activity entro 48h, opportunities ferme >7gg, appuntamenti passati senza esito)
- **Delta %** calcolato confrontando con periodo precedente di pari durata

### 2. UI: Componenti

File: `src/pages/azienda/marketing/MarketingDashboard.tsx` — riscrittura completa

**Layout (12-col grid):**

```text
┌─────────────────────────────────────────────────┐
│ Header: "Dashboard Marketing & Vendite"    [Esporta] │
├─────────────────────────────────────────────────┤
│ Filtri: DateRange | Assegnato | Fonte | Pipeline│
├─────────────────────────────────────────────────┤
│ KPI Cards (scroll orizzontale, 8 card primarie) │
│ Lead | Nuovi | Lavorati | App.Fissati | Svolti  │
│ ShowRate | Vinti | Fatturato                     │
├────────────────────┬────────────────────────────┤
│ Funnel (50%)       │ Trend temporale (50%)      │
├────────────────────┴────────────────────────────┤
│ Performance Commerciali (tabella ranking)       │
├─────────────────────────────────────────────────┤
│ Analisi Fonti (tabella ROI-like)                │
├─────────────────────────────────────────────────┤
│ Alert Intelligenti (lista prioritizzata)        │
└─────────────────────────────────────────────────┘
```

**Componenti da creare (tutti in `src/components/marketing/dashboard/`):**

1. `DashboardFilters.tsx` — Barra filtri sticky (DateRange presets, multi-select assegnato/fonte/pipeline)
2. `DashboardKPICards.tsx` — Row di 8 card con valore, delta %, mini sparkline
3. `DashboardFunnel.tsx` — Funnel verticale con fasi pipeline, count, conversion %, valore
4. `DashboardTrendChart.tsx` — Line chart (recharts) lead/opportunita/vinti nel tempo
5. `DashboardSalesTable.tsx` — Tabella ranking commerciali con metriche
6. `DashboardSourcesTable.tsx` — Tabella fonti con lead, conversioni, fatturato
7. `DashboardAlerts.tsx` — Lista alert prioritizzati con badge e link drill-down

### 3. Drill-Down

Click su KPI card → naviga a lista filtrata:
- Lead → `/azienda/marketing/contatti?source=X&from=Y&to=Z`
- Opportunita → `/azienda/marketing/opportunita?stage=X`
- Appuntamenti → `/azienda/marketing/calendario?from=Y&to=Z`

Click su riga tabella commerciale → filtra per assegnato.

### 4. Permessi

- Usa `usePermissions()` esistente (`canViewMarketing`)
- Staff con `only_assigned=true` → RPC filtra per `assigned_to = auth.uid()`
- Admin/CEO vede tutto il tenant

### 5. Sezioni NON implementabili (dati mancanti)

- **Call Center**: nessuna tabella `call_logs` → sezione mostrata come "Prossimamente" con empty state
- **CPL/CPA**: nessuna tabella `campaign_costs` → KPI nascosti, tooltip "Configura i costi campagna per vedere CPL/CPA"
- **Margine**: campo non presente in opportunities → nascosto

### 6. File da creare/modificare

**Nuovi file:**
- `src/components/marketing/dashboard/DashboardFilters.tsx`
- `src/components/marketing/dashboard/DashboardKPICards.tsx`
- `src/components/marketing/dashboard/DashboardFunnel.tsx`
- `src/components/marketing/dashboard/DashboardTrendChart.tsx`
- `src/components/marketing/dashboard/DashboardSalesTable.tsx`
- `src/components/marketing/dashboard/DashboardSourcesTable.tsx`
- `src/components/marketing/dashboard/DashboardAlerts.tsx`
- `src/hooks/useMarketingDashboard.ts` (hook con query aggregate)

**Modificati:**
- `src/pages/azienda/marketing/MarketingDashboard.tsx` — riscrittura da placeholder a dashboard completa

**Migrazione DB:**
- RPC `get_marketing_dashboard_stats` — aggregazione server-side per performance

### 7. Performance

- Singola RPC per tutti i KPI (1 round-trip, non 10 query separate)
- `staleTime: 60s` per evitare refetch continui
- Debounce 300ms sui filtri
- Lazy load dei grafici (recharts)
- Skeleton loading su ogni sezione

