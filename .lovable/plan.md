

# Stabilizzazione Finale - 5 Bug Fix

## Bug identificati

### Bug 1: SelectItem con valore vuoto (CRASH)
**File**: `AutomationNodeConfig.tsx` linea 260
**Problema**: `<SelectItem value="">Nessun template</SelectItem>` - Radix Select non supporta valori stringa vuota. Causa errore runtime quando si apre il dropdown template email.
**Fix**: Usare un valore sentinella come `"none"` e gestire il reset del template_id di conseguenza.

### Bug 2: Validazione assign_user incompleta
**File**: `automationBuilder.ts` linea 474
**Problema**: `config.assign_method === "specific"` fallisce se assign_method non e mai stato impostato (undefined). L'UI mostra "Specifico" come default ma il config non lo contiene, quindi la validazione non richiede l'utente.
**Fix**: Cambiare la condizione in `config.assign_method !== "round_robin"` (coerente con la UI che mostra "specific" come default).

### Bug 3: If/Else hardcoded a categoria "contact"
**File**: `AutomationNodeConfig.tsx` linea 790
**Problema**: Il nodo condition (If/Else) usa `triggerCategory="contact"` hardcoded. Se il trigger e di tipo "opportunity" o "appointment", i campi disponibili nel condition builder saranno sbagliati.
**Fix**: Derivare la categoria dal nodo trigger presente nel flusso. Cercare il primo nodo con `node_type === "trigger"` in `allNodes` e usare il suo `config_json.trigger_category`.

### Bug 4: Nodo condition senza validazione al salvataggio
**File**: `AutomationNodeConfig.tsx` linea 838
**Problema**: Il bottone "Salva" nel pannello DEFAULT (per delay, condition, split, goal) chiama solo `onClose()` senza validare le condizioni. Un nodo If/Else con condizioni vuote viene salvato senza errori.
**Fix**: Aggiungere validazione per il nodo condition usando `validateFilters` prima di chiudere, con toast di errore se le condizioni sono incomplete.

### Bug 5: Nodo If/Else perde action_type nel config
**File**: `AutomationBuilder.tsx` linea 133
**Problema**: Quando si crea un nodo If/Else, il `config_json` contiene `{ condition_field, condition_operator, condition_value }` (campi legacy) invece di `{ condition_filters: { logic: "AND", conditions: [] } }`. I campi legacy non sono usati da nessuna parte.
**Fix**: Inizializzare con `{ condition_filters: { logic: "AND", conditions: [] } }` che e il formato effettivamente usato dal TriggerConditionBuilder (linea 791).

## File da modificare

| File | Fix |
|------|-----|
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | Fix 1 (SelectItem), Fix 3 (categoria dinamica), Fix 4 (validazione condition) |
| `src/types/automationBuilder.ts` | Fix 2 (validazione assign_user) |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Fix 5 (config iniziale If/Else) |

Nessun file nuovo. Nessuna modifica al database.

