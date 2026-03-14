

## Piano: Bottoni compatti + Conferma chiusura senza salvataggio + Condizioni/Logica nel catalogo

### 1. Bottoni Config Panel — Compatti su una riga

**Problema**: I bottoni "Salva configurazione" e "Elimina nodo" sono full-width e troppo invasivi (screenshot).

**Fix** in `FlowBuilderConfigPanel.tsx`:
- Metterli su una singola riga con `flex gap-2`
- "Salva" diventa `variant="default" size="sm"` compatto (non full-width)
- "Elimina" diventa `variant="outline" size="sm"` con solo icona + testo breve
- Entrambi con `flex-1` per dividersi lo spazio equamente

```text
Prima:   [████████ Salva configurazione ████████]
         [████████ Elimina nodo ████████████████]

Dopo:    [ ✓ Salva ]  [ 🗑 Elimina ]   ← stessa riga, compatti
```

### 2. Conferma chiusura pannello senza salvataggio

**Fix** in `FlowBuilderConfigPanel.tsx`:
- Quando l'utente clicca la X per chiudere il pannello, controllare se ci sono modifiche non salvate
- Se sì, mostrare un dialog di conferma: "Hai modifiche non salvate. Vuoi salvarle prima di chiudere?"
- Tre opzioni: "Salva e chiudi", "Chiudi senza salvare", "Annulla"

### 3. Aggiungere nodi di controllo flusso nella tab "Condizioni"

**Problema**: L'utente nella tab "Condizioni" vede solo SE e SE multiplo. Mancano i nodi di controllo flusso tipici dei builder (Delay, Drip/Sequenza, Goal, A/B Split, Vai a).

**Fix** in `flow-node-catalog.ts` — Aggiungere al `CONDITION_CATALOG`:

| ID | Label | Tipo nodo | Descrizione |
|----|-------|-----------|-------------|
| `attendi` | Attendi (Delay) | delay | Già esiste in ACTION_CATALOG ma va aggiunto anche nella tab Condizioni |
| `goal` | Obiettivo (Goal) | goal | Termina il ramo se una condizione viene raggiunta (es: "ha comprato") |
| `split_ab` | Split A/B | split | Divide il traffico in 2+ rami con percentuali configurabili |
| `vai_a` | Vai a (Go To) | action | Salta a un altro punto del flow |
| `drip_sequenza` | Sequenza Drip | action | Invia messaggi a intervalli programmati |

**Implementazione**:

a) **`flow-node-catalog.ts`**: Aggiungere `goal`, `split_ab`, `vai_a`, `drip_sequenza` al `CONDITION_CATALOG` con configSchema appropriati

b) **`ActionCatalogList.tsx`**: Il delay (`attendi`) è già nelle azioni sotto "Generale" — va aggiunto anche nella sezione "Logica & Flusso" quando `includeConditions=true`, insieme ai nuovi elementi

c) **`flow-node-catalog.ts` → `actionKind`**: Aggiornare per mappare i nuovi ID ai kind corretti (`goal`, `split`)

d) **Nodi ReactFlow**: Creare `GoalNode.tsx` e `SplitNode.tsx` per i nuovi tipi, registrarli in `nodes/index.ts`

e) **`FlowBuilderPage.tsx`**: Gestire l'inserimento di `split_ab` creando N rami (come per condition)

### File da modificare

| File | Modifica |
|------|----------|
| `FlowBuilderConfigPanel.tsx` | Bottoni compatti su una riga + conferma chiusura |
| `flow-node-catalog.ts` | Aggiungere goal, split_ab, vai_a, drip_sequenza al CONDITION_CATALOG + aggiornare actionKind |
| `ActionCatalogList.tsx` | Includere attendi nella sezione Logica quando includeConditions=true |
| `nodes/GoalNode.tsx` | Nuovo nodo Goal (simile a ConditionNode ma con icona Target) |
| `nodes/SplitNode.tsx` | Nuovo nodo Split A/B (2+ handle output) |
| `nodes/index.ts` | Registrare i nuovi node types |
| `FlowBuilderPage.tsx` | Gestire inserimento split_ab con rami multipli |

