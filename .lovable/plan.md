

# SO1 — Sales OS Database Migration

## Cosa fa
Una singola migration SQL che estende il CRM/Marketing esistente con funzionalita' Sales OS:

1. **Estende tabelle esistenti**:
   - `marketing_opportunities`: probability, expected_close_date, next_action, lost_reason, stalled tracking, sales_velocity_snapshot
   - `marketing_pipeline_stages`: win_probability, expected_duration_days, stalled_threshold_days, playbook JSONB
   - `marketing_contacts`: lead_score, icp_score, icp_tier

2. **Crea nuove tabelle**:
   - `sales_targets` — obiettivi vendita mensili per utente
   - `sales_playbook_completions` — tracking completamento step playbook per opportunita/stage

3. **RLS** su entrambe le nuove tabelle con company isolation via profiles

4. **Indici** per performance su close date, stalled, next_action_date, lead_score, targets

5. **4 nuove RPC**:
   - `get_weighted_pipeline` — pipeline pesata per probabilita
   - `get_sales_forecast` — forecast revenue per mese
   - `get_stalled_opportunities` — opportunita ferme oltre soglia
   - `get_sales_velocity` — metriche velocita vendita (win rate, avg deal size, cycle days)

## Note tecniche
- Il file usa CHECK constraints inline sugli ALTER TABLE — sono immutabili (valori statici, non time-based) quindi OK
- Le RPC sono tutte SECURITY DEFINER per bypassare RLS internamente
- La migration non tocca codice frontend, solo schema DB

## Implementazione
Un singolo step: eseguire la migration SQL tramite il tool database migration con il contenuto esatto del file caricato.

