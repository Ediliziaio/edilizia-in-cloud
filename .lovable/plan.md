

# Messaggistica (BETA) - Modulo Isolato con AI

## Panoramica

Nuovo modulo "Messaggistica (BETA)" nella sidebar dell'area azienda, con route dedicata `/azienda/messaggistica-beta`. Il modulo e' isolato, controllato da feature flag (`messaging_beta_enabled` nella tabella `companies`), e non interferisce con il sistema esistente.

Per ora WhatsApp non sara' collegato. L'interfaccia permettera' di simulare conversazioni e testare il flusso AI completo. Quando le credenziali Meta saranno pronte, bastera' attivare il webhook.

---

## Database

### 1. Feature Flag

Aggiungere colonna `messaging_beta_enabled` (boolean, default false) alla tabella `companies`.

### 2. Nuove Tabelle

**`messaging_conversations`**

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| company_id | uuid NOT NULL | FK companies |
| phone_number | text | Numero telefono contatto |
| contact_name | text | Nome contatto |
| contact_type | text NOT NULL | 'cliente', 'operaio', 'collaboratore', 'sconosciuto' |
| status | text NOT NULL | 'da_gestire', 'in_lavorazione', 'risolto' (default 'da_gestire') |
| is_urgent | boolean | Default false |
| linked_entity_type | text | 'order', 'customer', 'employee' |
| linked_entity_id | uuid | ID entita' collegata |
| last_message_at | timestamptz | Per ordinamento |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

**`messaging_messages`**

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| conversation_id | uuid NOT NULL | FK messaging_conversations |
| sender_type | text NOT NULL | 'contact', 'operator', 'system' |
| sender_name | text | Nome mittente |
| message_type | text NOT NULL | 'text', 'audio', 'image', 'document' |
| content | text | Testo messaggio |
| media_url | text | URL file media |
| transcription | text | Trascrizione audio |
| ai_processed | boolean | Default false |
| created_at | timestamptz | Default now() |

**`messaging_ai_runs`**

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| message_id | uuid NOT NULL | FK messaging_messages |
| company_id | uuid NOT NULL | FK companies |
| raw_input | text | Testo analizzato |
| ai_output | jsonb | Output JSON strutturato |
| confidence | numeric | 0-1 |
| intent | text | Intent rilevato |
| status | text | 'pending', 'completed', 'confirmed', 'ignored' |
| created_actions | jsonb | Azioni create (task IDs, ecc.) |
| confirmed_by | uuid | Chi ha confermato |
| confirmed_at | timestamptz | Quando confermato |
| created_at | timestamptz | Default now() |

**`messaging_daily_reports`**

| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | gen_random_uuid() |
| company_id | uuid NOT NULL | FK companies |
| order_id | uuid | FK orders (cantiere) |
| report_date | date NOT NULL | Data report |
| description | text | Testo report |
| work_done | jsonb | Lavori svolti (array) |
| work_planned | jsonb | Lavori previsti (array) |
| materials_used | jsonb | Materiali usati (array) |
| source_message_id | uuid | FK messaging_messages |
| created_at | timestamptz | Default now() |

### 3. RLS Policies

Per tutte e 4 le tabelle:
- Company admin: ALL con filtro `company_id = get_user_company_id(auth.uid())`
- Super admin: ALL
- Staff con `can_view_orders`: SELECT (solo lettura)

### 4. Realtime

Abilitare realtime su `messaging_messages` e `messaging_conversations` per aggiornamenti live.

---

## Backend (Edge Function)

### `analyze-message` Edge Function

Riceve un messaggio e usa Lovable AI (google/gemini-3-flash-preview) per:

1. **Entity Recognition**: identifica cliente, cantiere, ordine, materiale
2. **Intent Detection**: classifica il messaggio (problema cantiere, materiale mancante, report lavoro, aggiornamento stato, urgenza, altro)
3. **Output strutturato**: restituisce JSON con matched_entity, intent, priority, summary, action_suggestions

Il prompt di sistema includera' il contesto dell'azienda (lista ordini, clienti, dipendenti) per migliorare il matching.

L'edge function:
- Riceve `{ message_id, company_id }`
- Recupera il messaggio dal DB
- Carica contesto aziendale (ordini attivi, clienti, dipendenti)
- Chiama Lovable AI con tool calling per output strutturato
- Salva risultato in `messaging_ai_runs`
- Aggiorna `ai_processed = true` sul messaggio

---

## Frontend

### File da Creare

