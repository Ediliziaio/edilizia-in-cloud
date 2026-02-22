
# Filtri Avanzati con Navigazione a Sub-Schermata (Stile GHL)

## Panoramica

Ristrutturare il `ContactFiltersSheet` per replicare l'esperienza GHL: ogni filtro e una riga cliccabile che apre una **sub-schermata** all'interno dello stesso Sheet, dove l'utente puo scegliere un **operatore** (E, Non e, E vuoto, Non e vuoto) e inserire il valore.

## Come funziona (UX)

1. Lo Sheet si apre e mostra la **lista dei filtri** raggruppati per sezione (Informazioni contatto, Attivita, Opportunita, Tag, Campi personalizzati)
2. L'utente clicca su un filtro (es. "Citta")
3. Lo Sheet naviga a una **sub-schermata** con:
   - Header con nome del campo e freccia indietro
   - Dropdown operatore: E / Non e / Non e vuoto / E vuoto
   - Campo di input per il valore (visibile solo per "E" e "Non e")
   - Pulsante "Applica" per confermare e tornare alla lista
4. I filtri attivi vengono evidenziati nella lista con un badge/dot blu e il valore impostato
5. Footer con "Rimuovi tutti i filtri" + "Applica" (come GHL)

## Nuovo modello dati filtri

Ogni filtro diventa un oggetto con operatore e valore:

```text
interface FilterCondition {
  operator: "is" | "is_not" | "is_empty" | "is_not_empty" | "contains" | "gte" | "lte";
  value: string;
}

interface ContactFilters {
  // Campi standard - ognuno con operatore
  name: FilterCondition | null;
  email: FilterCondition | null;
  phone: FilterCondition | null;
  company: FilterCondition | null;
  source: FilterCondition | null;
  city: FilterCondition | null;
  province: FilterCondition | null;
  // Date
  dateFrom: string;
  dateTo: string;
  activityFrom: string;
  activityTo: string;
  // Collections
  tags: string[];
  pipelineId: string;
  stageId: string;
  oppStatuses: string[];
  customFields: Record<string, FilterCondition>;
}
```

## Operatori per tipo di campo

| Tipo campo | Operatori disponibili |
|------------|----------------------|
| Testo (nome, email, citta...) | E, Non e, Non e vuoto, E vuoto |
| Data | Da / A (range picker, come ora) |
| Tag | Selezione multipla chip (come ora) |
| Pipeline/Stage/Status | Select/Checkbox (come ora) |
| Custom field testo | E, Non e, Non e vuoto, E vuoto |
| Custom field select | E, Non e, Non e vuoto, E vuoto |
| Custom field numero | E, Non e, Non e vuoto, E vuoto |
| Custom field data | Da / A |

## Struttura del componente

Il `ContactFiltersSheet` avra due "schermate" interne gestite con uno stato `activeField`:

### Schermata 1 - Lista filtri (activeField = null)
- Barra di ricerca filtri
- Sezioni collapsible:
  - **Informazioni di contatto**: Nome, Email, Telefono, Azienda, Fonte, Citta, Provincia
  - **Attivita di contatto**: Data creazione, Ultima attivita
  - **Informazioni sulle opportunita**: Sequenza, Fase, Stato
  - **Tag**: Tag
  - **Campi personalizzati**: Raggruppati per sezione
- Ogni riga mostra il nome del campo. Se ha un filtro attivo, mostra il valore/operatore con un dot blu
- Footer: "Rimuovi tutti i filtri" a sinistra + "Cancel" e "Apply" a destra

### Schermata 2 - Dettaglio filtro (activeField = "city" etc.)
- Header: freccia indietro + nome campo (es. "Citta") + icona edit
- Dropdown operatore con checkmark sull'attivo
- Input valore (nascosto se operatore e "E vuoto" / "Non e vuoto")
- Link "+ Add nested filter" (solo UI, non funzionale per ora)
- Conferma automatica al ritorno alla lista

## Logica query aggiornata

In `MarketingContacts.tsx`, la logica di query viene aggiornata per gestire gli operatori:

| Operatore | Query Supabase |
|-----------|---------------|
| is (E) | `.ilike(field, "%value%")` per testo, `.eq(field, value)` per select |
| is_not (Non e) | `.not(field, "ilike", "%value%")` |
| is_empty (E vuoto) | `.is(field, null)` oppure `.eq(field, "")` |
| is_not_empty (Non e vuoto) | `.not(field, "is", null)` |

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Riscrittura completa con navigazione a sub-schermata, operatori, UX GHL |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiornare tipo `ContactFilters`, logica query per operatori |

## Dettagli tecnici

- La navigazione tra lista e dettaglio e gestita con `useState<string | null>(null)` per `activeField`
- Transizione fluida con CSS (translate-x animato) tra le due schermate
- Il footer "Rimuovi tutti i filtri" resetta tutto a `EMPTY_CONTACT_FILTERS`
- I filtri attivi mostrano un cerchio blu e il testo "E: Roma" accanto al nome campo nella lista
- La `countActiveContactFilters` viene aggiornata per contare le `FilterCondition` non null
- Backward compatible: i filtri date, tag, pipeline restano con la stessa struttura attuale
