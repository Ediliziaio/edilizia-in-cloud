

# Automazioni Marketing - Implementazione Completa

Attualmente la pagina "Automazioni" nella sezione Marketing e Vendita e un semplice placeholder. L'obiettivo e trasformarla in un modulo funzionante con trigger specifici per il marketing (nuovo lead, cambio fase pipeline, tag aggiunto) e azioni dedicate (invia email, attendi X giorni, condizione IF).

---

## Approccio

Riutilizzare la stessa tabella `automations` gia esistente, aggiungendo nuovi tipi di trigger e azioni specifici per il marketing. La pagina `MarketingAutomations.tsx` verra riscritta per usare `AutomationsConfig` con configurazione marketing-specifica.

---

## Modifiche

### 1. `src/pages/azienda/marketing/MarketingAutomations.tsx`

Sostituire il placeholder con una pagina completa che usa un componente dedicato `MarketingAutomationsConfig`, simile a `AutomationsConfig` ma con trigger e azioni marketing.

### 2. Nuovo: `src/components/marketing/MarketingAutomationsConfig.tsx`

Componente principale che replica la struttura di `AutomationsConfig` ma con:
- **Trigger marketing**:
  - `new_lead` - Nuovo contatto/lead creato
  - `pipeline_stage_change` - Cambio fase opportunita
  - `tag_added` - Tag aggiunto al contatto
  - `contact_field_change` - Campo personalizzato modificato
  - `opportunity_won` - Opportunita vinta
  - `opportunity_lost` - Opportunita persa
- **Azioni marketing**:
  - `send_email` - Invia email (seleziona template da `email_templates`)
  - `wait_days` - Attendi X giorni
  - `add_tag` - Aggiungi tag al contatto
  - `remove_tag` - Rimuovi tag dal contatto
  - `move_pipeline_stage` - Sposta opportunita a fase
  - `create_task` - Crea attivita
  - `send_notification` - Invia notifica interna
- Query e mutazioni CRUD sulla tabella `automations` filtrate per `company_id`
- Nuovi trigger/action type vengono salvati come stringhe nella stessa tabella `automations` (campo `trigger_type`, `actions` jsonb)

### 3. Nuovo: `src/components/marketing/MarketingAutomationDialog.tsx`

Dialog per creare/modificare automazioni marketing con lo stesso pattern visivo QUANDO/SE/ALLORA del dialog interno ma con i nuovi trigger e azioni.

### 4. Nuovo: `src/components/marketing/MarketingActionBlock.tsx`

Blocco azione singola (come `AutomationActionBlock`) con i tipi di azione marketing:
- `send_email`: selettore template email + variante oggetto
- `wait_days`: input numero giorni
- `add_tag` / `remove_tag`: selettore tag esistenti
- `move_pipeline_stage`: selettore pipeline + fase
- `create_task`: titolo + assegnazione
- `send_notification`: messaggio + destinatario

### 5. Nessuna modifica database

La tabella `automations` supporta gia qualsiasi `trigger_type` e `actions` come jsonb. Non servono migrazioni.

---

## Sezione tecnica

### File coinvolti

| Azione | File |
|--------|------|
| Riscrittura | `src/pages/azienda/marketing/MarketingAutomations.tsx` |
| Nuovo | `src/components/marketing/MarketingAutomationsConfig.tsx` |
| Nuovo | `src/components/marketing/MarketingAutomationDialog.tsx` |
| Nuovo | `src/components/marketing/MarketingActionBlock.tsx` |

### Dati caricati nel dialog

- Pipeline e fasi: query `marketing_pipelines` + `marketing_pipeline_stages`
- Tag: derivati dai contatti o dalla config tag
- Template email: query `email_templates`
- Utenti azienda: query `profiles` + `user_roles`

### Pattern visivo

Stessa UI "QUANDO / SE / ALLORA" con card colorate (blu trigger, ambra condizioni, verde azioni) gia usata nelle automazioni interne.

