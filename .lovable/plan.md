

# Piano di Fix - Builder Automazioni Marketing

## Problemi Identificati

Dopo analisi approfondita del codice e dello stato attuale, ecco i problemi residui:

### 1. Tipo `AutomationFlow` manca `config_json`
Il tipo locale in `automationBuilder.ts` (riga 1-13) non include `config_json`, presente invece nel DB e nei tipi generati. Questo causa l'uso di `as any` nel Builder (righe 498-503) per salvare le settings, rendendo il codice fragile e privo di type safety.

**Fix**: Aggiungere `config_json: Record<string, any> | null` al tipo `AutomationFlow`.

### 2. Settings tab salva con `as any` e non rilegge correttamente
In `AutomationBuilder.tsx` riga 498, `(flow as any)?.config_json?.settings` funziona solo perche il DB restituisce `config_json`, ma il tipo locale non lo prevede. Con il fix al tipo, tutto diventa type-safe.

**Fix**: Dopo aver aggiunto `config_json` al tipo, rimuovere i cast `as any` nel Builder.

### 3. Trigger picker e Action picker chiudono il pannello doppio
In `TriggerPickerDialog` riga 70, `onSelect` viene chiamato seguito da `onClose()`. Ma `onClose` nel Builder resetta anche `selectedNodeId`, causando potenzialmente la chiusura del pannello config prima che l'utente possa configurare il nodo appena aggiunto. Il flusso attuale: seleziona trigger → pannello si chiude → nodo aggiunto → nessun pannello config aperto automaticamente.

**Fix**: Dopo `handleTriggerSelect` e `handleActionSelect`, selezionare automaticamente il nodo appena creato e aprire il pannello config.

### 4. Nodo appena creato ha `company_id: ""` 
In `handleTriggerSelect` e `handleActionSelect` (righe 148, 186), `company_id` viene impostato a stringa vuota. L'upsert nel DB potrebbe fallire se c'è un foreign key constraint.

**Fix**: Usare `effectiveCompany?.id || ""` come `company_id` nei nuovi nodi.

### 5. Connessioni appena create hanno `company_id: ""`
Stesso problema per le connessioni (riga 199).

**Fix**: Usare `effectiveCompany?.id || ""`.

### 6. Canvas: onUpdateNode in dependency array di handleMouseMove
In `AutomationCanvas.tsx` riga 64, `onUpdateNode` è nella dependency array di `handleMouseMove` ma non viene usato in quel callback (viene usato solo in `handleMouseUp`). Causa ricreazioni inutili del callback.

**Fix**: Rimuovere `onUpdateNode` dalla dependency array di `handleMouseMove`.

### 7. Doppio click sul + del nodo branching apre action picker senza chiudere il trigger picker
Se il trigger picker è aperto e si clicca + su un nodo, `onAddAfter` chiama `openActionPicker` ma il trigger picker rimane aperto perche `rightPanel` passa da "trigger" a "action" senza problemi - questo funziona correttamente.

## Riepilogo Modifiche

| File | Modifica |
|------|----------|
| `src/types/automationBuilder.ts` | Aggiungere `config_json` al tipo `AutomationFlow` |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Rimuovere cast `as any`, usare `effectiveCompany.id` per company_id, auto-selezionare nodo dopo creazione |
| `src/components/marketing/automations/AutomationCanvas.tsx` | Rimuovere `onUpdateNode` dalla dep array di `handleMouseMove` |

