# Verifica Modulo AI Agents — Stato aggiornato

## Completato — Blocco A, B, C ✅

### FIX 2 ✅ — API Key ElevenLabs su DB
- `PlatformSettingsPage`: salvataggio reale su `platform_settings` con upsert
- `elevenlabs-proxy`: usa `getPlatformSetting()` per leggere API key da DB con fallback env
- Banner rosso se API key non configurata

### FIX 3 ✅ — handleArchive in AgentsListPage
- Implementato con `useUpdateAgent` → status='archived'
- AlertDialog conferma archiviazione
- Toggle "Mostra archiviati" con conteggio

### FIX 4 ✅ — Tab Strumenti con persistenza DB
- Toggle sistema salvati in `tools_config` jsonb su `ai_agents`
- Dialog "Aggiungi strumento personalizzato" con salvataggio
- Rimozione strumenti personalizzati

### FIX 5 ✅ — Tab Sicurezza + Avanzato con persistenza DB
- Migration: colonne `domain_whitelist`, `require_auth`, `rate_limit_enabled`, `rate_limit_per_minute`, `conversation_timeout`, `max_duration`, `error_message`, `auto_end_on_silence`, `silence_timeout` su `ai_agents`
- SecurityTab e AdvancedTab ricevono `agent` e `onSave` props, salvano su DB

### FIX 6 ✅ — Tab Test con DB
- Tabella `ai_agent_tests` con RLS + indice
- CRUD completo: crea, esegui (simulato), elimina
- Risultati persistiti in DB

### FIX 7 ✅ — Auto-ricarica crediti
- Switch abilitato con form soglia/importo
- Salvataggio su `ai_credits` con upsert

### FIX 8 ✅ — Sync KB con ElevenLabs
- Actions `add_kb_doc`, `remove_kb_doc`, `list_kb_docs`, `sync_kb` nel proxy
- ProxyAction type aggiornato

### FIX 9 ✅ — Conversazioni AI nel CRM
- Componente `ContactAIConversations` nel sidebar destro di `MarketingContactDetail`
- Tab "Conversazioni AI" con icona Bot

### FIX 10 ✅ — Banner errore API key
- Card destructive in PlatformSettingsPage quando API key non salvata

### FIX 11 ✅ — Webhook HMAC verification
- `elevenlabs-webhook`: verifica `xi-signature` con HMAC-SHA256
- Fallback se `ELEVENLABS_WEBHOOK_SECRET` non configurato

### FIX 12 ✅ — Documentazione
- `docs/SETUP.md` con architettura, tabelle, configurazione

### Feature ✅ — MarketingAiAgent dashboard
- Riepilogo agenti, saldo, KB
- Banner chiamate bloccate
- Azioni rapide con navigazione

---

## Fix Automazioni Marketing

### Fase 1 — P0 (Critici) ✅

- ✅ **A1**: `email-tracking` → inserisce `email_opened` / `email_clicked` in `automation_trigger_events`
- ✅ **A2**: `whatsapp-webhook` → inserisce `whatsapp_received` in `automation_trigger_events` (con lookup contatto marketing)
- ✅ **A3**: `fire_marketing_automation` già gestisce `opportunity_won`/`opportunity_lost` correttamente — nessun fix necessario
- ✅ **B**: `process-automation` → `handleTrigger` arricchisce payload con dati contatto da `marketing_contacts` prima di `evaluateFilters`
- ✅ **C**: Nuova Edge Function `check-scheduled-triggers` per trigger temporali (birthday, custom_date, opportunity_stale) + pg_cron alle 02:00

### Fase 2 — P1 ✅

- ✅ **D**: Azione `remove_from_automation` — UI (tipo CRM in builder) + backend (rimuove enrollment + cancella queue)
- ✅ **E**: Azione `wait_for_event` — UI (tipo logica in builder) + backend (stato waiting, timeout, risoluzione evento)

### Fase 3 — Documento v2 ✅

- ✅ **Lead scoring**: Colonna `score` su `marketing_contacts` + azione `update_contact_score` (add/subtract/set) in builder e backend
- ✅ **Re-enrollment**: Lettura `enable_reenrollment` da flow config_json.settings + fallback su trigger config
- ✅ **Contatori per nodo**: Query aggregata su `automation_execution_log` con badge esecuzioni su ogni nodo nel builder (refresh 30s)
- ✅ **customer_replied**: Collegato al webhook WhatsApp (inserisce evento `customer_replied` in `automation_trigger_events`)
- ✅ **call_registered**: DB trigger `fire_call_registered_automation` su `call_logs` INSERT
- ✅ **send_notification**: Implementato con insert reale in `lifecycle_notifications` (supporta assegnato, tutti admin, utente specifico)

### Fase 4 — TODO

- [ ] **F**: `send_sms` con Twilio (richiede credenziali utente)
- [ ] **G**: Enrollment bulk dalla lista contatti CRM
- [ ] **send_ai_message**: Integrazione con Lovable AI
