

## Analisi Bug e Piano Fix

### Bug identificati

**Bug 1 (CRASH): `<Select.Item>` con value vuoto**
Nel catalogo ci sono ~40 opzioni `select` con `{ value: '', label: '...' }`. Radix UI Select non accetta `value=""` su `SelectItem`. Quando il config panel mostra questi campi, l'app crasha.

**Bug 2: Trigger multipli posizionati a caso**
Quando si aggiunge un secondo trigger (dopo aver gia popolato il primo), il codice cade nel ramo generico (linea 240) che usa `Math.random() * 100` per la posizione. I trigger dovrebbero essere allineati orizzontalmente nella stessa riga, come in GHL.

**Bug 3: Azioni aggiunte senza connessione automatica**
Quando si clicca il "+" su un edge per aggiungere un'azione, il catalogo si apre ma `handleSelectItem` aggiunge il nodo in posizione casuale senza inserirlo nella catena (non crea edge verso/dal nuovo nodo e non spezza l'edge esistente). In GHL, il "+" inserisce il nodo tra i due nodi collegati.

---

### Piano Fix

**1. Fix crash Select.Item (FlowBuilderConfigPanel.tsx)**
Nel componente `ConfigField`, filtrare le opzioni con `value === ''` e usarle come placeholder del `Select` invece che come `SelectItem`:
```
// Prima del map delle options, separare il "vuoto"
const emptyOpt = field.options?.find(o => o.value === '');
const validOpts = field.options?.filter(o => o.value !== '') ?? [];
// Usare emptyOpt.label come placeholder del SelectValue
// Mappare solo validOpts in SelectItem
// Gestire il clear con un valore sentinel tipo "__none__" → onChange("")
```

**2. Fix posizionamento trigger (FlowBuilderPage.tsx → addNodeFromItem)**
Quando `item.kind === "trigger"` e non c'e un placeholder da sostituire:
- Trovare tutti i trigger esistenti nel canvas
- Posizionare il nuovo trigger nella stessa riga Y del primo trigger, spostato a destra di ~280px per ogni trigger gia presente
- Collegare il nuovo trigger con un edge verso il merge point (il nodo "Fine" o il primo nodo azione)

**3. Fix inserimento azione da "+" edge (FlowBuilderPage.tsx)**
Attualmente `openCatalog("action")` apre il catalogo ma non passa l'informazione di *quale* edge e stata cliccata. Serve:
- Salvare in uno state `pendingInsertEdgeId` l'ID dell'edge cliccata
- In `handleSelectItem`, se `pendingInsertEdgeId` e valorizzato:
  - Trovare l'edge (source → target)
  - Rimuoverla
  - Creare il nuovo nodo posizionato a meta tra source e target
  - Creare due nuove edge: source → nuovo nodo, nuovo nodo → target
  - Spostare il nodo target (e tutti quelli sotto) di ~120px verso il basso
- Resettare `pendingInsertEdgeId`

---

### File da modificare

| File | Cambiamento |
|------|-------------|
| `FlowBuilderConfigPanel.tsx` | Fix `ConfigField` per gestire opzioni con `value: ''` senza crash |
| `FlowBuilderPage.tsx` | 1) Stato `pendingInsertEdgeId` per inserimento da edge "+"; 2) Logica posizionamento trigger orizzontale; 3) Logica inserimento nodo nella catena quando si clicca "+" |

