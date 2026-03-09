

# Analisi Automazioni — Risultati

## Stato Attuale

### ✅ Funzionante
| Componente | Stato |
|------------|-------|
| **11 trigger DB** (ia_*) | Tutti attaccati alle tabelle (verificato via `pg_trigger`) |
| **INSERT triggers** (order_created, ticket_created, task_created, employee_added, cost_created, appointment_created) | Usano `trigger_internal_automations` → inserimento diretto in enrollments + queue → **OK** |
| **Stock trigger** (ia_warehouse_stock) | Usa `trigger_internal_auto_stock_events` con pattern corretto → **OK** |
| **Edge Function** `process-internal-automation` | Logica corretta: azioni, condizioni con branch true/false, delay, interpolazione variabili, retry |
| **UI Builder** | Save, load, canvas, nodi, connessioni, branching label → **OK** |
| **Cron job** | Invoca la funzione ogni minuto → **OK** |

### ❌ BUG CRITICO: 4 funzioni UPDATE inseriscono in tabella inesistente

Le funzioni seguenti fanno `INSERT INTO internal_automation_trigger_events` — ma questa tabella **non esiste**:

- `trigger_internal_auto_order_status()` → crash su UPDATE di qualsiasi ordine
- `trigger_internal_auto_ticket_events()` → crash su UPDATE di qualsiasi ticket
- `trigger_internal_auto_task_events()` → crash su UPDATE di qualsiasi task
- `trigger_internal_auto_appointment_events()` → crash su UPDATE di qualsiasi appuntamento

Questo significa che **order_updated, order_status_changed, order_completed, ticket_updated, ticket_status_changed, ticket_assigned, task_updated, task_completed, appointment_updated** non funzionano mai. Peggio ancora, l'errore del trigger potrebbe far fallire silenziosamente le operazioni di UPDATE sulle tabelle stesse.

La funzione `trigger_internal_auto_stock_events()` usa il pattern corretto (inserimento diretto in enrollments + queue), quindi funziona.

## Fix

### SQL Migration — Riscrivere le 4 funzioni con pattern diretto

Riscrivere `trigger_internal_auto_order_status`, `trigger_internal_auto_ticket_events`, `trigger_internal_auto_task_events`, e `trigger_internal_auto_appointment_events` per usare lo stesso pattern di `trigger_internal_auto_stock_events`:

- Per ogni evento emesso, cercare i flow pubblicati con `trigger_type` corrispondente
- Creare enrollment + queue item direttamente
- Nessun riferimento a `internal_automation_trigger_events`

I trigger non cambiano (sono già attaccati), solo il corpo delle funzioni viene aggiornato con `CREATE OR REPLACE FUNCTION`.

### File modificati

| File | Modifica |
|------|----------|
| SQL migration | `CREATE OR REPLACE FUNCTION` per le 4 funzioni rotte |

