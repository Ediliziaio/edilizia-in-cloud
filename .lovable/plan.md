

## Piano: Fix UX Flow Builder — Salvataggio Manuale, "+" sui Nodi, Edge DB Fix

### Problemi identificati

**1. Edge caricate da DB senza "+" button**
`connectionsToEdges()` in `useFlowAdapter.ts` (riga 37) usa `type: "smoothstep"` — dovrebbe essere `"addStep"`. Inoltre non passa il callback `onAddStep`, quindi anche cambiando il tipo il "+" non funzionerebbe. Questo significa che riaprendo un flow salvato, tutti i "+" tra i nodi spariscono.

**2. Salvataggio automatico indesiderato**
C'è un auto-save ogni 5s in `FlowBuilderPage.tsx` (righe 497-508) e un altro ogni 2s in `useAutomationBuilder.ts` (riga 143). Il pulsante "Salva" appare solo quando `hasUnsavedChanges` è true. L'utente vuole un salvataggio manuale esplicito con validazione.

**3. Mancano "+" sui nodi trigger/azione per collegare nuovi step**
Nella UI GHL, ogni nodo ha un "+" sotto per aggiungere il passo successivo. Attualmente il "+" è solo sulle edge (AddStepEdge), ma quando le edge non hanno il tipo corretto (bug 1), non compare nulla.

**4. Console warning: EmailConfigPanel ref**
Warning non bloccante ma da risolvere.

---

### Fix pianificati

**File 1: `src/components/flow-builder/hooks/useFlowAdapter.ts`**
- `connectionsToEdges`: cambiare `type: "smoothstep"` → `type: "addStep"`
- Non si può passare `onAddStep` qui (funzione pura), quindi il callback verrà iniettato nel `useEffect` di `FlowBuilderPage.tsx` dopo il sync

**File 2: `src/components/flow-builder/FlowBuilderPage.tsx`**
- Dopo `setRfEdges(connectionsToEdges(...))`, aggiungere un secondo `setRfEdges` che inietta `data.onAddStep` su ogni edge
- Rimuovere il timer auto-save (righe 497-508)
- Il pulsante "Salva" deve essere sempre visibile (non solo con `hasUnsavedChanges`)

**File 3: `src/hooks/useAutomationBuilder.ts`**
- Rimuovere `triggerAutoSave()` da `addNode`, `updateNode`, `removeNode`, `addConnection`, `removeConnection` — solo `setHasUnsavedChanges(true)` per mostrare l'indicatore
- Mantenere `saveImmediate` per il salvataggio manuale

**File 4: `src/components/flow-builder/FlowBuilderHeader.tsx`**
- Il pulsante "Salva" sempre visibile (rimuovere il wrapper `{hasUnsavedChanges && ...}`)
- Mostrare un pallino o badge quando ci sono modifiche non salvate

**File 5: `src/components/flow-builder/nodes/TriggerNode.tsx`**
- Aggiungere Handle `type="target"` non visibile (per permettere connessioni da altri trigger in parallelo se serve)

**File 6: `src/components/flow-builder/config-panels/EmailConfigPanel.tsx`**
- Wrap con `forwardRef` per risolvere il warning console

---

### Risultato atteso

- Il pulsante "Salva" è sempre visibile con indicatore di modifiche pendenti
- Niente auto-save: l'utente decide quando salvare
- I "+" tra i nodi funzionano anche riaprendo un flow salvato
- UX fluida senza errori in console

