

## Analisi Completa: Bug Critici del Flow Builder

Ho analizzato in profondita tutto il codice, i log di rete, la console e il database. Ecco tutti i problemi trovati e le soluzioni.

---

### Bug 1 (CRITICO): `effectiveCompany` e `null` per super_admin su `/azienda`

**Causa**: L'utente e super_admin con `company_id: null` nel profilo. Su `/azienda` (a differenza di `/admin` che usa `PlatformCompanyProvider`), `effectiveCompany` rimane `null`. Il guard in `addNodeFromItem` blocca silenziosamente tutto:
```
if (!flowId || !effectiveCompany || !user) → return
```

**Fix**: Aggiungere un blocco all'inizio del render di `FlowBuilderPage` che mostra un avviso "Seleziona un'azienda" quando `effectiveCompany` e `null` e l'utente non e in fase di creazione del flow.

---

### Bug 2 (CRITICO): Click sul placeholder trigger apre il config panel

**Causa**: Quando clicchi il nodo trigger vuoto:
1. `TriggerNode.onClick` chiama `data.onOpenCatalog()` → imposta `rightPanelMode("catalog")`
2. Subito dopo, ReactFlow chiama `onNodeClick` → sovrascrive con `rightPanelMode("config")`

Il config panel vince sempre e mostra "Etichetta nodo" + "Elimina nodo".

**Fix**: In `onNodeClick`, rilevare se il nodo cliccato e il placeholder trigger vuoto (`data.isEmpty === true`) e in quel caso aprire il catalogo trigger invece del config panel.

---

### Bug 3: Manca il pulsante "+" tra i nodi (AddStepEdge)

**Causa**: Le edge create nel placeholder e in `addNodeFromItem` usano `type: "smoothstep"`. Il tipo `"addStep"` (che mostra il "+" cliccabile) esiste gia nel codice (`AddStepEdge.tsx`) ma non viene mai assegnato alle edge. Inoltre, il callback `onAddStep` non viene mai passato nel `data` delle edge.

**Fix**:
- Cambiare il tipo delle edge da `"smoothstep"` a `"addStep"`
- Passare `data: { onAddStep: (edgeId) => openCatalog("action") }` in tutte le edge create
- Questo fa apparire il "+" tra ogni nodo, come in GHL

---

### Bug 4: Tab catalogo non filtrate (Trigger vs Azioni)

**Causa attuale**: Il pannello catalogo mostra sempre tutte e 3 le tab (Trigger, Azioni, Condizioni) indipendentemente dal contesto.

**Fix**: 
- Quando aperto dal trigger placeholder o dal pulsante "+ Trigger": mostrare SOLO la tab Trigger, nascondere Azioni/Condizioni
- Quando aperto dal "+" sulle edge o dal pulsante "+ Azione": mostrare SOLO Azioni + Condizioni, nascondere Trigger

---

### Modifiche per File

| File | Cosa |
|------|------|
| `FlowBuilderPage.tsx` | 1) Guard `effectiveCompany` con UI avviso; 2) Fix `onNodeClick` per placeholder; 3) Edge tipo `addStep` + `onAddStep`; 4) `openCatalog` con filtro contesto |
| `WorkflowRightPanel.tsx` | Nascondere tab non pertinenti: solo Trigger se contesto trigger, solo Azioni+Condizioni se contesto azione |
| `AddStepEdge.tsx` | Gia funzionante, nessuna modifica necessaria |

### Flusso Risultante

```text
[Aggiungi trigger] ← click → apre catalogo SOLO trigger
       |
      [+]  ← click → apre catalogo SOLO azioni+condizioni  
       |
     [Fine]
```

Dopo aver selezionato un trigger, il nodo placeholder viene sostituito. Ogni "+" tra nodi apre solo il catalogo azioni+condizioni. Il pulsante "+" sopra il canvas si comporta allo stesso modo: "+ Trigger" mostra solo trigger, "+ Azione" mostra solo azioni+condizioni.

