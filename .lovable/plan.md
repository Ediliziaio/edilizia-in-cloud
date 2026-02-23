

# Configurazione Avanzata Azioni (Action Nodes) - Stile GoHighLevel

## Stato attuale

I 3 fix di stabilizzazione del Condition Builder sono gia applicati e funzionanti. Il sistema trigger e completo al 100%.

Il pannello di configurazione delle azioni (nodi `action`) e attualmente minimale: un campo disabilitato per il tipo e pochi input basici. Serve una ristrutturazione completa per portarlo al livello del trigger config.

## Cosa cambia

### 1. Pannello Action Config in stile GHL (`AutomationNodeConfig.tsx`)

Il pannello delle azioni deve diventare simile a quello dei trigger:
- Larghezza aumentata da `w-80` a `w-[420px]`
- Header con icona azione + titolo + bottone chiudi
- Descrizione dell'azione selezionata (testo grigio sotto l'header)
- Sezioni raggruppate con Separator
- Footer con "Annulla" + "Salva azione"
- Validazione obbligatoria prima del salvataggio

### 2. Configurazione dettagliata per ogni tipo di azione

#### Comunicazione

**Invia Email** (`send_email`):
- Template email: Select che carica template da `marketing_email_templates` (se tabella esiste)
- Oggetto email: Input testo con placeholder per variabili (es. `{{contact.name}}`)
- Corpo personalizzato: Textarea con note per override
- Mittente: Input email (opzionale)
- Checkbox "Traccia apertura" e "Traccia click"

**Invia WhatsApp** (`send_whatsapp`):
- Template WhatsApp: Select
- Testo messaggio: Textarea con variabili disponibili
- Tipo contenuto: Select (testo/immagine/documento)

**Invia SMS** (`send_sms`):
- Testo SMS: Textarea con contatore caratteri (160 char limit visual)
- Nota mittente: Input

**Invia Notifica** (`send_notification`):
- Titolo: Input
- Messaggio: Textarea
- Destinatario: UserSelect (utente assegnato / utente specifico / tutti admin)

**Invia Messaggio AI** (`send_ai_message`):
- Prompt AI: Textarea con suggerimenti
- Canale invio: Select (Email / WhatsApp / SMS)
- Tono: Select (Professionale / Amichevole / Formale)
- Lingua: Select (Italiano / Inglese)
- Lunghezza max: Input numero

#### CRM

**Crea Opportunita** (`create_opportunity`):
- Nome opportunita: Input (supporta variabili)
- Pipeline: Select (caricato da DB `marketing_pipelines`)
- Fase iniziale: Select (caricato da `marketing_pipeline_stages` filtrato per pipeline)
- Valore: Input numerico
- Assegna a: UserSelect
- Tag: TagMultiSelect

**Sposta Opportunita** (`move_opportunity`):
- Pipeline destinazione: Select
- Fase destinazione: Select
- Stato: Select (Aperta / Vinta / Persa)

**Aggiorna Campo** (`update_field`):
- Entita: Select (Contatto / Opportunita)
- Campo: Select dinamico (campi standard + custom fields)
- Valore: Input dinamico in base al tipo campo

**Aggiungi/Rimuovi Tag** (`add_tag` / `remove_tag`):
- Tag: TagMultiSelect (caricato da `marketing_tags`)

**Assegna Utente** (`assign_user`):
- Utente: UserSelect
- Metodo: Select (Specifico / Round Robin)

**Crea Attivita** (`create_task`):
- Titolo: Input
- Descrizione: Textarea
- Priorita: Select (Bassa / Normale / Alta / Urgente)
- Assegna a: UserSelect
- Scadenza: Select (Immediata / +1 giorno / +3 giorni / +7 giorni / Data specifica)
- Data specifica: DatePicker (se scadenza = "Data specifica")

#### Logica

**Attendi (Delay)** (`delay`):
- Gia implementato, aggiungere solo descrizione

**If/Else** (`if_else`):
- Condizione: riutilizzare il TriggerConditionBuilder per definire la condizione

**Split Percentuale** (`split_percentage`):
- Gia implementato, aggiungere etichette rami A/B

**Obiettivo (Goal)** (`goal`):
- Condizione obiettivo: Textarea
- Timeout: Input numero + Select unita

**Salta a Step** (`jump_to_step`):
- Nodo destinazione: Select con lista di tutti i nodi del flusso (non piu input testo libero)

**Termina Automazione** (`end_automation`):
- Nessuna configurazione extra, solo descrizione

#### Integrazione

**Webhook Uscita** (`webhook_out`):
- URL: Input con validazione URL
- Metodo: Select (GET / POST / PUT / DELETE)
- Headers: Textarea JSON
- Body template: Textarea JSON con variabili

**API Esterna** (`external_api`):
- Gia presente, aggiungere Headers e Body

**Sync Google/Meta** (`sync_google` / `sync_meta_lead`):
- Account: Select (placeholder per futura integrazione)
- Azione: Select specifico per piattaforma

### 3. Descrizioni per ogni azione (`automationBuilder.ts`)

Aggiungere un oggetto `ACTION_DESCRIPTIONS` simile a `TRIGGER_DESCRIPTIONS`:

```
send_email: "Invia un'email personalizzata al contatto utilizzando un template o contenuto personalizzato."
send_whatsapp: "Invia un messaggio WhatsApp al contatto."
add_tag: "Aggiunge uno o piu tag al contatto nell'automazione."
create_opportunity: "Crea una nuova opportunita nella pipeline selezionata."
// ecc.
```

### 4. Validazione azioni al salvataggio

Funzione `validateAction(config_json)` che verifica:
- send_email: oggetto o template obbligatorio
- send_sms: testo obbligatorio
- add_tag / remove_tag: almeno un tag
- create_opportunity: nome e pipeline obbligatori
- webhook_out: URL obbligatorio e formato valido
- create_task: titolo obbligatorio
- Mostrare errori con bordo rosso + toast

### 5. Componenti riutilizzati

- `TagMultiSelect` e `UserSelect` da `ConditionValueInput.tsx`: estrarre come componenti condivisi o riutilizzare importando il file
- `DatePickerInput`: riutilizzare per date nelle azioni

## Dettaglio tecnico per file

| File | Operazione | Descrizione |
|------|------------|-------------|
| `src/types/automationBuilder.ts` | Modifica | Aggiungere ACTION_DESCRIPTIONS, tipo ActionValidationErrors |
| `src/components/marketing/automations/AutomationNodeConfig.tsx` | Modifica | Ristrutturare sezione action con pannello w-[420px], header/footer GHL, config dettagliata per ogni tipo azione, validazione |
| `src/components/marketing/automations/AutomationBuilder.tsx` | Modifica | Passare lista `nodes` al config panel per il select "Salta a step" |

Nessun file nuovo. Nessuna modifica al database. I dati per pipeline, tag e utenti sono caricati dalle tabelle esistenti.

