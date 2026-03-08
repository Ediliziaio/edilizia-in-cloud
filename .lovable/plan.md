

# Piano: Integrazione Telnyx — Telefonia Completa

Analisi del documento caricato e verifica rispetto al codice attuale.

---

## Stato attuale — Gap confermati

| Gap | Dettaglio |
|-----|-----------|
| **Nessun codice Telnyx** | Zero riferimenti a "telnyx" nel codebase |
| **SMS stub** | `send-contact-message`: case `sms` → `status = "pending"`, nessun invio |
| **SMS automazioni** | `process-automation`: nessun case `send_sms` trovato |
| **PhoneNumberManager** | UI presente, pulsante "Acquista" mostra solo toast placeholder |
| **ai-outbound-call** | Esiste ma usa endpoint Twilio (`/convai/twilio/outbound-call`), non Telnyx |
| **elevenlabs-proxy** | Nessun case `link_phone_number` |
| **PlatformSettingsPage** | Nessuna sezione credenziali Telnyx |
| **Tabelle DB** | `telnyx_settings` e `sms_logs` non esistono, `ai_agent_phone_numbers` manca colonne Telnyx |

---

## Implementazione in 3 fasi

### Fase A — P0: Database + Edge Functions core

**FIX 1 — Migration SQL**
- Creare tabella `telnyx_settings` (api_key_encrypted, messaging_profile_id, connection_id, webhook_signing_secret_encrypted, is_active) con RLS super_admin only (usando `has_role`)
- Aggiungere colonne a `ai_agent_phone_numbers`: `telnyx_phone_id`, `elevenlabs_phone_number_id`, `monthly_cost_eur`, `capabilities` (jsonb), `telnyx_connection_id`, `is_inbound_enabled`, `is_outbound_enabled`
- Creare tabella `sms_logs` (company_id, contact_id, direction, from_number, to_number, body, status, telnyx_message_id, cost_eur, automation_id) con RLS tenant isolation

**FIX 2 — Edge Function `telnyx-proxy/index.ts`** (nuova)
- Azioni: `list_available_numbers`, `buy_number`, `list_numbers`, `release_number`, `send_sms`, `get_sms_status`
- Auth utente + caricamento API key da `telnyx_settings` + decrypt via `_shared/encryption.ts`
- Ogni azione chiama `api.telnyx.com/v2/*` e persiste risultati in DB

**FIX 3 — Edge Function `telnyx-webhook/index.ts`** (nuova)
- `verify_jwt = false` in config.toml
- Verifica firma HMAC `telnyx-signature-v1`
- Gestisce: `message.finalized` (aggiorna sms_logs), `message.received` (salva SMS inbound), `call.initiated` / `call.hangup` (log chiamate)

**FIX 4 — Edge Function `initiate-outbound-call/index.ts`** (nuova, sostituisce `ai-outbound-call`)
- Stessa logica di auth, DND check, credit check e subscription check
- Usa `elevenlabs_phone_number_id` da `ai_agent_phone_numbers` (non Twilio)
- Chiama ElevenLabs `POST /convai/agents/{id}/outbound-call` con `agent_phone_number_id` Telnyx
- Salva conversazione con `direction: 'outbound'`

**FIX 5 — Fix `send-contact-message/index.ts`**
- Sostituire case `sms` stub (`status = "pending"`) con chiamata a `telnyx-proxy` action `send_sms`

**FIX 6 — Fix `process-automation/index.ts`**
- Aggiungere case `send_sms` che invoca `telnyx-proxy` con action `send_sms` (attualmente non esiste)

### Fase B — P1: UI + ElevenLabs link

**FIX 7 — `PlatformSettingsPage.tsx`: Sezione Telnyx**
- Nuova card "Telefonia (Telnyx)" con campi: API Key (password), Messaging Profile ID, Connection ID, Webhook Signing Key (password), toggle is_active
- Pulsante "Testa connessione" → chiama `telnyx-proxy` action `list_numbers`
- Salvataggio in `telnyx_settings` con encrypt via edge function

**FIX 8 — `PhoneNumberManager.tsx`: UI completa**
- Riscrittura: tabella con colonne Numero, Label, Agente, Costo/mese, Stato, Azioni
- Modale "Acquista numero": ricerca per prefisso italiano via `telnyx-proxy` → `list_available_numbers`, selezione, conferma acquisto
- Azioni riga: collega a ElevenLabs (`elevenlabs-proxy` link_phone_number), scollega agente, rimuovi numero

**FIX 9 — Outbound call UI update**
- Aggiornare `ContactActionsTab.tsx` per usare `initiate-outbound-call` al posto di `ai-outbound-call`
- Aggiungere selezione numero Telnyx se l'agente ne ha multipli

**FIX 10 — `elevenlabs-proxy/index.ts`: case `link_phone_number`**
- Chiama ElevenLabs `POST /convai/phone-numbers/create` con provider=telnyx, telnyx_api_key, telnyx_connection_id
- Aggiorna `ai_agent_phone_numbers.elevenlabs_phone_number_id`

### Fase C — Secrets

Prima di procedere con le edge functions, servono i seguenti secret:
- `TELNYX_WEBHOOK_SIGNING_KEY` — per verifica firma webhook
- Le credenziali API Telnyx vengono salvate cifrate in DB (non come secret), stessa architettura di WhatsApp

---

## File da creare/modificare

| File | Fix |
|------|-----|
| Migration SQL | 1 |
| `supabase/functions/telnyx-proxy/index.ts` (nuovo) | 2 |
| `supabase/functions/telnyx-webhook/index.ts` (nuovo) | 3 |
| `supabase/functions/initiate-outbound-call/index.ts` (nuovo) | 4 |
| `supabase/functions/send-contact-message/index.ts` | 5 |
| `supabase/functions/process-automation/index.ts` | 6 |
| `src/modules/ai-agents/pages/PlatformSettingsPage.tsx` | 7 |
| `src/modules/ai-agents/components/PhoneNumberManager.tsx` | 8 |
| `src/components/marketing/ContactActionsTab.tsx` | 9 |
| `supabase/functions/elevenlabs-proxy/index.ts` | 10 |
| `supabase/config.toml` | 2, 3, 4 |

---

## Ordine di implementazione

Prima **Fase A** (DB + 5 edge functions), poi **Fase B** (UI). La Fase C (secret) viene richiesta prima di deployare le edge functions. Stimo 2-3 sessioni di lavoro.

Procedo con la Fase A?

