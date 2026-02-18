

# WhatsApp Webhook + Embedded Signup

## Panoramica

Creare una edge function `whatsapp-webhook` per ricevere messaggi da Meta e modificare `MessagingSettingsTab` per implementare il flusso Facebook Embedded Signup nativo, salvando i dati nella tabella `messaging_whatsapp_config`.

---

## 1. Secrets necessari

Prima di procedere con il codice, servono 2 secrets:

| Secret | Dove si trova | Scopo |
|--------|---------------|-------|
| `WHATSAPP_VERIFY_TOKEN` | Stringa a scelta (es. `my-verify-token-2026`) | Meta la usa per validare il webhook |
| `META_APP_SECRET` | Meta Developer Console > App > Settings > Basic > App Secret | Firma HMAC per verificare autenticita' dei webhook |

**Nota:** Il `META_APP_ID` e' un valore pubblico e verra' inserito direttamente nel codice frontend come costante configurabile.

---

## 2. Edge Function `whatsapp-webhook`

### Funzionalita'

- **GET** (verifica webhook): Meta invia una challenge con `hub.verify_token` e la funzione risponde con `hub.challenge` se il token corrisponde
- **POST** (ricezione messaggi): Riceve i messaggi WhatsApp, verifica la firma HMAC `X-Hub-Signature-256`, e salva in DB

### Flusso POST

```text
Meta Webhook POST
    |
    v
Verifica firma HMAC (X-Hub-Signature-256 con META_APP_SECRET)
    |
    v
Estrai messaggi da payload (entry[].changes[].value.messages[])
    |
    v
Per ogni messaggio:
  1. Cerca/crea conversazione in messaging_conversations (by phone_number + company)
  2. Salva messaggio in messaging_messages
  3. Aggiorna last_message_at nella conversazione
    |
    v
Risposta 200 OK (Meta richiede risposta rapida)
```

### Identificazione company

Il webhook riceve il `phone_number_id` del numero business destinatario. La funzione cerca nella tabella `messaging_whatsapp_config` quale company e' collegata a quel `phone_number_id`.

### File

`supabase/functions/whatsapp-webhook/index.ts`

### Config

```toml
[functions.whatsapp-webhook]
verify_jwt = false
```

`verify_jwt = false` e' necessario perche' Meta non invia JWT, ma firma HMAC.

---

## 3. Edge Function `whatsapp-connect`

### Funzionalita'

Riceve i dati di ritorno dall'Embedded Signup (token temporaneo + codice) e:

1. Scambia il codice per un token permanente via Meta Graph API
2. Recupera `waba_id` e `phone_number_id` dal token
3. Salva/aggiorna il record in `messaging_whatsapp_config`
4. Registra il webhook programmaticamente (subscribe l'app al WABA)

### File

`supabase/functions/whatsapp-connect/index.ts`

### Config

```toml
[functions.whatsapp-connect]
verify_jwt = false
```

---

## 4. Modifica `MessagingSettingsTab.tsx`

### Embedded Signup

Il bottone "Collega numero WhatsApp" viene sostituito con il flusso **Facebook Login for Business** (Embedded Signup):

1. Carica l'SDK Facebook (`connect.facebook.net/it_IT/sdk.js`)
2. Inizializza `FB.init()` con il `META_APP_ID`
3. Al click del bottone, chiama `FB.login()` con config tipo `whatsapp_embedded_signup`
4. Al completamento, l'utente autorizza e il frontend riceve un `code`
5. Il frontend invia il `code` alla edge function `whatsapp-connect`
6. La funzione scambia il codice per token, recupera i dati del numero e salva tutto
7. La UI si aggiorna mostrando il numero collegato

### Nuovi elementi UI

- Indicatore di stato durante il collegamento (Loader)
- Toast di successo/errore
- Bottone "Disconnetti" per rimuovere il collegamento

---

## 5. Dettaglio tecnico

### File nuovi

| File | Descrizione |
|------|-------------|
| `supabase/functions/whatsapp-webhook/index.ts` | Webhook ricezione messaggi Meta + verifica HMAC |
| `supabase/functions/whatsapp-connect/index.ts` | Scambio token OAuth + salvataggio config |

### File modificati

| File | Modifica |
|------|----------|
| `supabase/config.toml` | Aggiunta `[functions.whatsapp-webhook]` e `[functions.whatsapp-connect]` con `verify_jwt = false` |
| `src/components/messaging/MessagingSettingsTab.tsx` | Integrazione Facebook SDK, flusso Embedded Signup, bottone connessione nativo, stati loading/success/error, bottone disconnetti |

### Nessuna modifica al database

La tabella `messaging_whatsapp_config` ha gia' tutti i campi necessari (`phone_number_id`, `waba_id`, `access_token_encrypted`, `is_connected`, etc.).

---

## 6. Sicurezza

- Webhook verificato tramite firma HMAC `X-Hub-Signature-256`
- Token Meta salvato nel campo `access_token_encrypted`
- Edge function `whatsapp-connect` richiede autenticazione utente (verifica JWT in codice)
- RLS gia' configurato sulla tabella `messaging_whatsapp_config`

