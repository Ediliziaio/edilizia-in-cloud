

# Analisi Completa — Automazioni Interne: Tutti i Problemi

## CRITICO: Trigger DB ancora non attaccati alle tabelle

Tutte e 3 le migrazioni hanno tentato di creare trigger sulle stesse tabelle con nomi diversi (`trg_internal_auto_*`, `internal_auto_*`). Le migrazioni successive hanno fallito per conflitti di nomi. La query `information_schema.triggers` conferma **zero trigger attivi**.

La coda `internal_automation_queue` ha **0 righe** — nessuna automazione si è mai attivata.

**Fix**: Nuova migrazione che:
1. Fa `DROP TRIGGER IF EXISTS` di tutti i nomi usati nelle 3 migrazioni precedenti (sia `trg_internal_auto_*` che `internal_auto_*`)
2. Ricrea i trigger con nomi univoci definitivi

## BUG: Mismatch `cost_created` vs `cost_added`

- Il **catalogo UI** definisce il trigger come `cost_created` (riga 221 di `internalAutomationBuilder.ts`)
- La **migrazione più recente** (20260309142218) passa `'cost_added'` alla funzione trigger
- Risultato: un flusso con trigger `cost_created` non verrebbe mai attivato

**Fix**: Allineare a `cost_created` (come nel catalogo UI) nella nuova migrazione.

## BUG: Trigger `employee_added` in catalogo ma le migrazioni miste

- La prima migrazione non ha un trigger dedicato per `employee_added` con la funzione giusta
- La terza migrazione usa `trigger_internal_automations('employee_added', 'employee')` — corretto ma non è stato applicato

**Fix**: Incluso nella migrazione correttiva.

## BUG: Mancano trigger per `appointment_created` / `appointment_updated`

Il catalogo UI definisce trigger per calendario (`appointment_created`, `appointment_updated`, `appointment_reminder`) ma nessuna migrazione recente li include.

**Fix**: Aggiungere trigger sulla tabella `appointments` per `INSERT` e `UPDATE`.

## BUG: Mancano trigger per `order_completed` e `order_overdue`

Il catalogo UI li definisce ma non esistono handler dedicati. La funzione `trigger_internal_auto_order_status()` gestisce solo `order_status_changed` e `order_updated`, non `order_completed`.

**Fix**: Aggiornare `trigger_internal_auto_order_status()` per controllare se il nuovo stato corrisponde a "completato" e aggiungere il trigger type `order_completed`.

## BUG: Mancano handler per `ticket_assigned`, `ticket_updated`

La funzione `trigger_internal_auto_ticket_events()` esiste ma le sue logiche interne non sono visibili — probabilmente non gestisce `ticket_assigned` come trigger separato.

**Fix**: Verificare e aggiornare la funzione.

## BUG: `task_overdue`, `cost_due`, `appointment_reminder` — trigger temporali non implementati

Questi sono trigger **temporali** (non basati su INSERT/UPDATE) e richiederebbero un cron job dedicato per controllare scadenze. Attualmente non c'è nessun cron job che li gestisce.

**Fix**: Documentare come "non ancora implementati" o creare un cron job dedicato. Per ora, rimuoverli dal catalogo o segnalarli come "Prossimamente".

## Stato componenti UI

| Componente | Stato |
|------------|-------|
| Canvas (dot grid, zoom, pan, drag) | ✅ Funzionante |
| Nodi (handle, hover actions, branching) | ✅ Funzionante |
| Connessioni (colori branch, label) | ✅ Funzionante |
| Side panel trigger/action | ✅ Funzionante |
| Node panel (config, variabili) | ✅ Funzionante |
| Branching connection label | ✅ Fixato (usa `addAfterBranch`) |
| Log inline tab | ✅ Fixato |
| Keyboard shortcuts | ✅ Funzionante (Ctrl+S, Delete) |
| Salvataggio/caricamento | ✅ Funzionante |

## Piano di Fix

### 1. SQL Migration — Drop e ricrea tutti i trigger
```
DROP TRIGGER IF EXISTS trg_internal_auto_* (6 nomi dalla migrazione 1)
DROP TRIGGER IF EXISTS internal_auto_* (9 nomi dalla migrazione 2 e 3)
CREATE TRIGGER definitivi con nomi univoci
```

Trigger da creare:
- `orders` INSERT → `order_created`
- `orders` UPDATE → funzione order_status (gestisce `order_status_changed`, `order_updated`, `order_completed`)  
- `tickets` INSERT → `ticket_created`
- `tickets` UPDATE → funzione ticket_events (gestisce `ticket_status_changed`, `ticket_assigned`, `ticket_updated`)
- `tasks` INSERT → `task_created`
- `tasks` UPDATE → funzione task_events (gestisce `task_completed`, `task_updated`)
- `employees` INSERT → `employee_added`
- `warehouse_stock` UPDATE → funzione stock_events
- `company_costs` INSERT → `cost_created` (non `cost_added`)
- `appointments` INSERT → `appointment_created`
- `appointments` UPDATE → `appointment_updated`

### 2. Fix funzione `trigger_internal_auto_order_status` — aggiungere `order_completed`

### 3. Fix funzione `trigger_internal_auto_ticket_events` — verificare/aggiungere `ticket_assigned` e `ticket_updated`

### 4. Marcare trigger temporali come non disponibili nel catalogo UI
Aggiungere `disabled: true` o rimuovere `order_overdue`, `task_overdue`, `cost_due`, `appointment_reminder` dal catalogo finché non implementati.

### File modificati

| File | Modifica |
|------|----------|
| SQL migration | Drop + ricrea tutti i trigger, fix funzioni |
| `src/types/internalAutomationBuilder.ts` | Rimuovere/disabilitare trigger temporali non implementati |

