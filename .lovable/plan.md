
# Sezione Automazioni -- Builder Visuale per Flussi Automatici

## Panoramica

Nuova tab "Automazioni" nella pagina Impostazioni (`/azienda/impostazioni`), visibile solo agli admin. Permette di creare, modificare, attivare/disattivare e eliminare automazioni personalizzate con un approccio visuale a blocchi: Trigger, Condizioni, Azioni.

Le automazioni vengono valutate da un trigger PostgreSQL che, al verificarsi dell'evento, chiama una funzione database per eseguire le azioni configurate (creazione attivita, cambio stato, ecc.).

## Database

### Nuova tabella: `automations`

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| company_id | uuid NOT NULL | FK companies |
| name | text NOT NULL | Nome automazione |
| description | text | Descrizione opzionale |
| is_active | boolean | Default true |
| trigger_type | text NOT NULL | Tipo trigger (vedi sotto) |
| trigger_config | jsonb | Config specifica del trigger |
| conditions | jsonb | Array di condizioni [{field, operator, value}] |
| actions | jsonb | Array di azioni [{type, config}] |
| created_by | uuid NOT NULL | Chi l'ha creata |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

### Valori `trigger_type`

- `order_status_change` -- Cambio stato commessa
- `order_created` -- Nuova commessa creata
- `work_start_date_set` -- Data inizio lavori impostata
- `work_end_date_set` -- Data fine lavori impostata
- `payment_received` -- Pagamento ricevuto (acconto/saldo)
- `due_date_approaching` -- Scadenza in avvicinamento (cron-based, futuro)

### Struttura `conditions` (jsonb array)

```json
[
  {"field": "current_status_name", "operator": "equals", "value": "Posa Completata"},
  {"field": "total_amount", "operator": "greater_than", "value": 5000}
]
```

### Struttura `actions` (jsonb array)

```json
[
  {
    "type": "create_task",
    "config": {
      "title": "Verificare materiali per posa",
      "notes": "Controllare che tutto sia pronto",
      "priority": "alta",
      "category": "ordini",
      "assigned_to_role": "specific_user",
      "assigned_to_id": "uuid-utente",
      "due_date_offset_days": -5,
      "due_date_reference": "work_start_date"
    }
  },
  {
    "type": "change_order_status",
    "config": {
      "target_status_id": "uuid-stato"
    }
  }
]
```

### Tipi di azione supportati

- `create_task` -- Crea attivita con titolo, assegnatario, scadenza relativa
- `change_order_status` -- Cambia stato commessa
- `create_reminder` -- Crea promemoria (attivita con scadenza futura)

Nota: "Invio email" e "Invio notifica interna" sono predisposti nella struttura ma implementati come mock (coerente con il vincolo email del progetto).

### RLS Policies

- Company admin: ALL dove `company_id = get_user_company_id(auth.uid())`
- Super admin: ALL
- Staff con `can_view_settings`: SELECT

### Funzione database: `execute_automation`

Funzione PL/pgSQL `SECURITY DEFINER` che:
1. Riceve `trigger_type`, `order_id`, `company_id` come parametri
2. Cerca automazioni attive per quel company_id e trigger_type
3. Valuta le condizioni contro i dati dell'ordine
4. Esegue le azioni (INSERT in tasks, UPDATE su orders)

### Trigger database

Trigger su tabella `orders` (AFTER UPDATE) e `order_status_history` (AFTER INSERT) che invoca `execute_automation` quando:
- `current_status_id` cambia (trigger_type = `order_status_change`)
- `work_start_date` viene impostato (trigger_type = `work_start_date_set`)
- `work_end_date` viene impostato (trigger_type = `work_end_date_set`)

Trigger su `orders` (AFTER INSERT) per `order_created`.

## Componenti Frontend

### File da creare

```
src/components/settings/AutomationsConfig.tsx     -- Tab principale con lista automazioni
src/components/settings/AutomationDialog.tsx       -- Dialog per creare/modificare automazione
src/components/settings/AutomationActionBlock.tsx  -- Blocco singola azione nel builder
```

### File da modificare

```
src/pages/azienda/Settings.tsx  -- Aggiunta tab "Automazioni" (solo admin)
```

### UI della Tab "Automazioni"

**Lista automazioni** (vista principale):
- Card per ogni automazione con nome, trigger, numero azioni, toggle attiva/disattiva
- Pulsante "Nuova Automazione"
- Stato vuoto con CTA

**Dialog creazione/modifica** (builder visuale):

Layout a blocchi verticali con connettori visivi:

```text
[QUANDO] -- Blocco Trigger
    |
[SE]     -- Blocco Condizioni (opzionale, aggiungibili)
    |
[ALLORA] -- Blocco Azioni (1 o piu, aggiungibili)
```

1. **Blocco QUANDO (Trigger)**
   - Select con trigger disponibili
   - Config specifica per trigger (es. quale stato per `order_status_change`)

2. **Blocco SE (Condizioni)** -- opzionale
   - Pulsante "+ Aggiungi condizione"
   - Per ogni condizione: campo, operatore, valore
   - Campi disponibili: stato commessa, importo, tipo pagamento, cliente

3. **Blocco ALLORA (Azioni)**
   - Pulsante "+ Aggiungi azione"
   - Per ogni azione: tipo azione + config specifica
   - `create_task`: titolo, note, priorita, assegnatario, scadenza relativa
   - `change_order_status`: stato target
   - `create_reminder`: titolo, giorni offset

### Dettaglio modifica Settings.tsx

- Aggiungere import `Zap` da lucide-react e `AutomationsConfig`
- Aggiungere TabsTrigger "Automazioni" nella sezione admin (dopo "Attivita")
- Aggiungere TabsContent con `<AutomationsConfig />`
- Aggiornare grid-cols da 9 a 10 per admin

## UX

- Builder a blocchi con icone e colori per ogni tipo (blu trigger, giallo condizione, verde azione)
- Toggle attiva/disattiva inline nella lista
- Feedback immediato su salvataggio
- Linguaggio semplice: "Quando", "Se", "Allora"
- Scadenza relativa spiegata in linguaggio naturale ("5 giorni prima della data di inizio lavori")
- Card azione con preview del risultato ("Crea attivita 'Verifica materiali' assegnata a Mario Rossi")

## Note Tecniche

- La funzione `execute_automation` usa `SECURITY DEFINER` per poter inserire tasks e aggiornare ordini senza dipendere dall'utente che ha triggerato l'evento
- Il `created_by` delle task create automaticamente viene impostato al `created_by` dell'automazione
- Le condizioni usano operatori semplici: `equals`, `not_equals`, `greater_than`, `less_than`, `contains`
- La valutazione delle condizioni avviene in PL/pgSQL per performance e atomicita
- Il trigger su `orders` controlla `OLD vs NEW` per determinare quale campo e' cambiato
