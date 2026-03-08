

## Verifica Completa Modulo WhatsApp — Risultati

Ho analizzato tutti i file implementati nelle 3 fasi precedenti confrontandoli con le specifiche Meta Cloud API v21.0. Ecco lo stato attuale:

### Stato Implementazione

| # | Punto | Stato | Note |
|---|-------|-------|------|
| 1 | ChatView invio reale | **Fatto** | Usa `send-whatsapp-reply` edge function |
| 2 | Automazioni send_whatsapp | **Fatto** | `executeSendWhatsApp` implementato con decryption |
| 3 | Broadcast backend | **Fatto** | Edge function + tabelle + UI storico |
| 4 | Template Meta | **Fatto** | Tab Template con list/create/delete |
| 5 | Media multimediali | **Fatto** | `sendWhatsApp` supporta image/document/audio |
| 6 | Delivery receipts | **Bug critico** | Webhook ha errore di sintassi |
| 7 | DB/Types | **OK** | Migration applicata, config.toml completo |

---

### BUG CRITICO TROVATO: Webhook malformato

**File**: `supabase/functions/whatsapp-webhook/index.ts` linee 78-109

Il loop `for (const status of statuses)` (riga 80) **non viene mai chiuso con `}`**. Il codice che processa i messaggi in entrata (righe 109-221) finisce dentro il loop degli status, causando:

1. Se arriva un webhook con `statuses` ma senza `messages`, il `continue` a riga 109 salta al prossimo status (corretto per caso)
2. Se arriva un webhook con `messages` E `statuses`, il processing dei messaggi viene eseguito N volte (una per ogni status), creando **messaggi duplicati**
3. Se arriva un webhook solo con `messages` (nessuno status), il loop `for (const status of statuses)` non esegue mai, quindi **i messaggi in entrata vengono completamente ignorati**

Questo e il punto 3 il bug piu grave: con l'array `statuses` vuoto, il `for` non itera mai, e tutto il codice di processing messaggi e dentro quel loop.

**Fix**: Chiudere il `for (const status of statuses)` con `}` prima di riga 109, e ri-indentare il blocco messaggi fuori dal loop statuses.

### Conformita Meta API v21.0

- Endpoint: `https://graph.facebook.com/v21.0/` — Confermato come versione stabile corrente
- Template payload: formato corretto (`messaging_product`, `type: "template"`, `template.name`, `template.language.code`)
- HMAC verification: corretto con `sha256=` prefix
- Webhook verification: corretto (`hub.mode`, `hub.verify_token`, `hub.challenge`)

### Piano di Fix

Un solo intervento necessario:

**`supabase/functions/whatsapp-webhook/index.ts`**: Ristrutturare il POST handler per separare correttamente il loop degli status dal processing dei messaggi. Il closing `}` del `for (const status of statuses)` deve essere posizionato dopo riga 107, prima del check `if (!value?.messages)`.

