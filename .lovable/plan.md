
# Filtri Avanzati Contatti - Stile GHL

## Panoramica

Ristrutturare completamente il `ContactFiltersSheet` per replicare lo stile GHL con sezioni raggruppate per categoria, ricerca filtri, filtri per campi personalizzati e filtri basati sulle opportunita (sequenza, fase, stato).

## Struttura delle sezioni filtri (come GHL)

| Sezione | Filtri contenuti |
|---------|-----------------|
| Informazioni di contatto | Nome, Email, Telefono, Azienda, Fonte, Citta, Provincia |
| Attivita di contatto | Data creazione (da/a), Ultima attivita (da/a) |
| Informazioni sulle opportunita | Sequenza (pipeline), Fase della pipeline (stage), Stato della pipeline (open/won/lost/abandoned) |
| Tag | Tag selezionabili con chip |
| Campi personalizzati | Campi custom di tipo contact creati dall'utente, raggruppati per sezione |

## Logica filtri opportunita

I filtri opportunita filtrano i contatti che hanno almeno una opportunita corrispondente ai criteri selezionati. La query:

1. Se un filtro opportunita e attivo, eseguire prima una query su `marketing_opportunities` per ottenere i `contact_id` che matchano
2. Poi filtrare `marketing_contacts` con `.in("id", matchingContactIds)`

Filtri disponibili:
- **Sequenza**: Select con tutte le pipeline dell'azienda
- **Fase della pipeline**: Select con gli stage della pipeline selezionata (dipendente dalla sequenza)
- **Stato della pipeline**: Checkbox multiple (Aperta, Vinta, Persa, Abbandonata)

## Logica filtri campi personalizzati

Per ogni campo custom di tipo "contact":
- **Testo**: Input text con ricerca ilike
- **Numero**: Input min/max
- **Data**: Date picker da/a
- **Select**: Checkbox con le opzioni predefinite

La query: cercare nella tabella `marketing_contact_field_values` i `contact_id` dove `field_id` = X e `value` matcha il filtro, poi filtrare con `.in("id", ids)`.

## File coinvolti

| File | Azione |
|------|--------|
| `src/components/marketing/ContactFiltersSheet.tsx` | Riscrittura completa: aggiungere sezioni GHL, ricerca filtri, filtri opportunita, filtri custom fields |
| `src/pages/azienda/marketing/MarketingContacts.tsx` | Aggiornare interfaccia `ContactFilters`, passare nuove props (pipelines, custom fields), aggiornare logica query per filtri opportunita e custom fields |

## Dettagli tecnici

### Nuovo tipo ContactFilters

```text
interface ContactFilters {
  // Informazioni contatto
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  city: string;
  province: string;
  // Date
  dateFrom: string;
  dateTo: string;
  activityFrom: string;
  activityTo: string;
  // Tag
  tags: string[];
  // Opportunita
  pipelineId: string;
  stageId: string;
  oppStatuses: string[];
  // Custom fields
  customFields: Record<string, string>;
}
```

### Flusso query in MarketingContacts.tsx

1. Se filtri opportunita attivi (pipelineId, stageId o oppStatuses) -> query `marketing_opportunities` per ottenere lista `contact_id`
2. Se filtri custom fields attivi -> query `marketing_contact_field_values` per ottenere lista `contact_id`
3. Intersecare le due liste se entrambi attivi
4. Applicare `.in("id", contactIds)` alla query principale dei contatti
5. I filtri "standard" (name, email, phone, etc.) vengono applicati direttamente sulla query principale

### Props aggiuntive per ContactFiltersSheet

- `pipelines`: lista pipeline con stages (gia disponibile da `usePipelines`)
- `customFields`: lista campi personalizzati di tipo "contact" (gia disponibile da `useContactCustomFields`)
- `availableTags`: lista tag disponibili (gia presente)

### Ricerca filtri

Una barra di ricerca in cima al sheet (come GHL) che filtra le sezioni e i campi mostrati. Se il testo di ricerca non matcha nessun campo in una sezione, la sezione viene nascosta.

### UX Sheet

- Header: "Advanced Filters" con ricerca
- Body: sezioni collapsible con ChevronRight/ChevronDown
- Sezione "Informazioni sulle opportunita": quando si seleziona una Sequenza, gli stage si aggiornano dinamicamente
- Footer: "Resetta" + "Applica filtri" (invariato)
- Conteggio filtri attivi aggiornato per includere i nuovi filtri

## Pulizia codice

- Rimuovere filtri duplicati o non piu utilizzati
- Consolidare la logica di conteggio filtri attivi
- Assicurarsi che il reset pulisca tutti i nuovi filtri
