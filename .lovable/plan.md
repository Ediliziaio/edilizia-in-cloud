

# Analisi Completa — Automazioni Interne

## Stato Attuale

Ho verificato database, UI, Edge Function e hook. Ecco tutti i problemi trovati, divisi per gravità.

---

## BUG CRITICO: Trigger DB non attaccati alle tabelle

Le funzioni PostgreSQL esistono (`trigger_internal_automations`, `trigger_internal_auto_order_status`, ecc.) ma **nessun trigger è collegato alle tabelle reali**. La query `information_schema.triggers WHERE trigger_name LIKE 'internal_auto%'` ritorna **zero righe**.

Questo significa che creare un ordine, un ticket o modificare uno stato NON attiva nessuna automazione, anche se il flusso è "Pubblicato".

Il cron job `process-internal-automation-queue` è attivo e funziona ogni minuto, ma la coda è sempre vuota perché nessun trigger la popola.

**Fix**: SQL migration per creare i 9 trigger mancanti:

| Trigger | Tabella | Evento | Funzione |
|---------|---------|--------|----------|
| `internal_auto_order_created` | `orders` | AFTER INSERT | `trigger_internal_automations('order_created','order')` |
| `internal_auto_order_status` | `orders` | AFTER UPDATE | `trigger_internal_auto_order_status()` |
| `internal_auto_ticket_created` | `tickets` | AFTER INSERT | `trigger_internal_automations('ticket_created','ticket')` |
| `internal_auto_ticket_status` | `tickets` | AFTER UPDATE | `trigger_internal_auto_ticket_events()` |
| `internal_auto_task_created` | `tasks` | AFTER INSERT | `trigger_internal_automations('task_created','task')` |
| `internal_auto_task_completed` | `tasks` | AFTER UPDATE | `trigger_internal_auto_task_events()` |
| `internal_auto_employee_added` | `employees` | AFTER INSERT | `trigger_internal_automations('employee_added','employee')` |
| `internal_auto_warehouse_low` | `warehouse_stock` | AFTER UPDATE | `trigger_internal_auto_stock_events()` |
| `internal_auto_cost_added` | `company_costs` | AFTER INSERT | `trigger_internal_automations('cost_added','cost')` |

---

## BUG UI: useState usato come effetto (riga 233)

```ts
useState(() => {
  if (dbNodes) setLocalNodes(dbNodes);
  ...
});
```

`useState` con inizializzatore viene eseguito **solo al primo render**. A quel punto `dbNodes` è `undefined` (la query non ha ancora caricato). I dati vengono poi sincronizzati da `useMemo` (righe 239-247), ma `useMemo` non è pensato per side-effect — dovrebbe usare `useEffect`.

**Fix**: Rimuovere il `useState` callback (righe 233-237) e convertire i 3 `useMemo` in `useEffect`.

---

## BUG UI: Log Drawer renderizzato come Sheet ma usato inline

Nel tab "log" (riga 508-516), `InternalAutomationLogDrawer` è renderizzato come componente inline (`open={true}`), ma il componente usa internamente `<Sheet>` che è un overlay modale. Questo crea un conflitto: il log appare come drawer sovrapposto, non come contenuto del tab.

**Fix**: Creare un componente `InternalAutomationLogInline` che renderizza direttamente la lista dei log senza il wrapper `<Sheet>`, da usare nel tab "log".

---

## BUG UI: Branching connection non gestito nel salvataggio

Quando l'utente clicca "+" su un nodo condition (ramo Sì/No), `handleAddAfterNode` viene chiamato con `branch`, ma `handleSelectAction` non utilizza `branch` per impostare il `label` della connessione. Tutte le connessioni vengono create con `label: null`, quindi il motore di esecuzione non riesce a seguire i rami corretti (cerca `label === "true"` o `"false"`).

**Fix**: Salvare `addAfterBranch` nello state e usarlo come `label` della nuova connessione in `handleSelectAction`.

---

## WARN: Console warnings per ref su FlowListView

I warning `Function components cannot be given refs` derivano da `AlertDialog` che cerca di passare un ref a un componente funzione. Non bloccante ma visivamente spammoso.

---

## Piano di Fix

### 1. SQL Migration — Creare i 9 trigger DB mancanti
Ogni trigger con `CREATE TRIGGER IF NOT EXISTS` + `FOR EACH ROW`.

### 2. Fix FlowBuilderView state management
- Rimuovere `useState(() => {...})` (riga 233-237)
- Convertire i 3 `useMemo` side-effect in `useEffect`

### 3. Fix branching connection label
- Aggiungere `addAfterBranch` state
- In `handleAddAfterNode`: settare sia `addAfterNodeId` che `addAfterBranch`
- In `handleSelectAction`: usare `addAfterBranch` come `label` nella nuova connessione

### 4. Fix Log tab inline rendering
- Estrarre il contenuto di `InternalAutomationLogDrawer` in un componente riusabile
- Renderizzare direttamente nel tab senza `<Sheet>`

### File modificati

| File | Modifica |
|------|----------|
| SQL migration | Creare 9 trigger DB |
| `src/pages/azienda/InternalAutomations.tsx` | Fix useState/useMemo, fix branching label, fix log tab |
| `src/components/internalAutomationBuilder/InternalAutomationLogDrawer.tsx` | Estrarre contenuto in componente inline |

