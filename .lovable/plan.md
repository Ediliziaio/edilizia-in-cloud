

# Sales OS — Piano di Implementazione Completo (SO1 → SO6)

Ho analizzato il file caricato e lo stato attuale del database/codice. Ecco le differenze chiave e il piano adattato.

## Stato attuale del database

| Elemento | Stato | Note |
|---|---|---|
| `marketing_opportunities.probability` | Esiste | OK |
| `marketing_opportunities.expected_close_date` | Esiste | OK |
| `marketing_opportunities.next_action`, `next_action_date`, `lost_reason_category`, `competitor_won`, `stalled_notified_at`, `sales_velocity_snapshot` | Mancanti | Da aggiungere |
| `marketing_opportunities.loss_reason` / `loss_notes` | Esiste | Il prompt usa `lost_reason` — adatteremo ai nomi esistenti |
| `marketing_pipeline_stages.win_probability`, `stalled_threshold_days`, `playbook`, `expected_duration_days` | Mancanti | Da aggiungere |
| `marketing_contacts.lead_score`, `icp_score`, `icp_tier`, `last_score_update` | Mancanti | Da aggiungere |
| `sales_targets` | Esiste ma schema diverso | Ha `user_id`/`period_type`/`target_revenue` invece di `assigned_to`/`year`/`month`/`target_amount`. Adatteremo gli hook alla struttura esistente |
| `sales_playbook_completions` | Non esiste | Da creare |
| RPC functions (4) | Non esistono | Da creare |
| `useSalesOS.ts` | Non esiste | Da creare |
| SalesOS Dashboard | Non esiste | Da creare |

## Piano esecutivo (6 step sequenziali)

### Step 1 — Database Migration

Una singola migration SQL che:
- Aggiunge 6 colonne a `marketing_opportunities` (skip `probability` e `expected_close_date` che esistono già, adatta `lost_reason` a `loss_reason` esistente)
- Aggiunge 4 colonne a `marketing_pipeline_stages`
- Aggiunge 4 colonne a `marketing_contacts`
- Crea tabella `sales_playbook_completions` con RLS
- NON tocca `sales_targets` (esiste già con schema diverso — adatteremo il codice)
- Crea 4 RPC functions: `get_weighted_pipeline`, `get_sales_forecast`, `get_stalled_opportunities`, `get_sales_velocity`
- Crea indici per performance

Le RPC useranno `loss_reason` invece di `lost_reason` per allinearsi ai nomi colonna esistenti. I CHECK constraint saranno sostituiti da validation trigger come da linee guida.

### Step 2 — Hook: `src/hooks/useSalesOS.ts`

Crea il hook con tutti i tipi e le query dal prompt, adattando:
- `useCompanyData()` → `useAuth()` con `effectiveCompany?.id`
- `useSalesTargets` → adattato allo schema `sales_targets` esistente (usa `user_id` e `target_revenue` invece di `assigned_to`/`target_amount`)
- `useSellerPerformance` → usa `profiles` con `first_name`/`last_name` (verificato nel progetto)
- `useUpdateOpportunityMutation` → usa `loss_reason` invece di `lost_reason`

Include: 8 query hooks + 2 mutations + `useRecalculateLeadScore`

### Step 3 — Utility: `src/utils/leadScoring.ts`

Copia esatta dal prompt — logica pura senza dipendenze esterne.

### Step 4 — UI: Opportunity Detail Enhancement

Modifica `OpportunityDetailDialog.tsx`:
- Aggiunge sezione "Avanzamento Commerciale" (data chiusura, probabilità, prossima azione)
- Aggiunge Dialog obbligatorio "Motivo Perdita" quando status → lost/abandoned
- Aggiunge Badge "Ferma da Xgg"

### Step 5 — Pagina: `src/pages/azienda/marketing/SalesOSDashboard.tsx`

Crea la pagina con 4 tab (Pipeline, Ferme, Team, Analisi) come dal prompt, con:
- `SalesVelocityCard` sempre visibile
- `WeightedPipelineChart` + `SalesForecastChart`
- `StalledOpportunitiesPanel`
- `SellerComparisonTable` + `TopLeadsTable`
- `ConversionBySourceChart`

Usa `effectiveCompany?.id` come companyId.

### Step 6 — Integrazione: Routing + Sidebar + Stage Config

- Aggiunge route `/azienda/marketing/sales-os` in `App.tsx`
- Aggiunge link "Sales OS" nella sidebar Marketing
- Aggiunge campi `win_probability` e `stalled_threshold_days` al form stage in `PipelineStagesConfig.tsx`
- Aggiunge Lead Score al dettaglio contatto `MarketingContactDetail.tsx`

## File coinvolti

| File | Azione |
|---|---|
| Migration SQL | Nuovo — via migration tool |
| `src/hooks/useSalesOS.ts` | Nuovo |
| `src/utils/leadScoring.ts` | Nuovo |
| `src/pages/azienda/marketing/SalesOSDashboard.tsx` | Nuovo |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Modifica |
| `src/components/settings/PipelineStagesConfig.tsx` | Modifica |
| `src/pages/azienda/marketing/MarketingContactDetail.tsx` | Modifica |
| `src/App.tsx` (o router) | Modifica |
| Sidebar/Nav component | Modifica |

Data la complessità (6 step, ~2000 righe di codice), implementeremo in 2-3 messaggi sequenziali: prima DB + hooks, poi UI + routing.

