

# Migliorare visibilita Pipeline/Fase nei Filtri e Gestisci Campi

## Analisi

Dopo un'analisi approfondita del codice, i campi "Pipeline" e "Fase pipeline" sono gia presenti sia nei filtri avanzati (`ContactFiltersSheet`) sia nel pannello "Gestisci campi" (`ContactFieldsSheet`). Tuttavia ci sono due problemi di UX che li rendono difficili da trovare:

1. **Gestisci campi**: i campi sono mostrati in una lista piatta senza categorie. Con 22+ campi, quelli in fondo (Pipeline, Fase pipeline, campi custom) sono nascosti e difficili da trovare
2. **Filtri**: la "Fase pipeline" mostra tutte le fasi di tutte le pipeline in un unico dropdown. L'utente vuole un flusso a cascata: prima scegliere la pipeline, poi la fase

## Modifiche previste

| File | Modifica |
|------|----------|
| `src/components/marketing/ContactFieldsSheet.tsx` | Raggruppare i campi per categoria (Contatto, Date, Tag, Opportunita, Campi personalizzati) |
| `src/components/marketing/ContactsTable.tsx` | Aggiungere una proprietà `group` ai COLUMNS per identificare la categoria |

## Dettagli tecnici

### 1. ContactsTable.tsx - Aggiungere gruppi ai COLUMNS

Aggiungere una proprieta `group` a ogni colonna per categorizzarle:

```text
COLUMNS = [
  { key: "name", label: "Nome del Contatto", group: "Contatto", ... },
  { key: "phone", label: "Telefono", group: "Contatto", ... },
  { key: "email", label: "Email", group: "Contatto", ... },
  { key: "company_name", label: "Azienda", group: "Contatto", ... },
  { key: "city", label: "Citta", group: "Contatto" },
  { key: "province", label: "Provincia", group: "Contatto" },
  { key: "address", label: "Indirizzo", group: "Contatto" },
  { key: "postal_code", label: "CAP", group: "Contatto" },
  { key: "country", label: "Paese", group: "Contatto" },
  { key: "contact_type", label: "Tipo contatto", group: "Contatto" },
  { key: "website", label: "Sito web", group: "Contatto" },
  { key: "notes_col", label: "Note", group: "Contatto" },
  { key: "source", label: "Fonte", group: "Contatto" },
  { key: "created_at", label: "Creato", group: "Date", ... },
  { key: "last_activity_at", label: "Ultima Attivita", group: "Date", ... },
  { key: "date_of_birth", label: "Data di nascita", group: "Date" },
  { key: "tags", label: "Tag", group: "Tag" },
  { key: "opp_name", label: "Opportunita", group: "Opportunita" },
  { key: "opp_value", label: "Valore opp.", group: "Opportunita" },
  { key: "opp_status", label: "Stato opp.", group: "Opportunita" },
  { key: "opp_pipeline", label: "Pipeline", group: "Opportunita" },
  { key: "opp_stage", label: "Fase pipeline", group: "Opportunita" },
]
```

### 2. ContactFieldsSheet.tsx - Mostrare campi raggruppati per categoria

Modificare il rendering per mostrare i campi raggruppati:

- **Campi nella tabella**: raggruppati per categoria con header (Contatto, Date, Tag, Opportunita, Campi personalizzati)
- **Aggiungi campi**: raggruppati per categoria con header
- I custom fields avranno il gruppo "Campi personalizzati"

```text
// Esempio struttura visiva nel pannello:

CAMPI NELLA TABELLA
  Contatto
    [x] Nome del Contatto (bloccato)
    [x] Telefono
    [x] Email
  Date
    [x] Creato

AGGIUNGI CAMPI
  Contatto
    [ ] Citta
    [ ] Provincia
  Opportunita
    [ ] Pipeline
    [ ] Fase pipeline
  Campi personalizzati
    [ ] Campo custom 1
```

Questo rende immediatamente visibili i campi Pipeline e Fase pipeline nella sezione "Opportunita", eliminando il problema di trovarli in una lista piatta.

### 3. Nessuna modifica ai filtri

I filtri avanzati (`ContactFiltersSheet`) gia supportano "Fase pipeline" con tutte le fasi raggruppate per pipeline nel formato "Pipeline -> Fase". Il campo e nel gruppo "Opportunita" nel field picker. Non servono modifiche funzionali.

## Risultato atteso

- Il pannello "Gestisci campi" mostra i campi organizzati per categoria
- Pipeline e Fase pipeline sono chiaramente visibili nella sezione "Opportunita"
- I campi personalizzati hanno la propria sezione dedicata
- I filtri continuano a funzionare come prima
- Nessun cambio funzionale, solo miglioramento organizzativo/UX

