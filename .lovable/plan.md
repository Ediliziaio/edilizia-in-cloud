

# Condition Builder Avanzato per Trigger Automazioni

## Panoramica

Implementare un sistema di condizioni logiche avanzato (AND/OR/gruppi annidati) nel pannello di configurazione dei trigger, ispirato a GoHighLevel. Quando si clicca su un nodo trigger nel canvas, il pannello laterale destro mostra: titolo trigger, descrizione, select trigger type, nome trigger, e sotto una sezione **FILTRI** con condition builder completo.

## Architettura

### 1. Tipi e definizioni (`src/types/automationBuilder.ts`)

Aggiungere i seguenti tipi:

```typescript
interface TriggerCondition {
  id: string;
  field: string;
  operator: string;
  value: any;
}

interface TriggerConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}

interface TriggerFilters {
  logic: "AND" | "OR";
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}
```

Aggiungere definizioni campi per categoria trigger:

```typescript
// Definizione campi per trigger "contact"
CONTACT_TRIGGER_FIELDS = [
  { key: "email", label: "Email", type: "text", group: "Campi standard" },
  { key: "phone", label: "Phone", type: "text", group: "Campi standard" },
  { key: "contact_type", label: "Contact Type", type: "select", group: "Campi standard" },
  { key: "tags", label: "Tag", type: "tags", group: "Campi standard" },
  { key: "source", label: "Fonte Lead", type: "text", group: "Campi standard" },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Campi standard" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Campi standard" },
  // + custom fields dinamici caricati da DB
]

// Definizione operatori per tipo
TEXT_OPERATORS = ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"]
NUMBER_OPERATORS = ["equals", "not_equals", "gt", "gte", "lt", "lte", "between"]
DATE_OPERATORS = ["on", "before", "after", "between", "today", "yesterday", "in_last_x_days", "in_next_x_days", "is_empty", "is_not_empty"]
BOOLEAN_OPERATORS = ["is_true", "is_false"]
TAG_OPERATORS = ["contains", "not_contains"]
USER_OPERATORS = ["equals", "not_equals", "is_assigned", "is_not_assigned"]
```

Stessa struttura per trigger `opportunity`, `appointment`, `communication`.

### 2. Componente Condition Builder (`src/components/marketing/automations/TriggerConditionBuilder.tsx`) - NUOVO

Componente principale che renderizza il builder condizioni. Struttura UI:

- **Sezione "FILTRI"** con label
- Per ogni condizione nella lista:
  - **Select campo**: dropdown con ricerca, raggruppato per "Campi standard" e "Campo personalizzato" (come nello screenshot GHL)
  - **Select operatore**: cambia dinamicamente in base al tipo di campo selezionato
  - **Input valore**: cambia dinamicamente (text input, number input, date picker, tag multi-select, user select) in base al campo + operatore
  - **Bottone elimina** (icona cestino)
- **Selettore AND/OR** tra condizioni (pill toggle)
- **"+ Aggiungi Filtri"** per aggiungere nuova condizione
- **"+ Aggiungi Gruppo"** per aggiungere gruppo annidato (indentato visivamente con bordo sinistro)

Props:
- `triggerCategory: string` - per determinare quali campi mostrare
- `conditions: TriggerFilters` - stato corrente
- `onChange: (filters: TriggerFilters) => void`
- `companyId: string` - per caricare custom fields

### 3. Componente Value Input dinamico (`src/components/marketing/automations/ConditionValueInput.tsx`) - NUOVO

Renderizza l'input corretto in base al tipo di campo:
- **text**: Input standard
- **number**: Input type="number"
- **date**: DatePicker (per "on", "before", "after") o 2 DatePicker (per "between") o Input numero (per "in_last_x_days")
- **select**: Select con opzioni del campo
- **tags**: Dropdown multi-select con ricerca (carica tag da `marketing_tags`)
- **user**: Select che carica utenti dell'azienda da `profiles`
- **boolean**: Nessun input (operatore e sufficiente)

Per operatori "is_empty" / "is_not_empty" / "is_assigned" / "is_not_assigned" / "today" / "yesterday": non mostrare input valore.

### 4. Modifica `AutomationNodeConfig.tsx`

Quando `node.node_type === "trigger"`:
- Mostrare titolo trigger + descrizione (es. "Si attiva nel momento in cui viene aggiunto un nuovo record di contatto.")
- Mostrare select "SELEZIONARE UN TRIGGER DEL FLUSSO DI LAVORO" (dropdown con tutti i trigger della stessa categoria)
- Mostrare input "NOME DEL TRIGGER FLUSSO DI LAVORO" editabile
- Mostrare sezione **FILTRI** con il `TriggerConditionBuilder`
- Footer: bottoni "Annulla" + "Salva il trigger" (come GHL)

Il pannello laterale deve essere piu largo quando si configura un trigger: da `w-80` a `w-[420px]`.

Le condizioni vengono salvate in `config_json.filters` del nodo trigger:
```json
{
  "trigger_event": "contact_created",
  "trigger_category": "contact",
  "trigger_name": "Contatto Creato",
  "filters": {
    "logic": "AND",
    "conditions": [
      { "id": "...", "field": "email", "operator": "contains", "value": "gmail.com" },
      { "id": "...", "field": "tags", "operator": "contains", "value": "Lead Caldo" }
    ]
  }
}
```

### 5. Campi per categoria trigger

**Contatto** (`contact`):
- Campi standard: Contact Type, Email, Phone, Tag, Fonte Lead, Utente assegnato, Data creazione, DND status
- Campi personalizzati: caricati dinamicamente da `marketing_custom_fields` dove `object_type = 'contact'`

**Opportunita** (`opportunity`):
- Pipeline, Fase, Valore opportunita (number), Stato (select: Aperta/Vinta/Persa), Data creazione (date), Data chiusura (date), Utente assegnato (user), Tag

**Appuntamento** (`appointment`):
- Calendario, Stato appuntamento, Data appuntamento (date), Tipo appuntamento, Utente assegnato (user), Fonte prenotazione

**Comunicazioni** (`communication`):
- Tipo comunicazione (select: email_opened, email_clicked, whatsapp_received, etc.)
- Per email: link specifico (text)
- Per WhatsApp: tempo risposta (number)
- Per chiamate: durata (number), esito (select)

**Sistema** (`system`):
- Webhook URL (text), Form ID (text), Survey ID (text)

### 6. Validazioni

- Non salvare condizioni con campo vuoto
- Non salvare condizioni con operatore vuoto
- Non salvare condizioni con valore vuoto (tranne operatori che non richiedono valore: is_empty, is_not_empty, today, yesterday, is_assigned, is_not_assigned, is_true, is_false)
- Non salvare gruppi senza condizioni
- Mostrare bordo rosso + tooltip su campi invalidi al click "Salva"
- JSON sempre valido e normalizzato prima del salvataggio

## Riepilogo file

| File | Operazione | Descrizione |
|------|------------|-------------|
| `src/types/automationBuilder.ts` | Modifica | Aggiungere tipi TriggerCondition, TriggerConditionGroup, TriggerFilters, definizioni campi/operatori per categoria |
| `src/components/marketing/automations/TriggerConditionBuilder.tsx` | Nuovo | Componente condition builder con AND/OR, gruppi, annidamento |
| `src/components/marketing/automations/ConditionValueInput.tsx` | Nuovo | Input valore dinamico per tipo campo |
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | Modifica | Ristrutturare sezione trigger con layout GHL (titolo, select trigger, nome, filtri, footer) |

Nessuna modifica al database. I filtri sono salvati come JSON nel campo `config_json` del nodo trigger che gia supporta `jsonb`.
