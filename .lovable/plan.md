

## Piano: Layout Rigido con Spaziatura Definita + Auto-connessione Trigger Paralleli

### Problemi
1. **Nodi troppo compatti**: Il trigger, l'azione e il nodo Fine sono troppo vicini (solo 120px di distanza verticale tra placeholder a y=100, fine a y=300). Manca aria tra i nodi.
2. **Trigger parallelo non si collega**: Quando si clicca "+" a destra del trigger, il nuovo trigger si collega al target del primo trigger (che potrebbe essere il nodo Fine), ma NON all'azione intermedia. Il codice attuale (riga 291-293) cerca `firstActionEdge?.target` che punta correttamente alla prima azione, ma il problema è che il nuovo trigger viene posizionato alla stessa Y del primo trigger e la connessione funziona — il vero issue è che l'utente vuole che il nuovo trigger si colleghi automaticamente alla PRIMA AZIONE sotto il trigger 1 (non al nodo Fine se non ci sono azioni).

### Modifiche

**File 1: `FlowBuilderPage.tsx`**

a) **Aumentare spaziatura iniziale** — Placeholder trigger e End node:
- Trigger placeholder: `y: 80` 
- End node: `y: 500` (era 300)
- Edge dashed tra i due con più spazio

b) **Aumentare shift verticale** per inserimento nodi da edge:
- Da `120px` a `160px` (riga 378) per dare più aria

c) **Fix connessione trigger parallelo** (righe 276-324):
- Il codice attuale cerca `firstActionEdge?.target` che è corretto: trova il primo nodo action collegato al trigger 1
- Verificare che funzioni anche con catene multiple (trigger → action → action → end)
- Il trigger parallelo deve connettersi allo STESSO target del primo trigger (la prima azione)

d) **Posizionamento nodi action** più distanziato:
- Quando si inserisce un nodo da edge (riga 385), usare `midY` calcolato dal punto medio ma con minimo 160px di distanza

**File 2: `TriggerNode.tsx`**
- Aumentare `min-w` da `220px` a `260px` per nodi più larghi
- Aumentare padding interno (`px-4 py-3` nel body invece di `px-3 py-2`)
- Header più ariosa (`px-4 py-2.5`)

**File 3: `ActionNode.tsx`**
- Stesse migliorie di dimensione: `min-w-[260px] max-w-[300px]`
- Padding interno più generoso (`px-4 py-3.5` invece di `px-3 py-2.5`)

**File 4: `EndNode.tsx`**
- Padding più generoso (`px-5 py-2.5`)

**File 5: `AddStepEdge.tsx`**
- Bottone "+" leggermente più grande (`h-7 w-7` invece di `h-6 w-6`)

### Risultato
- Layout con ~160px tra ogni livello di nodi
- Nodi più larghi e ariosi
- Trigger parallelo si connette correttamente alla prima azione sotto il trigger originale

