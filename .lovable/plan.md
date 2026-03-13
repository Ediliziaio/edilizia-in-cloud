

## FLOW-05 — Bug Fix e Ottimizzazione: Piano

### Analisi completata

Ho esaminato in dettaglio: FlowBuilderPage, useAutomationBuilder, useFlowAdapter, tutti i nodi custom, il catalogo, la sidebar, il config panel, le policy RLS, gli indici DB, le subscription realtime, e il process-automation edge function.

### Bug reali trovati

**BUG-1: Delete via keyboard non sincronizza con il builder**
ReactFlow `deleteKeyCode` è configurato, ma `onNodesDelete`/`onEdgesDelete` non sono gestiti. Quando l'utente preme Delete/Backspace, ReactFlow rimuove il nodo/edge dallo stato visuale (`rfNodes`/`rfEdges`) ma il builder state (`useAutomationBuilder`) non viene aggiornato — i nodi eliminati ricompaiono al prossimo salvataggio.

**BUG-2: Connessioni invalide accettate**
`onConnect` non valida le connessioni: è possibile collegare un edge a un trigger (come target), collegare note come source/target, o creare self-loops.

**BUG-3: Config panel non si resetta al cambio nodo**
`FlowBuilderConfigPanel` usa `useMemo` per il catalogo con `selectedNode` come dep (non `selectedNode.id`), il che potrebbe non aggiornare correttamente quando si cambia nodo dello stesso tipo. I campi del form non hanno un reset esplicito.

**BUG-4: `flow_execution_runs` ha solo policy SELECT**
La tabella ha solo una policy `FOR SELECT`. Il `process-automation` edge function usa `service_role_key` per INSERT/UPDATE quindi funziona, ma mancano policy INSERT/UPDATE/DELETE per eventuale uso da frontend (non critico, ma incompleto).

**BUG-5: `syncToBuilder` è dichiarato ma mai chiamato**
La funzione `syncToBuilder` (riga 72-86) non è mai invocata — codice morto.

**BUG-6: Error state non gestito nel builder**
Se il caricamento del flow fallisce (errore di rete, flow non trovato), la pagina mostra solo il loader infinito. Non c'è gestione dell'errore.

### Ottimizzazioni

**OPT-1**: Indice composito mancante su `flow_execution_runs(flow_id, started_at DESC)` — la query in `useFlowExecutions` ordina per `started_at DESC` ma l'indice `idx_fer_flow_id` è solo su `flow_id`.

**OPT-2**: Rimuovere codice morto (`syncToBuilder`).

### Cose già corrette (nessun fix necessario)
- RLS abilitato su tutte le tabelle automation (verificato con query)
- Indici su `automation_flows`, `automation_nodes`, `automation_connections` presenti
- Tutte le subscription Realtime hanno cleanup `removeChannel` nel return di useEffect
- `useAutomationBuilder` ha cache invalidation corretta (invalida nodes, connections, e flows list)
- Auto-save e undo/redo funzionano correttamente
- Validazione pre-publish con `validateForPublish` presente

### Piano di fix

**File da modificare:**

1. **`src/components/flow-builder/FlowBuilderPage.tsx`**
   - Aggiungere `onNodesDelete` e `onEdgesDelete` per sincronizzare le rimozioni da tastiera con il builder
   - Aggiungere validazione in `onConnect` (no trigger come target, no note come source/target, no self-loop)
   - Rimuovere `syncToBuilder` (codice morto)
   - Aggiungere gestione errore (isError state)

2. **`src/components/flow-builder/FlowBuilderConfigPanel.tsx`**
   - Usare `selectedNode?.id` come key nel `useMemo` del catalogo per garantire il reset al cambio nodo

3. **DB Migration**
   - Sostituire indice `idx_fer_flow_id` con indice composito `(flow_id, started_at DESC)` per ottimizzare la query di `useFlowExecutions`