```
src/pages/azienda/MessagingBeta.tsx          -- Pagina principale a 3 colonne
src/components/messaging/ConversationList.tsx  -- Colonna sinistra: lista conversazioni
src/components/messaging/ChatView.tsx          -- Colonna centrale: chat WhatsApp-style
src/components/messaging/AiPanel.tsx           -- Colonna destra: pannello AI
src/components/messaging/MessageBubble.tsx     -- Singola bubble messaggio
src/components/messaging/SimulateMessageDialog.tsx -- Dialog per simulare messaggi in arrivo
src/hooks/useMessagingData.ts                  -- Hook per dati e realtime
```

### File da Modificare

```
src/components/layouts/CompanyLayout.tsx  -- Aggiungere voce sidebar "Messaggistica (BETA)"
src/App.tsx                               -- Aggiungere route /azienda/messaggistica-beta
```

### Layout Pagina (3 Colonne)

```text
+-------------------+------------------------+-------------------+
| CONVERSAZIONI     | CHAT                   | AI PANEL          |
|                   |                        |                   |
| [Filtri]          | [Header contatto]      | Entita' trovata   |
| [Tutte]           |                        | Confidence: 87%   |
| [Clienti]         | [Bubble msg]           | Intent: problema  |
| [Operai]          | [Bubble msg]           |                   |
| [Collaboratori]   | [Bubble msg audio]     | Azioni suggerite: |
| [Non assegnate]   |                        | [Crea task]       |
| [Urgenti]         | [Input risposta]       | [Ignora]          |
|                   |                        | [Modifica]        |
| [Conv 1]          |                        |                   |
| [Conv 2]          |                        |                   |
| [Conv 3]          |                        |                   |
+-------------------+------------------------+-------------------+
```

### Sidebar

Nuova voce nella sidebar del CompanyLayout, prima di "Impostazioni":
- Icona: `MessageSquare` da lucide-react
- Testo: "Messaggistica"
- Badge: "BETA" in arancione
- Visibile solo se `messaging_beta_enabled = true` sulla company

### Simulazione Messaggi

Poiche' WhatsApp non e' ancora collegato, un pulsante "Simula Messaggio" permette di inserire manualmente:
- Tipo contatto (cliente/operaio/collaboratore)
- Nome e numero
- Tipo messaggio (testo/audio)
- Contenuto
- Il messaggio viene salvato nel DB e processato dall'AI come se fosse arrivato da WhatsApp

### Pannello AI

Per ogni messaggio selezionato con `ai_processed = true`:
- Mostra entita' trovata con badge confidence (verde >80%, giallo 50-80%, rosso <50%)
- Intent rilevato con icona
- Summary generato
- Azioni suggerite con pulsanti:
  - **Conferma**: esegue l'azione (crea task, cambia stato, crea report)
  - **Modifica**: permette di cambiare associazione prima di confermare
  - **Ignora**: marca come ignorato

### Conferma Azione

Quando l'utente clicca "Conferma" su un'azione suggerita:
- Se tipo = `create_task`: inserisce nella tabella `tasks` con i dati suggeriti
- Se tipo = `create_daily_report`: inserisce in `messaging_daily_reports`
- Se tipo = `change_order_status`: aggiorna l'ordine
- Registra l'azione in `messaging_ai_runs.created_actions`
- Aggiorna stato AI run a 'confirmed'

---

## Permessi e Sicurezza

- Solo admin puo' attivare/disattivare il feature flag
- Tutte le azioni AI sono tracciate in `messaging_ai_runs`
- Le azioni create da AI sono sempre reversibili (task eliminabili, stati ripristinabili)
- Soglia confidence visibile: sopra 80% suggerisce automaticamente, sotto richiede conferma manuale
- Audit trail completo: chi ha confermato, quando, cosa e' stato creato

---

## Isolamento e Disattivazione

- Se `messaging_beta_enabled = false`: la voce sidebar scompare, la route mostra "Modulo non attivo"
- Nessuna dipendenza hard sugli altri moduli
- Le tabelle DB sono dedicate e non hanno FK verso tabelle core (tranne `orders`, `companies`)
- Disattivare il modulo non causa errori in nessun'altra parte del sistema

---

## Riepilogo Deliverable

| Elemento | Dettaglio |
|----------|-----------|
| Route | `/azienda/messaggistica-beta` |
| Sidebar | Voce con badge BETA, controllata da feature flag |
| UI | 3 colonne: conversazioni, chat, pannello AI |
| AI | Lovable AI (gemini-3-flash-preview) via edge function |
| Simulazione | Dialog per simulare messaggi in arrivo |
| Azioni AI | Crea task, report giornaliero, cambia stato ordine |
| Confidence | Badge visuale con soglia 80% per auto-suggest |
| DB | 4 nuove tabelle + 1 colonna feature flag |
| Realtime | Su messaggi e conversazioni |
| Isolamento | Feature flag, nessuna dipendenza hard |

