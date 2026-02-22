
# Fix Filtri Avanzati - Bug di Rendering

## Problema identificato

Il `ContactFiltersSheet` ha un bug critico nel rendering delle due schermate (lista regole vs. field picker). Le due schermate usano posizionamento `absolute inset-0` con transizioni CSS `translate-x`, ma la Schermata 2 (field picker) viene sempre renderizzata sopra la Schermata 1 perche si trova dopo nel DOM e entrambe hanno la stessa posizione.

Risultato: quando si apre lo sheet, si vede sempre il field picker, il back button non funziona visivamente, e cliccando i campi non succede nulla (perche `pickingRuleId` e `null` al primo render).

## Causa tecnica

1. **Z-index implicito**: due elementi `absolute inset-0` nello stesso container - il secondo (field picker) copre sempre il primo (rules list)
2. **Reset stato mancante**: `handleOpenChange` resetta solo quando `o = true`, ma Radix Dialog chiama `onOpenChange` solo con `false` (quando si chiude). Quindi lo stato non viene mai resettato alla riapertura
3. **`overflow-hidden` non basta**: le transizioni `translate-x` non funzionano correttamente in questo contesto

## Soluzione

Sostituire il sistema CSS-based con **rendering condizionale** semplice (`{isPicking ? <FieldPicker /> : <RulesList />}`). Questo elimina tutti i problemi di z-index e CSS transition.

Aggiungere un `useEffect` per resettare lo stato quando `open` cambia a `true`.

## File da modificare

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Sostituire le due schermate absolute con rendering condizionale + fix reset stato |

## Dettagli tecnici

### 1. Aggiungere useEffect per reset stato

```text
useEffect(() => {
  if (open) {
    setLocal(filters);
    setPickingRuleId(null);
    setFieldSearch("");
  }
}, [open, filters]);
```

### 2. Sostituire il rendering a due schermate

Invece di due `div` con `absolute inset-0` e `translate-x`, usare:

```text
{isPicking ? (
  <FieldPickerScreen />
) : (
  <RulesListScreen />
)}
```

### 3. Aggiungere SheetDescription per eliminare warning console

Aggiungere un `SheetDescription` nascosto con `className="sr-only"` per risolvere il warning "Missing Description or aria-describedby" visibile nei log.

## Risultato atteso

- Lo sheet si apre mostrando la lista regole (vuota con "Aggiungi filtro")
- Cliccando "Aggiungi filtro" si passa al field picker
- Selezionando un campo si torna alla lista con la nuova regola
- Il back button funziona correttamente
- I filtri si applicano correttamente
