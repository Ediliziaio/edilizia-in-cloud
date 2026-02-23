
# Fix Funzionamento Bottoni Automazione Builder

## Bug identificati

### Bug 1: Bottone "Archivia" senza onClick (CRITICO)
**File**: `AutomationBuilder.tsx` linea 256-258
**Problema**: Il bottone "Archivia" e puramente decorativo - non ha alcun handler `onClick`. Cliccandolo non succede nulla.
**Fix**: Aggiungere `onClick` che chiama `updateFlowMutation.mutateAsync({ status: "archived" })`, poi naviga alla lista con toast di conferma. Wrappare in try/catch.

### Bug 2: Save non funziona su flow appena creato (CRITICO)
**File**: `useAutomationBuilder.ts` linea 136-137
**Problema**: `saveAll` controlla `if (!flowId || flowId === "nuova") return;` - ma quando la `createFlowMutation` ha successo e fa il redirect, il componente si ri-monta con il nuovo `id` da URL. In quel momento `flowId` diventa il nuovo UUID e funziona. Il problema reale e che `triggerAutoSave` (linea 114-120) ha dependency array vuoto `[]`, quindi cattura una versione stale di `saveAll` che ha `flowId = undefined`. L'auto-save non funzionera mai.
**Fix**: Aggiungere `saveAll` alle dipendenze di `triggerAutoSave` tramite un ref per evitare loop infiniti, oppure usare un pattern `useRef` per `saveAll`.

### Bug 3: togglePublish senza try/catch (CRASH)
**File**: `useAutomationBuilder.ts` linea 267-273
**Problema**: `togglePublish` usa `await updateFlowMutation.mutateAsync(...)` senza try/catch. Se la mutazione fallisce, l'errore non viene gestito e puo causare un unhandled promise rejection (schermo bianco).
**Fix**: Wrappare in try/catch con toast di errore.

### Bug 4: saveAll non da feedback visivo di successo
**File**: `useAutomationBuilder.ts` linea 136-201
**Problema**: Quando il salvataggio va a buon fine, non c'e alcun toast di conferma. L'utente non sa se ha funzionato.
**Fix**: Aggiungere `toast({ title: "Salvato con successo" })` dopo il salvataggio riuscito.

## File da modificare

| File | Fix |
|------|-----|
| `src/components/marketing/automations/AutomationBuilder.tsx` | Fix 1: onClick per Archivia con navigazione + toast |
| `src/hooks/useAutomationBuilder.ts` | Fix 2: triggerAutoSave stale closure, Fix 3: try/catch togglePublish, Fix 4: toast successo save |

Nessun file nuovo. Nessuna modifica al database.
