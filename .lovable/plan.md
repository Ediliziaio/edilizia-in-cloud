

## Audit Bug UX: Flow Builder - Trigger, Azioni, Filtri, Integrazioni

Dopo un'analisi approfondita di tutto il codice del flow builder, ecco i bug trovati, organizzati per gravita.

---

### BUG CRITICI (funzionalita rotta)

**1. DelayNode non mostra la durata configurata**
- `DelayNode.tsx` (riga 12-13) legge `cfg.durata` e `cfg.unita`
- Ma `DelayConfigPanel.tsx` scrive `delay_durata` e `delay_unita`
- Risultato: il nodo delay mostra sempre "Attesa" invece di "5 giorni"
- **Fix**: In `DelayNode.tsx`, leggere `cfg.delay_durata` e `cfg.delay_unita`

**2. ConditionNode non mostra la logica AND/OR configurata**
- `ConditionNode.tsx` (riga 8) legge `data.logica`
- Ma `ConditionConfigPanel.tsx` scrive `operatore_logico`
- Risultato: il badge mostra sempre "AND" anche se si seleziona "OR"
- **Fix**: In `ConditionNode.tsx`, leggere `data.operatore_logico`

**3. Inserimento Condition da edge "+" non crea i due rami Si/No**
- In `handleSelectItem` (riga 396-411), quando si inserisce una condition node tramite il "+" sull'edge, vengono create solo 2 edge generiche (source->condition, condition->target)
- Ma il ConditionNode ha DUE handle source: `id="yes"` e `id="no"`. Serve una edge per "Si" (sourceHandle: "yes") verso il target, e una per "No" che vada a un nodo End o resti aperta
- **Fix**: Quando `item.kind === "condition"`, creare edge con `sourceHandle: "yes"` verso il target, e aggiungere un nodo End separato collegato a `sourceHandle: "no"`

**4. Filtri trigger: TRIGGER_CATEGORY_MAP manca diverse categorie**
- Trigger con categoria `"magazzino"` (scorta_minima, prodotto_esaurito, carico_magazzino) non sono mappati
- Trigger HR (dipendente_creato, contratto_in_scadenza, ferie_richiesta) non sono mappati
- Trigger schedulati (cron_giornaliero, cron_settimanale, cron_mensile, manuale) non sono mappati
- Risultato: per questi trigger la sezione "Filtri" nel config panel NON appare
- **Fix**: Aggiungere le entry mancanti in `TRIGGER_CATEGORY_MAP` in `FlowBuilderConfigPanel.tsx`, e aggiungere i corrispondenti field definitions + case nel `getFieldsForCategory` in `automationBuilder.ts`

---

### BUG MEDI (UX degradata)

**5. TaskConfigPanel usa chiavi diverse dal catalogo**
- Il catalogo (`crea_task`) definisce `assegnato_a` ma il panel usa `assegna_a`
- La priority nel catalogo ha opzione `"media"` ma il panel ha `"normale"`
- **Fix**: Allineare le chiavi nel TaskConfigPanel a quelle del catalogo

**6. `user_select` e `entity_select` sono semplici Input di testo**
- `FlowBuilderConfigPanel.tsx` (righe 326-342) renderizza `user_select` e `entity_select` come semplici `<Input>` con placeholder "ID utente"
- L'utente deve inserire manualmente un UUID -- inutilizzabile
- **Fix**: Per `user_select`, usare un componente che carica `profiles` dal DB (come `UserSelect` gia presente in `ConditionValueInput.tsx`). Per `entity_select`, aggiungere un picker per agenti AI, pipeline stages, ecc. in base al contesto

**7. Il nodo "Fine" puo essere eliminato accidentalmente**
- Non c'e nessuna protezione contro l'eliminazione del nodo End tramite tasto Delete/Backspace
- Se l'utente lo cancella, il flow resta senza nodo terminale
- **Fix**: In `onNodesDelete`, filtrare i nodi di tipo `"end"` e impedirne la cancellazione

**8. Il pulsante "Salva configurazione" nel config panel chiude il pannello ma NON salva nel DB**
- `onClose` (riga 707) fa solo `setRightPanelOpen(false)` e `setSelectedNodeId(null)`
- Il salvataggio effettivo avviene solo con Ctrl+S o il bottone "Salva" nell'header
- L'utente crede di aver salvato quando preme "Salva configurazione"
- **Fix**: Il bottone dovrebbe chiamare `saveImmediate()` prima di `onClose()`, oppure rinominarlo in "Chiudi" e lasciare il salvataggio al bottone header

---

### BUG MINORI (polish)

**9. Edge caricate da DB non hanno il callback `onAddStep`**
- Il codice gia lo inietta (righe 90-93), ma manca il label per le edge Si/No delle condizioni
- Quando si ricarica un flow con condizioni, le edge dai rami Si/No perdono le label

**10. Drag & drop dal pannello catalogo non passa per `handleSelectItem`**
- `onDrop` chiama direttamente `addNodeFromItem` senza passare per la logica di edge-splitting
- Il nodo viene piazzato alla posizione del mouse senza integrarsi nel flusso

---

### Piano di Fix

| # | File | Modifica |
|---|------|----------|
| 1 | `DelayNode.tsx` | Leggere `delay_durata`/`delay_unita` invece di `durata`/`unita` |
| 2 | `ConditionNode.tsx` | Leggere `data.operatore_logico` invece di `data.logica` |
| 3 | `FlowBuilderPage.tsx` | Gestire inserimento condition: creare branch Si/No con handle dedicati |
| 4 | `FlowBuilderConfigPanel.tsx` + `automationBuilder.ts` | Aggiungere mapping categorie mancanti (magazzino, hr, schedulati) |
| 5 | `TaskConfigPanel.tsx` | Allineare chiavi (`assegnato_a`, rimuovere `normale`) |
| 6 | `FlowBuilderConfigPanel.tsx` | Sostituire Input con UserSelect per `user_select` |
| 7 | `FlowBuilderPage.tsx` | Proteggere nodo End da eliminazione |
| 8 | `FlowBuilderConfigPanel.tsx` | Far chiamare `saveImmediate` dal bottone Salva |

