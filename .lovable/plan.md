

# Aggiunta Campi Personalizzati Opportunita alla sezione Campi Personalizzati

## Panoramica

Estendere la pagina "Campi Personalizzati" per supportare sia i campi dei Contatti che quelli delle Opportunita, esattamente come in GHL. L'interfaccia mostrera entrambi gli oggetti (Contatto e Opportunita) nella stessa tabella unificata, con la possibilita di creare campi custom per entrambi.

---

## FASE 1: Database - Estensione tabella e nuova tabella valori

### Modifica `marketing_custom_fields`
Aggiungere colonna `object_type` per distinguere a quale oggetto appartiene il campo:
- `object_type TEXT NOT NULL DEFAULT 'contact'` (valori: `'contact'`, `'opportunity'`)

### Nuova tabella `marketing_opportunity_field_values`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| opportunity_id | uuid | FK marketing_opportunities |
| field_id | uuid | FK marketing_custom_fields |
| value | text | Valore del campo |
| created_at | timestamptz | Default now() |

RLS policies: stesse pattern delle altre tabelle marketing (company_admin ALL, staff SELECT, super_admin ALL), con join a `marketing_opportunities` per verificare `company_id`.

---

## FASE 2: Campi di sistema Opportunita (built-in)

Aggiungere nella lista statica `BUILTIN_FIELDS` i seguenti campi di sistema per le opportunita:

| Nome | Chiave Univoca | Cartella |
|---|---|---|
| Opportunity Name | `{{ opportunity.name }}` | Opportunita Details |
| Pipeline | `{{ opportunity.pipeline_id }}` | Opportunita Details |
| Stage | `{{ opportunity.pipeline_stage_id }}` | Opportunita Details |
| Status | `{{ opportunity.status }}` | Opportunita Details |
| Lead Value | `{{ opportunity.monetary_value }}` | Opportunita Details |
| Opportunity Owner | `{{ opportunity.assigned_to }}` | Opportunita Details |
| Opportunity Source | `{{ opportunity.source }}` | Opportunita Details |
| Lost Reason | `{{ opportunity.lost_reason }}` | Opportunita Details |

---

## FASE 3: Modifiche UI in `CustomFieldsConfig.tsx`

### Costanti
- Aggiungere colore e label per cartella `opportunity_details` (es. viola)
- Aggiungere oggetto `"Opportunita"` tra gli oggetti disponibili

### Dialog "Aggiungi campo"
- Aggiungere un select "Oggetto" con opzioni `Contatto` / `Opportunita`
- Il valore selezionato viene salvato come `object_type` nella tabella `marketing_custom_fields`
- Le sezioni disponibili cambiano in base all'oggetto selezionato:
  - **Contatto**: Contatto, Informazioni generali, Informazioni aggiuntive
  - **Opportunita**: Opportunita Details

### Tabella
- I campi custom con `object_type = 'opportunity'` vengono mostrati con oggetto "Opportunita" e chiave `{{ opportunity.campo }}`
- I campi filtrabili per oggetto tramite il "Raggruppa per" (attivare il filtro con opzioni: Tutto, Contatto, Opportunita)

### Ricerca
- La ricerca filtra anche per oggetto

---

## FASE 4: Integrazione nei componenti Opportunita

### `OpportunityDialog.tsx`
- Fetch dei campi custom con `object_type = 'opportunity'`
- Renderizzare input dinamici nel form di creazione opportunita (sotto i campi standard)
- Salvare i valori nella tabella `marketing_opportunity_field_values`

---

## FASE 5: Fix console warning e pulizia

- Fix del warning ref gia presente in `CustomFieldsConfig` (la `Select` del footer non e dentro un `forwardRef` - verificare e fixare)
- Rimuovere variabile `startIdx` inutilizzata (e sempre 0)
- Attivare il dropdown "Raggruppa per" con le opzioni reali

---

## Dettaglio tecnico

### File modificati
1. **`src/components/settings/CustomFieldsConfig.tsx`** - Aggiungere built-in opportunity fields, select oggetto nel dialog, filtro per oggetto, pulizia codice
2. **`src/components/opportunities/OpportunityDialog.tsx`** - Aggiungere rendering campi custom opportunita + salvataggio valori

### Migrazione database (1)
- ALTER TABLE `marketing_custom_fields` ADD COLUMN `object_type`
- CREATE TABLE `marketing_opportunity_field_values` con RLS

### Cosa NON cambia
- Nessuna modifica ai campi contatto esistenti
- Nessuna modifica alle pipeline/fasi
- Nessuna modifica alla struttura di navigazione

