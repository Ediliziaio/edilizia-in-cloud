

# Dashboard Marketing & Vendite — Upgrade Completo

## Stato attuale

La dashboard esiste con: KPI Cards (10 metriche), Funnel, Trend Chart, Sales Table, Sources Table, Alerts. I filtri hanno solo DateRange presets. Mancano le tabelle `call_logs` e `campaign_costs`, e i filtri avanzati (utente, fonte, pipeline, area geografica).

## Piano di implementazione

### 1. Nuove tabelle DB

**`call_logs`**:
- `id` uuid PK, `company_id` uuid FK, `user_id` uuid FK (operatore), `contact_id` uuid FK nullable
- `started_at` timestamptz, `duration_sec` int, `outcome` text (answered/no_answer/busy/voicemail)
- `notes` text nullable, `created_at` timestamptz
- RLS: company_id match + check_staff_visibility

**`campaign_costs`**:
- `id` uuid PK, `company_id` uuid FK, `source` text, `campaign_name` text nullable
- `date` date, `spend_amount` numeric, `notes` text nullable, `created_at` timestamptz
- RLS: company_id match

### 2. Filtri avanzati in DashboardFilters

Aggiungere multi-select dropdown per:
- **Utente assegnato** (query profiles del tenant)
- **Fonte** (query distinct sources da marketing_contacts)
- **Pipeline** (query marketing_pipelines del tenant)

I filtri esistono gia' nello state (`assignedUserIds`, `sources`, `pipelineId`) ma la UI non li mostra.

### 3. Nuovi KPI: CPL e CPA

Aggiungere al `KpiData`:
- `cpl` (Spend / Lead Totali)
- `cpa` (Spend / Contratti Vinti)
- `calls_total`, `calls_answered`, `contact_rate`

### 4. Aggiornare RPC `get_marketing_dashboard_stats`

Estendere per includere:
- Calcolo CPL/CPA da `campaign_costs`
- Sezione `call_center` con aggregazioni da `call_logs`
- KPI call center per operatore

### 5. Nuovo widget: `DashboardCallCenter.tsx`

Tabella operatori con: Chiamate, Contatti, Tasso contatto %, Appuntamenti fissati. Con KPI summary in alto.

### 6. Aggiornare DashboardSourcesTable

Aggiungere colonne CPL e CPA quando i dati campaign_costs sono disponibili.

### 7. File da creare/modificare

**Migrazione DB**: tabelle `call_logs` + `campaign_costs` + RLS + indici + aggiornamento RPC

**Nuovi file**:
- `src/components/marketing/dashboard/DashboardCallCenter.tsx`

**File modificati**:
- `src/hooks/useMarketingDashboard.ts` — nuovi tipi + parametri
- `src/components/marketing/dashboard/DashboardFilters.tsx` — multi-select utente/fonte/pipeline
- `src/components/marketing/dashboard/DashboardKPICards.tsx` — card CPL/CPA
- `src/components/marketing/dashboard/DashboardSourcesTable.tsx` — colonne CPL/CPA
- `src/pages/azienda/marketing/MarketingDashboard.tsx` — widget CallCenter

