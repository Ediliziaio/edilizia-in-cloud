

## Piano: WhatsApp Marketing — Fix bug critici e funzionalità incomplete

Questo piano e molto ampio (7 punti). Propongo di suddividerlo in **3 fasi** per mantenere stabilita tra una modifica e l'altra.

---

### FASE 1 — Bug critici (da implementare subito)

#### 1. ChatView: invio reale messaggi WhatsApp
**Problema**: `handleSendReply` salva solo nel DB, non invia via Meta API.

**Soluzione**: La conversazione non ha `contact_id` — ha `phone_number` e `linked_entity_id`. Serve un approccio ibrido:
- Se `conversation.linked_entity_id` esiste (contatto CRM collegato), usare `send-contact-message` con quel `contact_id`
- Altrimenti, inviare direttamente via Meta API recuperando le credenziali WhatsApp dalla `messaging_whatsapp_config` tramite una **nuova edge function** `send-whatsapp-reply` che accetta `conversation_id` + `content` e:
  1. Recupera la conversazione per ottenere `phone_number` e `company_id`
  2. Recupera `phone_number_id` e `access_token_encrypted` dalla config WhatsApp
  3. Decripta il token, invia via Meta API
  4. Salva il messaggio in `messaging_messages`
  5. Restituisce il `meta_message_id`

**File modificati**:
- `src/components/messaging/ChatView.tsx` — sostituire insert diretto con `supabase.functions.invoke("send-whatsapp-reply")`
- `supabase/functions/send-whatsapp-reply/index.ts` — nuova edge function
- `supabase/config.toml` — aggiungere entry per la nuova funzione

#### 2. Automazioni send_whatsapp: implementazione reale
**Problema**: Il case `send_whatsapp` in `process-automation` e uno stub con placeholder.

**Soluzione**: Implementare il case reale nel file `process-automation/index.ts`:
- Recuperare `messaging_whatsapp_config` per company (usando `is_connected = true`)
- Decriptare `access_token_encrypted`
- Recuperare telefono del contatto da `marketing_contacts`
- Se `cfg.whatsapp_template` → inviare template; altrimenti → testo libero
- Salvare in `contact_messages`
- Separare `send_whatsapp` dagli altri case stub (`send_sms`, `send_ai_message`)

**File modificato**: `supabase/functions/process-automation/index.ts`

---

### FASE 2 — Delivery receipts e media

#### 3. Delivery receipts nel webhook
**Migrazione DB**: Aggiungere colonne a `messaging_messages`:
- `delivery_status TEXT DEFAULT 'sent'`
- `meta_message_id TEXT`
- `delivered_at TIMESTAMPTZ`
- `read_at TIMESTAMPTZ`

**File modificato**: `supabase/functions/whatsapp-webhook/index.ts` — gestire `value.statuses`

**File modificato**: `src/components/messaging/MessageBubble.tsx` — aggiungere icone stato (spunte singole/doppie/blu)

#### 4. Invio messaggi multimediali
**File modificato**: `supabase/functions/send-contact-message/index.ts` — estendere `sendWhatsApp` per supportare `contentType` (image, document, audio) con `mediaUrl`

---

### FASE 3 — Broadcast e Template (funzionalita nuove)

#### 5. Broadcast WhatsApp
**Migrazione DB**: Creare tabelle `whatsapp_broadcasts` e `whatsapp_broadcast_recipients` con RLS

**Nuova edge function**: `supabase/functions/whatsapp-broadcast/index.ts`

**File modificato**: `src/components/marketing/whatsapp/WhatsAppBroadcastTab.tsx` — collegare al backend + storico

#### 6. Gestione Template Meta
**Nuova edge function**: `supabase/functions/whatsapp-templates/index.ts` — proxy verso Meta API per list/create/delete template

**Nuova tab**: Componente `WhatsAppTemplatesTab.tsx` + aggiunta in `MarketingWhatsApp.tsx`

---

### Note tecniche importanti

- La tabella `messaging_whatsapp_config` usa `access_token_encrypted` (non `access_token`) e `is_connected` (non `is_active`). La edge function `send-contact-message` fa `.eq("is_active", true)` che probabilmente non funziona — va corretto in `.eq("is_connected", true)`.
- La tabella `messaging_conversations` NON ha `contact_id` — ha `phone_number` e opzionalmente `linked_entity_id`/`linked_entity_type`.
- Il punto 7 (types.ts) si risolve automaticamente: le tabelle esistono gia nel DB (sono gia nei types), le nuove tabelle verranno aggiunte dalle migrazioni.

### Proposta di esecuzione

Data la complessita, suggerisco di procedere con la **Fase 1** (i 2 bug critici) per prima. Confermi di procedere con tutte e 3 le fasi, oppure preferisci iniziare dalla Fase 1?

