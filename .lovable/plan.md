
# Redesign Messaggistica + Tab Impostazioni WhatsApp Business

## 1. Redesign grafico della pagina Messaggistica

Basandomi sugli screenshot forniti (stile "Casella di posta del team"), la pagina viene trasformata con:

### Layout principale con Tabs

La pagina avra' due tab principali in alto:
- **Messaggi** (inbox attuale con conversazioni + chat + AI panel)
- **Impostazioni** (configurazione WhatsApp Business)

### Tab Messaggi - Restyling

```text
+-----------------------------------------------------------------------+
| Messaggistica [BETA]                                                   |
| [Messaggi]  [Impostazioni]                                            |
+-----------------------------------------------------------------------+
| Casella di posta del team                                              |
| [Non letto] [Tutto] [Recenti]  | Nome Contatto              tel/star |
+-----------------------------------+-----------------------------------|
| [ ] Alfina Schillaci    Feb 17 1  | Bubble messaggio ricevuto...      |
|     Vorrei sapere dei prezzi      |                                   |
| [ ] Manuela Berto       Feb 17 1  | Bubble risposta operatore...      |
| [ ] Fabio M. Di Paola   Feb 17 1  |                                   |
|                                   | [Digita un messaggio...]    [>]   |
+-----------------------------------+-----------------------------------+
```

Modifiche al ConversationList:
- Header "Casella di posta del team" con icone toolbar
- Filtri semplificati: "Non letto", "Tutto", "Recenti" + icona stella
- Avatar con iniziali colorate per ogni contatto
- Badge contatore messaggi non letti
- Preview ultimo messaggio sotto al nome

Modifiche al ChatView:
- Header con nome contatto + icone azione (telefono, stella, etc.)
- Input in basso con placeholder "Digita un messaggio..."
- Stile bubble piu' simile a WhatsApp (verde chiaro per operatore, bianco per contatto)

### Tab Impostazioni - WhatsApp Business

Una sezione dedicata alla configurazione dell'integrazione WhatsApp Business, simile agli screenshot forniti.

```text
+-----------------------------------------------------------------------+
| WhatsApp Business                                                      |
|                                                                        |
| [!] Verifica di WhatsApp Business in sospeso                          |
|     Costruisci fiducia con un nome verificato...                      |
|     [Verifica ora ->]                                                  |
|                                                                        |
| Nome Azienda                                                           |
| Stato dell'account: [Approvato] | Verifica Meta Business              |
| +---------------------------+  +---------------------------+          |
| | Messaggi inviati (7gg)   |  | Messaggi consegnati (7gg)|          |
| | 232                       |  | 231                      |          |
| +---------------------------+  +---------------------------+          |
|                                                                        |
| [Numeri]  [Modelli]  [Flussi]                                         |
|                                                                        |
| Numero di telefono  (1 Numeri)                                        |
| +----+----------+--------+----------+--------+---------+             |
| | Num| Nome     | Limite | Stato    | Qualita| Attivita|             |
| | 351| BeMade   | -      | Collegato| Nessuno| Gestisci|             |
| +----+----------+--------+----------+--------+---------+             |
|                                                                        |
| [Collega numero WhatsApp]  --> apre Facebook Login                    |
+-----------------------------------------------------------------------+
```

---

## 2. Dettaglio tecnico

### Nuova tabella database

**`messaging_whatsapp_config`** - Salva la configurazione WhatsApp per ogni azienda

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| id | uuid PK | |
| company_id | uuid FK -> companies | Unica per azienda |
| phone_number | text | Numero collegato |
| phone_number_id | text | ID numero WhatsApp API |
| waba_id | text | WhatsApp Business Account ID |
| business_name | text | Nome business su WhatsApp |
| account_status | text | verified/pending/not_verified |
| quality_rating | text | green/yellow/red/none |
| is_connected | boolean | Se il numero e' collegato |
| access_token_encrypted | text | Token Meta (criptato) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: solo utenti della stessa azienda con permesso `can_manage_settings` possono leggere/scrivere.

### Nuovi file

| File | Descrizione |
|------|-------------|
| `src/components/messaging/MessagingSettingsTab.tsx` | Tab impostazioni WhatsApp Business con card stato account, numeri, modelli, bottone collegamento Facebook |

### File modificati

| File | Modifica |
|------|----------|
| `src/pages/azienda/MessagingBeta.tsx` | Aggiunta Tabs (Messaggi / Impostazioni) che wrappano il contenuto attuale e la nuova tab |
| `src/components/messaging/ConversationList.tsx` | Restyling: header "Casella di posta del team", avatar con iniziali, filtri "Non letto/Tutto/Recenti", preview ultimo messaggio |
| `src/components/messaging/ChatView.tsx` | Restyling header con icone azione, bubble colors piu' WhatsApp-like |
| `src/components/messaging/MessageBubble.tsx` | Colori bubble aggiornati (verde chiaro per operatore) |

### Logica collegamento WhatsApp

Il bottone "Collega numero WhatsApp" nella tab Impostazioni:
1. Apre una finestra popup verso l'URL di Facebook Login/OAuth per WhatsApp Business
2. L'utente completa il flusso di autorizzazione su Facebook
3. Al ritorno, un webhook/callback salva il token e i dati nella tabella `messaging_whatsapp_config`
4. La UI si aggiorna mostrando lo stato "Collegato" con i dati del numero

Per ora (Fase 1), il bottone apre il link diretto a Facebook Business (`https://business.facebook.com/latest/whatsapp_manager/`) con istruzioni su come ottenere le credenziali API. L'integrazione automatica OAuth verra' completata in una fase successiva quando saranno configurate le credenziali Meta App.

### Nessuna modifica a file esistenti non elencati

Il modulo resta completamente isolato e disattivabile.
