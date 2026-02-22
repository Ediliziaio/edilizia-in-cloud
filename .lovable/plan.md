
# Filtri Avanzati Dinamici - Stile GHL

## Panoramica

Ristrutturare completamente il sistema di filtri per replicare l'approccio GHL: invece di sezioni fisse con campi predefiniti, l'utente aggiunge **regole di filtro dinamiche** una alla volta. Ogni regola ha un campo selezionabile, un operatore e un valore. Le regole possono essere combinate con logica **E (AND)** oppure **O (OR)**.

## Come funziona (UX - identico a GHL)

1. Lo Sheet si apre con la lista delle regole attive (inizialmente vuota)
2. In alto: toggle **E / O** per la logica di combinazione
3. Ogni regola di filtro mostra:
   - Nome del campo (con icona matita per cambiare)
   - Dropdown operatore (E, Non e, E vuoto, Non e vuoto)
   - Campo di input per il valore
   - Icona cestino per eliminare la regola
4. Sotto le regole: link **"+ Aggiungi filtro"** per aggiungere una nuova regola
5. Footer: **"Rimuovi tutti i filtri"** a sinistra, **"Cancel"** e **"Apply"** a destra
6. Quando si clicca su un campo o su "+ Aggiungi filtro", si apre un picker per scegliere il campo da filtrare (lista di tutti i campi disponibili raggruppati)

## Nuovo modello dati

```text
interface FilterRule {
  id: string;                // ID univoco della regola (generato)
  field: string;             // Chiave del campo (es. "city", "email", "opp_pipeline", "cf_<id>")
  operator: "is" | "is_not" | "is_empty" | "is_not_empty" | "contains" | "gte" | "lte";
  value: string;
}

interface ContactFilters {
  logic: "and" | "or";       // Logica di combinazione tra regole
  rules: FilterRule[];       // Lista dinamica di regole
}
```

## Campi disponibili nel picker

| Gruppo | Campi |
|--------|-------|
| Informazioni contatto | Nome, Email, Telefono, Azienda, Fonte, Citta, Provincia |
| Date | Data creazione, Ultima attivita |
| Tag | Tag |
| Opportunita | Sequenza (pipeline), Fase, Stato |
| Campi personalizzati | Tutti i custom fields di tipo "contact" |

## Operatori disponibili per tipo

| Tipo campo | Operatori |
|------------|-----------|
| Testo | E, Non e, E vuoto, Non e vuoto |
| Data | E, Non e, E vuoto, Non e vuoto (valore = date input) |
| Tag | E (valore = tag selezionato), Non e |
| Pipeline/Stage | E (valore = select), Non e |
| Stato opp | E, Non e |

## Logica query aggiornata

In `MarketingContacts.tsx`, la query viene costruita dinamicamente:

1. Separare le regole in 3 gruppi: standard (campi contatto), opportunita, custom fields
2. Per le regole standard: applicare filtri direttamente sulla query `marketing_contacts`
3. Per le regole opportunita: query su `marketing_opportunities` per ottenere `contact_id`
4. Per le regole custom fields: query su `marketing_contact_field_values` per ottenere `contact_id`
5. Se logica = AND: intersecare tutti gli ID, applicare filtri standard con `.and()`
6. Se logica = OR: unire tutti gli ID, applicare filtri standard con `.or()`

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Riscrittura completa: regole dinamiche, toggle AND/OR, field picker, layout GHL |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiornare tipo ContactFilters, riscrivere logica query per regole dinamiche con AND/OR |

## Dettagli tecnici

### ContactFiltersSheet - Struttura interna

Il componente gestisce due viste:
- **Vista principale**: lista delle regole + toggle AND/OR + "+ Aggiungi filtro"
- **Vista field picker**: lista raggruppata di tutti i campi disponibili (si apre quando si aggiunge/modifica un campo)

Ogni regola viene renderizzata come un blocco compatto:
```text
[Citta (pencil)] [E (dropdown)] [Roma (input)] [trash]
```

Il toggle AND/OR e un segmented control in alto che cambia `logic` tra "and" e "or".

### Query builder in MarketingContacts.tsx

La funzione `applyFilterCondition` viene rimossa e sostituita da un sistema che itera sulle `rules`:

```text
for each rule in filters.rules:
  if rule.field is standard -> apply to main query
  if rule.field starts with "opp_" -> add to opportunity sub-query
  if rule.field starts with "cf_" -> add to custom field sub-query
  if rule.field is "tags" -> apply overlaps
  if rule.field is date -> apply gte/lte
```

Se `logic = "and"`: tutti i filtri standard vengono applicati in sequenza (AND implicito di Supabase), gli ID vengono intersecati.
Se `logic = "or"`: i filtri standard vengono combinati con `.or()`, gli ID vengono uniti.

### countActiveContactFilters

Diventa semplicemente `filters.rules.length`.

### EMPTY_CONTACT_FILTERS

Diventa `{ logic: "and", rules: [] }`.

### Field picker

Un pannello con ricerca che mostra i campi raggruppati. Quando l'utente seleziona un campo, viene creata una nuova regola con operatore default "is" e valore vuoto, e il picker si chiude tornando alla vista principale.

### Validazione

Una regola con operatore "is" o "is_not" senza valore mostra un messaggio rosso "Minimo 3 caratteri richiesti" (come GHL) e non viene applicata alla query.

### UX miglioramenti

- Transizione fluida tra vista principale e field picker
- I campi gia usati in una regola vengono comunque mostrati nel picker (si possono avere piu regole sullo stesso campo)
- Feedback visivo per regole incomplete (bordo rosso sull'input)
- Il pulsante "Apply" e disabilitato se ci sono regole con valori richiesti ma vuoti
