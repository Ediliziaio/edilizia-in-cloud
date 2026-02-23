

# Fix Errori Frequenti e Validazione Automazioni

## Problemi identificati

### 1. Warning `forwardRef` frequente (TagSelector dentro PopoverContent)
Il warning React "Function components cannot be given refs" appare ogni volta che si apre il pannello config di un nodo. La causa e che `Command` (da cmdk) dentro `PopoverContent` tenta di passare un ref a un child che non lo supporta. TagSelector gia usa `forwardRef`, ma il componente wrapping dentro AutomationNodeConfig non gestisce il ref correttamente quando usato come child di Popover.

**Fix**: Il problema non e in TagSelector (gia corretto) ma nel modo in cui viene usato dentro `AutomationNodeConfig`. Verificare che non ci siano function components usati come `asChild` senza `forwardRef`. In realta il warning punta a `PopoverContent` -> TagSelector nel config panel. Dato che TagSelector e gia `forwardRef`, il warning potrebbe venire da un livello intermedio. Servira wrappare il container div con `forwardRef` se necessario, oppure rimuovere l'uso improprio di `asChild`.

### 2. Si puo creare/pubblicare un'automazione vuota (CRITICO)
Attualmente:
- `togglePublish` non verifica se ci sono nodi nel flusso
- `saveAll` salva anche flow vuoti senza avvertire
- Si puo pubblicare un'automazione senza trigger ne azioni

**Fix**:
- In `togglePublish`: aggiungere validazione che richieda almeno 1 trigger prima di pubblicare
- In `saveAll`: permettere il salvataggio bozza vuota ma avvisare l'utente
- Aggiungere validazione completa prima della pubblicazione:
  - Almeno 1 trigger obbligatorio
  - Warning se nessuna azione collegata
  - Tutti i nodi devono avere configurazione minima valida

### 3. Bottone Salva/Bozza che a volte non funziona
Il problema persiste quando:
- `canPersist` e `false` perche `effectiveCompany` non e ancora caricato al mount
- Il flow esiste nel DB ma la query non ha ancora restituito i dati
- L'utente clicca troppo presto prima che il flow sia completamente caricato

**Fix**:
- Aggiungere loading state visibile sui bottoni quando `canPersist` e false
- Mostrare tooltip "Caricamento in corso..." quando i bottoni sono disabilitati
- Assicurarsi che `canPersist` diventi true non appena il flow e caricato

## Modifiche tecniche

### File: `src/hooks/useAutomationBuilder.ts`

1. **Aggiungere validazione pre-pubblicazione**:
```typescript
const validateForPublish = useCallback((): string[] => {
  const errors: string[] = [];
  const hasTrigger = nodes.some(n => n.node_type === "trigger");
  if (!hasTrigger) errors.push("Aggiungi almeno un trigger prima di pubblicare.");
  if (nodes.length < 2) errors.push("Aggiungi almeno un'azione dopo il trigger.");
  return errors;
}, [nodes]);
```

2. **Modificare `togglePublish`** per usare la validazione:
- Se si vuole pubblicare (da draft a published): eseguire `validateForPublish()`. Se ci sono errori, mostrare toast e bloccare.
- Se si vuole mettere in bozza (da published a draft): consentire sempre.

3. **Modificare `saveAll`** per non mostrare toast distruttivo su flow vuoti in bozza - solo un avviso leggero.

### File: `src/components/marketing/automations/AutomationBuilder.tsx`

1. **Aggiungere `validateForPublish` dall'hook** e usarlo nel toggle
2. **Tooltip sui bottoni disabilitati** per spiegare perche non sono cliccabili
3. **Feedback visivo** quando `canPersist` diventa true (bottoni si attivano)

### File: `src/components/marketing/automations/AutomationNodeConfig.tsx`

1. **Fix warning ref**: Il `TagSelector` e usato dentro il config panel che e gia dentro un contesto Popover. Il warning viene dal fatto che `PopoverContent` nel TagSelector cerca di passare il ref ma c'e un livello intermedio. Assicurarsi che il div wrapper nel TagSelector gestisca il ref correttamente (gia fatto con forwardRef, ma verificare che non ci sia un secondo Popover annidato che causa conflitto).

## Sequenza implementazione

1. Fix validazione `togglePublish` nel hook (impedire pubblicazione vuota)
2. Fix `saveAll` messaging per bozze vuote
3. Aggiungere `validateForPublish` come export dall'hook
4. Aggiornare UI builder per usare validazione e feedback
5. Fix warning ref nel config panel

## Risultato atteso

- Non si puo pubblicare un'automazione senza almeno un trigger
- Il salvataggio funziona sempre per le bozze con feedback chiaro
- I bottoni mostrano stato chiaro (disabilitati con motivo, attivi quando pronti)
- Warning ref eliminato dalla console
