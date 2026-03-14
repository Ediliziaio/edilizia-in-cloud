

## Piano: "+" su Trigger + Auto-apertura Config + Bug Fix

### Bug identificati

**1. Manca il "+" a destra del trigger per aggiungere trigger paralleli**
Il `TriggerNode` ha solo l'handle source in basso. Serve un pulsante "+" visibile a destra del nodo (come GHL) che apre il catalogo trigger per aggiungere un altro trigger collegato alla stessa azione sottostante.

**2. Doppio click necessario per aprire la configurazione dopo inserimento**
Quando si seleziona un item dal catalogo (trigger o azione), `handleSelectItem` e `addNodeFromItem` aggiungono il nodo e chiudono il catalogo, ma NON aprono automaticamente il pannello config per quel nodo. L'utente deve poi cliccare di nuovo sul nodo. Fix: dopo l'inserimento, impostare `selectedNodeId` sul nuovo nodo e switchare il pannello a `mode: "config"`.

**3. Dopo inserimento da edge ("+"), il pannello non si apre**
Stesso problema del bug 2 ma nel ramo `pendingInsertEdgeId` di `handleSelectItem` (riga 347-421). Dopo l'inserimento nell'edge, il nodo non viene selezionato e il config panel non si apre.

---

### Fix pianificati

**File 1: `src/components/flow-builder/nodes/TriggerNode.tsx`**
- Aggiungere un pulsante "+" posizionato a destra del nodo trigger (populated state)
- Il click chiama `data.onAddTrigger?.()` (callback iniettato dal parent)
- Stile: cerchio piccolo con `Plus` icon, posizionato con `absolute right-[-28px] top-1/2`

**File 2: `src/components/flow-builder/FlowBuilderPage.tsx`**
Tre fix:

a) **Iniettare `onAddTrigger` callback nei nodi trigger** (sia nel sync da DB riga 79-84, sia in `addNodeFromItem` riga 280):
```
onAddTrigger: () => openCatalog("trigger")
```

b) **Auto-apertura config dopo inserimento trigger** (in `addNodeFromItem`, dopo il `return` delle righe 264 e 314):
```
// Dopo aver aggiunto il nodo, aprire config
setSelectedNodeId(newNodeId);
setRightPanelMode("config");
// rightPanelOpen è già true dal catalogo
```

c) **Auto-apertura config dopo inserimento azione da edge** (in `handleSelectItem`, dopo riga 416 prima del `return`):
```
setSelectedNodeId(newNodeId);
setRightPanelMode("config");
```

d) **Auto-apertura config dopo inserimento azione generica** (in `addNodeFromItem`, dopo riga 339 alla fine della funzione, per nodi non-trigger non-note):
```
if (item.kind !== "note") {
  setSelectedNodeId(newNodeId);
  setRightPanelOpen(true);
  setRightPanelMode("config");
}
```

---

### File da modificare

| File | Cosa |
|------|------|
| `TriggerNode.tsx` | Aggiungere pulsante "+" a destra per trigger paralleli |
| `FlowBuilderPage.tsx` | Iniettare `onAddTrigger`, auto-open config dopo ogni inserimento |

