

## FLOW-04 — Piano di Implementazione: Execution Engine

### Problema critico: il spec FLOW-04 assume prerequisiti inesistenti

Il documento assume tabelle `flows` (con JSONB `nodi`/`edges`) e `flow_executions` che **non esistono**. Il progetto usa:

- `automation_flows` (relazionale, con `status`, `config_json`, `version`)
- `automation_nodes` (separati, con `node_type`, `config_json`, `position_x/y`)
- `automation_connections` (`from_node_id`, `to_node_id`, `label`)
- `automation_execution_log`, `automation_queue`, `automation_enrollments`

Inoltre esiste già un **engine di esecuzione maturo** in `process-automation/index.ts` (1435 righe) con:
- Enrollment engine con re-enrollment
- Queue processing con retry
- Branching condizionale
- Delay scheduling
- Azioni: email, WhatsApp, SMS, notifiche, CRM, tags, webhook, AI
- Trigger events da DB triggers

E un secondo engine in `process-internal-automation/index.ts` (395 righe) per automazioni operative.

### Raccomandazione

**NON creare un terzo engine (`flow-engine`)** — sarebbe la terza duplicazione. Invece, il nuovo Visual Flow Builder (FLOW-03) **già salva nello stesso formato** (`automation_nodes`/`automation_connections`) grazie a `useFlowAdapter.ts`. Quindi il `process-automation` engine esistente è già compatibile.

### Cosa serve realmente

1. **Creare `flow_executions`** come view/aggregazione per la UI — oppure usare `automation_execution_log` esistente
2. **Aggiungere le azioni mancanti** nel `process-automation` engine (quelle richieste nel spec che non esistono ancora)
3. **Migliorare il logging** con `steps_log` strutturato se necessario

### Piano concreto

**Step 1 — DB Migration**: Aggiungere una tabella `flow_execution_runs` per tracciare le esecuzioni complete di un flow (non solo i singoli nodi come fa `automation_execution_log`):
- `id`, `flow_id`, `company_id`, `enrollment_id`, `trigger_type`, `trigger_data JSONB`, `status` (running/completed/error), `started_at`, `ended_at`, `steps_log JSONB`, `error_message`
- RLS: scoped per `company_id`

**Step 2 — Estendere `process-automation`**: Aggiungere il tracking delle run complete, wrappando l'esecuzione di ogni enrollment in una riga `flow_execution_runs` con `steps_log` aggregato.

**Step 3 — Aggiungere azioni mancanti** nel `process-automation` engine:
- `aggiorna_campo` (update generico)
- `crea_opportunita`
- `assegna_agente`
- Le azioni esistenti coprono già: email, WhatsApp, crea_task, notifica, webhook, delay, condizioni

**Step 4 — UI: mostrare execution runs** nel FlowBuilderHeader e nella lista flow, usando la nuova tabella `flow_execution_runs`.

### Cosa NON fare
- Non creare `flow-engine` edge function (duplicherebbe `process-automation`)
- Non creare tabella `flows` (esiste `automation_flows`)
- Non toccare `process-internal-automation` (dominio diverso)
- Non configurare DB webhooks aggiuntivi (i DB triggers PL/pgSQL esistenti già alimentano `automation_trigger_events` che `process-automation` consuma)

### File da modificare/creare

```text
MIGRATION:
  - Nuova tabella flow_execution_runs

MODIFICATI:
  supabase/functions/process-automation/index.ts
    → wrappare processQueue con tracking run
    → aggiungere azioni mancanti

NUOVI:
  src/hooks/useFlowExecutions.ts          ← query flow_execution_runs
  
MODIFICATI:
  src/components/flow-builder/FlowBuilderHeader.tsx  ← badge ultima esecuzione
```

