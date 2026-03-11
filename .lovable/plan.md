

# Sales OS — Stato Implementazione

## Implementato (Step 1-6 completati)

| Componente | Stato |
|---|---|
| **DB Migration**: colonne su `marketing_opportunities`, `marketing_pipeline_stages`, `marketing_contacts` | ✅ |
| **DB Migration**: tabella `sales_playbook_completions` | ✅ |
| **DB Migration**: 4 RPC functions (weighted pipeline, forecast, stalled, velocity) | ✅ |
| **Hook `useSalesOS.ts`**: 8 query hooks + mutations | ✅ |
| **Utility `leadScoring.ts`**: ICP + behavioral scoring | ✅ |
| **Dashboard `SalesOSDashboard.tsx`**: 4 tab (Pipeline, Ferme, Team, Analisi) | ✅ |
| **OpportunityDetailDialog**: next_action, loss_reason_category, competitor_won, badge "Ferma da Xgg" | ✅ |
| **PipelineStagesConfig**: campi win_probability + stalled_threshold_days | ✅ |
| **Routing + Sidebar**: `/azienda/marketing/sales-os` + link nella sidebar | ✅ |

## Mancante

| Elemento | Dettaglio |
|---|---|
| **Lead Score nel dettaglio contatto** | `MarketingContactDetail.tsx` non mostra `lead_score`, `icp_score`, `icp_tier`. Il piano (Step 6) prevedeva di aggiungerlo ma non è stato implementato. |
| **Dialog obbligatorio perdita** | Il form mostra i campi loss_reason solo in-line quando `status === "lost"`, ma il piano prevedeva un **AlertDialog modale obbligatorio** che si apre automaticamente quando l'utente cambia lo status a "lost"/"abandoned", impedendo il salvataggio senza motivo. Attualmente è possibile salvare senza compilare il motivo. |
| **Stalled threshold dinamico** | Il badge "Ferma da Xgg" usa un valore hardcoded di 14 giorni (`const stalledThreshold = 14`) invece di leggere `stalled_threshold_days` dalla pipeline stage corrispondente. |

## Piano per completare le 3 lacune

### 1. Lead Score in MarketingContactDetail
Aggiungere una card/sezione che mostra: Lead Score (0-100 con Progress bar), ICP Tier (badge A/B/C/D), pulsante "Ricalcola" che chiama `useRecalculateLeadScore`.

### 2. Dialog modale obbligatorio per perdita
In `OpportunityDetailDialog`, intercettare il cambio status a "lost"/"abandoned" → aprire un AlertDialog che richiede `lossReason` (obbligatorio) + `lostReasonCategory` + `competitorWon` prima di permettere il salvataggio.

### 3. Stalled threshold dinamico
Nella sezione header di `OpportunityDetailDialog`, fare il lookup dello stage corrente per leggere `stalled_threshold_days` dalla lista `stages` (già passata come prop), e usare quel valore al posto del 14 hardcoded.

**File coinvolti**: `MarketingContactDetail.tsx`, `OpportunityDetailDialog.tsx`

