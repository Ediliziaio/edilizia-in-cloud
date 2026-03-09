

# Internal Automations: Analisi Problemi e Piano di Fix

## Problemi Trovati

Ho analizzato a fondo il sistema e trovato **5 problemi critici** che impediscono il funzionamento:

### 1. Nessun DB Trigger sulle tabelle (CRITICO)
La funzione `trigger_internal_automations()` esiste nel database ma **nessun trigger PostgreSQL** e' attaccato alle tabelle (`orders`, `tickets`, `tasks`, etc.). Questo significa che quando accade un evento (es. ordine creato), nessuna automazione viene attivata automaticamente.

### 2. Schema mismatch tra codice e spec del file uploadato
Il sistema attuale funziona con i propri nomi colonna (`config_json`, `from_node_id`/`to_node_id`, `status` su flows). Il file uploadato aspetta nomi diversi (`config`, `source_node_id`/`target_node_id`, `is_active`). Il codice esistente e' coerente con il DB attuale — questo non e' un bug, ma la spec uploadata descrive un sistema leggermente diverso.

### 3. La funzione `trigger_internal_automations` cerca `status = 'published'` ma il flow viene creato con `status = 'draft'`
Quando si crea un flow e lo si attiva, il codice UI usa `useUpdateInternalFlow` per cambiare il `status`. Ma la funzione DB cerca `f.status = 'published'`. Bisogna verificare che il toggle nell'UI imposti effettivamente `status = 'published'`.

### 4. L'Edge Function usa colonne inesistenti
L'edge function `process-internal-automation` attuale riferisce `node_type` e `config_json` correttamente. Ma la spec uploadata usa `node_subtype` e `config` — colonne che non esistono nel DB attuale. L'edge function attuale e' allineata al DB, ma mancano le colonne `node_subtype` nella tabella nodes.

### 5. Nessun `node_subtype` nel DB nodes
La tabella `internal_automation_nodes` non ha la colonna `node_subtype`. L'edge function e la UI usano `config_json.action_type` o `config_json.trigger_type` come workaround, ma la spec prevede un campo dedicato.

## Piano di Fix

### Fase 1 — Aggiungere i DB Triggers (critico)
Migrazione SQL per creare 10 trigger sulle tabelle:
- `orders`: INSERT (order_created), UPDATE status (order_status_changed), UPDATE payment_status (payment_received)
- `tickets`: INSERT (ticket_created), UPDATE status (ticket_status_changed)
- `tasks`: INSERT (task_created), UPDATE status=completed (task_completed)
- `employees`: INSERT (employee_added)
- `warehouse_items`: UPDATE quantity <= min_quantity (warehouse_low_stock)
- `company_costs`: INSERT (cost_added)

Ogni trigger chiama la funzione `trigger_internal_automations()` gia' esistente con gli argomenti corretti.

### Fase 2 — Fix toggle attivazione
Verificare e correggere il toggle ON/OFF nel UI per impostare `status = 'published'` (attivo) o `status = 'draft'` (disattivo), coerente con la query nella funzione trigger.

### Fase 3 — Migliorare il catalogo types
Allineare `src/types/internalAutomationBuilder.ts` con il catalogo completo della spec: aggiungere `configFields`, `availableVariables`, e le definizioni dettagliate di trigger/azioni con supporto per variabili `{{order.number}}`.

### Fase 4 — Aggiornare il NodePanel con config fields dinamici
Aggiornare `InternalNodePanel.tsx` per renderizzare form dinamici basati sui `configFields` del catalogo, con supporto per inserimento variabili.

### Fase 5 — Aggiornare l'Edge Function
Aggiornare `process-internal-automation/index.ts` per:
- Usare `config_json` (colonne attuali) correttamente
- Aggiungere le azioni mancanti: `send_email_to_customer`, `send_email_to_employee`, `assign_employee`, `add_cost_record`
- Supportare il pattern `advanceEnrollment` con branching condizionale

## File da modificare/creare

| File | Azione |
|------|--------|
| Migrazione SQL | **Nuovo** — 10 DB triggers sulle tabelle |
| `src/types/internalAutomationBuilder.ts` | Aggiornare con catalogo completo + configFields + variables |
| `src/components/internalAutomationBuilder/InternalNodePanel.tsx` | Aggiornare con form dinamici |
| `src/pages/azienda/InternalAutomations.tsx` | Fix toggle status published/draft |
| `supabase/functions/process-internal-automation/index.ts` | Aggiungere azioni mancanti |

