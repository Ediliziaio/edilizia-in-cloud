

# Fix e Stabilizzazione Filtri Avanzati Contatti

## Problemi identificati

### Bug 1: Tag mostrati come input testo invece che dropdown
Nel `ContactFiltersSheet.tsx`, il campo "Tag" ha `type: "tags"` ma **nessuna opzione definita** (`options: undefined`). La condizione a riga 340 (`isSelectField && fieldDef?.options`) risulta `false` per i tag, quindi il tag viene renderizzato come un semplice input di testo invece che come dropdown con i tag disponibili. L'utente non puo selezionare un tag dal menu.

**Fix**: Aggiungere un check separato per `fieldDef?.type === "tags"` che usa `availableTags` come sorgente delle opzioni.

### Bug 2: Warning console "Function components cannot be given refs"
Il componente `Select` di Radix viene usato senza `forwardRef`. Questo warning appare perche Radix tenta di passare un ref al componente `Select` dentro lo Sheet. Non causa crash ma inquina la console.

**Fix**: Non risolvibile direttamente (e un comportamento interno di Radix/Sheet). Il warning e innocuo.

### Cleanup 1: Import inutilizzato `X`
L'import `X` da lucide-react (riga 6) non viene mai usato nel componente.

**Fix**: Rimuovere l'import.

### Cleanup 2: Condizioni ridondanti in MarketingContacts
Riga 178: `rule.field.startsWith("opp_") || rule.field === "opp_status" || rule.field === "opp_stage"` - le ultime due condizioni sono ridondanti perche entrambi i campi iniziano gia con `"opp_"`.

**Fix**: Semplificare a `rule.field.startsWith("opp_")`.

## File da modificare

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Fix rendering tag come dropdown + rimuovere import `X` |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Semplificare condizione ridondante opp rules |

## Dettagli tecnici

### ContactFiltersSheet.tsx - Fix Tag Dropdown

Nella sezione di rendering del valore (righe 339-355), cambiare la logica per gestire i tag separatamente:

```text
// Prima (bug): tags cade nel branch text input
{isSelectField && fieldDef?.options ? (
  <Select>...</Select>
) : fieldDef?.type === "date" ? (
  <Input type="date" />
) : (
  <Input placeholder="Inserisci valore..." />  // <-- tags finisce qui!
)}

// Dopo (fix): check esplicito per tags
{fieldDef?.type === "tags" ? (
  <Select value={rule.value} onValueChange={...}>
    <SelectTrigger>
      <SelectValue placeholder="Seleziona tag..." />
    </SelectTrigger>
    <SelectContent>
      {availableTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
    </SelectContent>
  </Select>
) : isSelectField && fieldDef?.options ? (
  <Select>...options...</Select>
) : fieldDef?.type === "date" ? (
  <Input type="date" />
) : (
  <Input placeholder="Inserisci valore..." />
)}
```

### ContactFiltersSheet.tsx - Rimuovere import X

Riga 6: rimuovere `X` dall'import di lucide-react.

### MarketingContacts.tsx - Semplificare condizione

Riga 178: cambiare da:
```text
rule.field.startsWith("opp_") || rule.field === "opp_status" || rule.field === "opp_stage"
```
a:
```text
rule.field.startsWith("opp_")
```

## Verifiche UX

- Il campo Tag ora mostra un dropdown con tutti i tag disponibili
- Tutti gli altri campi continuano a funzionare come prima
- La console e pulita (warning Radix residuo, innocuo)
- Il flusso aggiunta filtro -> selezione campo -> compilazione valore -> applica e fluido

