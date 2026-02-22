
# Filtri GHL - Gruppi AND/OR con "Add nested filter" e "Add Filter"

## Panoramica

Ristrutturare il modello dati e la UI dei filtri per replicare esattamente il pattern GHL:

- Ogni **gruppo** di filtri e un blocco visuale con bordo che contiene una o piu regole combinate con **AND**
- Dentro ogni gruppo c'e un link **"+ Aggiungi filtro annidato"** che aggiunge una regola AND nello stesso gruppo
- Tra i gruppi c'e un separatore con etichetta **OR**
- Sotto tutti i gruppi c'e un pulsante **"+ Aggiungi filtro"** che crea un nuovo gruppo OR
- Footer con **"Rimuovi tutti i filtri"**, **"Cancel"** e **"Apply"**

## Nuovo modello dati

```text
interface FilterRule {
  id: string;
  field: string;
  operator: "is" | "is_not" | "is_empty" | "is_not_empty";
  value: string;
}

interface FilterGroup {
  id: string;
  rules: FilterRule[];    // regole AND dentro il gruppo
}

interface ContactFilters {
  groups: FilterGroup[];  // gruppi combinati con OR
}
```

- `EMPTY_CONTACT_FILTERS = { groups: [] }`
- `countActiveContactFilters` = somma di tutte le regole in tutti i gruppi

## Layout UI (identico a GHL)

```text
+------------------------------------------+
| Filtri Avanzati                     [X]  |
|                                          |
| +--------------------------------------+ |
| | [Citta] [pencil]    [E] [dropdown]   | |
| | [Roma________________]  [trash]      | |
| | + Aggiungi filtro annidato           | |
| +--------------------------------------+ |
|                                          |
|        -------- AND --------             |  (se ci sono piu regole nello stesso gruppo)
|                                          |
| +--------------------------------------+ |
| | [Email] [pencil]   [E] [dropdown]   | |
| | [test________________]  [trash]      | |
| | + Aggiungi filtro annidato           | |
| +--------------------------------------+ |
|                                          |
|         -------- OR --------             |  (tra gruppi diversi)
|                                          |
| +--------------------------------------+ |
| | [Please Select] [pencil] [Select v]  | |
| | [Please Input____________] [trash]   | |
| | + Aggiungi filtro annidato           | |
| +--------------------------------------+ |
|                                          |
| [+ Aggiungi filtro]                      |
|                                          |
|  Rimuovi tutti    [Cancel] [Apply]       |
+------------------------------------------+
```

Ogni regola dentro un gruppo mostra:
- Riga 1: Nome campo con icona matita (apre field picker) + dropdown operatore a destra
- Riga 2: Input valore + icona cestino (nascosto se operatore e "E vuoto"/"Non e vuoto")

Tra regole dello stesso gruppo: separatore con "AND"
Tra gruppi diversi: separatore con "OR"
Sotto ogni gruppo: "+ Aggiungi filtro annidato"
Sotto tutti i gruppi: "+ Aggiungi filtro" (bordo, stile pulsante)

## Logica query aggiornata

In `MarketingContacts.tsx`:

1. Per ogni gruppo, tutte le regole vengono applicate in AND (comportamento default Supabase: chain di filtri)
2. I gruppi vengono combinati con OR: si eseguono query separate per ogni gruppo e si uniscono gli ID risultanti
3. Se c'e un solo gruppo, si applica direttamente senza OR

Pseudo-codice:
```text
if groups.length === 0 -> nessun filtro
if groups.length === 1 -> applica tutte le regole del gruppo in AND sulla query
if groups.length > 1 -> per ogni gruppo, esegui query separata, unisci gli ID (OR)
```

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Cambiare tipi (FilterGroup, ContactFilters), UI con gruppi, AND/OR separatori, field picker invariato |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiornare imports, riscrivere logica query per gruppi OR con regole AND |

## Dettagli tecnici

### ContactFiltersSheet.tsx

- Nuovo tipo `FilterGroup` con `id` e `rules[]`
- `ContactFilters` diventa `{ groups: FilterGroup[] }`
- Stato `pickingRuleId` cambia formato: `"new_group"` per nuovo gruppo OR, `"nested_<groupId>"` per aggiungere AND nel gruppo, `"change_<ruleId>"` per cambiare campo di una regola esistente
- `countActiveContactFilters` = `f.groups.reduce((sum, g) => sum + g.rules.length, 0)`
- Render: iterare su `groups`, per ogni gruppo renderizzare le regole con separatore AND tra di loro, poi "+ Aggiungi filtro annidato", poi separatore OR prima del gruppo successivo
- Footer: "Rimuovi tutti i filtri" (link), "Cancel" (outline), "Apply" (primary)

### MarketingContacts.tsx

- Importare `FilterGroup` oltre a `FilterRule`
- Per un singolo gruppo: applicare le regole come AND (chain su query Supabase)
- Per gruppi multipli: eseguire una query per gruppo, unire i risultati (OR)
- Regole opportunita/custom fields: gestite come sub-query per ottenere contact_id, poi intersecate (AND) dentro il gruppo, unite (OR) tra gruppi
