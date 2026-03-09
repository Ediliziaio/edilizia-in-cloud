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

## AI Agents Gestione Interna — Implementazione

### Fase 1 — Database + Edge Function Tools ✅

- ✅ **Migration SQL**: 4 tabelle create (`internal_ai_agents`, `internal_call_logs`, `internal_agent_actions`, `internal_outbound_campaigns`)
- ✅ **ALTER ai_agent_phone_numbers**: Colonne `routing_mode` (default 'marketing') e `internal_agent_id` aggiunte
- ✅ **RLS policies**: Isolamento company_id + super_admin su tutte e 4 le tabelle
- ✅ **Edge function `internal-agent-tools`**: 11 tool CRM implementati:
  - `identify_caller` — Lookup per telefono in marketing_contacts
  - `get_client_info` — Profilo completo con note e attività recenti
  - `get_order_status` — Stato ordine con dettagli pagamento
  - `get_orders_list` — Lista ordini del cliente
  - `get_appointment_info` — Prossimi appuntamenti
  - `create_note` — Crea nota su contatto
  - `create_activity` — Crea attività/task
  - `update_order_date` — Aggiorna expected_date ordine
  - `send_sms_confirmation` — SMS via Telnyx
  - `create_support_ticket` — Segnalazione/reclamo
  - `schedule_callback` — Programma richiamo come appuntamento

### Fase 2 — Modulo UI Lista + Editor ✅

- ✅ `src/modules/ai-agents-internal/` con routing e sidebar
- ✅ `InternalAgentsListPage` — grid card agenti + wizard creazione + archiviazione
- ✅ `InternalAgentEditorPage` — 8 tab (Agente, Strumenti CRM, KB, Telefono, Test, Analytics, Sicurezza, Avanzato)
- ✅ Componenti: `InternalAgentCard`, `CreateInternalAgentWizard`, `InternalToolsTab`, `InternalAgentTab`
- ✅ Riutilizzo `AgentKBTab` dal modulo marketing

### Fase 3 — Call Logs + Action Timeline ✅

- ✅ `InternalCallLogsPage` con tabella filtrata, drawer dettaglio, trascrizione bubble chat
- ✅ `ActionTimeline` — timeline verticale azioni CRM con icone e stati
- ✅ `CallDetailDrawer` — drawer con riepilogo, tab azioni/trascrizione
- ✅ Export CSV con BOM UTF-8
- ✅ Hook `useInternalCallLogs` + `useInternalCallActions`
- ✅ Route `/azienda/agente-interno/chiamate` nel modulo

### Fase 4 — Webhook + Smart Routing ✅

- ✅ Edge function `internal-agent-webhook` — post-processing chiamate, crediti, azioni CRM
- ✅ Estendere `telnyx-webhook` con Smart Routing (`resolveAgent` per routing_mode)
- ✅ Config `verify_jwt = false` per webhook

### Fase 5 — Campagne Outbound ✅

- ✅ `InternalCampaignsPage` con dashboard KPI e tabella filtrata
- ✅ `CampaignBuilder` — wizard 4 step (tipo, target, scheduling, preview)
- ✅ Edge function `internal-campaign-manager` — batch execution con rate limiting
- ✅ Hook `useInternalCampaigns` con CRUD e stats

---

## Analisi CRM vs GHL — Piano Implementazione

### Fase 1 — P0 (Critici) ✅

- ✅ **DND completo**: Colonne `optout_sms`, `optout_call` aggiunte a `marketing_contacts`. Toggle SMS/Chiamate nel tab impostazioni contatto. Check DND in `send-contact-message` (email/whatsapp/sms) e `process-automation` (send_email con unsubscribed+optout_email, send_whatsapp con optout_whatsapp). Badge unsubscribed visibile.
- ✅ **Link prenotazione pubblica**: Colonna `booking_slug` su `marketing_calendars` (unique). Pagina `/prenota/:slug` pubblica con calendario, slot disponibili, form prenotazione. RLS per anon (read calendari/availability/appointments, insert appointments).
- ✅ **Tab Email AdminSettings**: Già esistente (`AdminSettingsEmail.tsx`)
- ✅ **Crediti Stripe**: Già esistente (`SettingsCredits.tsx`)

### Fase 2 — P1 ✅

- ✅ **Probabilità + Close Date + Motivo perdita opportunità**: Migration + UI in OpportunityDetailDialog
- ✅ **Conferma + Promemoria appuntamenti**: Email conferma + promemoria in check-scheduled-triggers
- ✅ **Google Calendar push notifications**: Edge function google-calendar-webhook + registra watch
- ✅ **SMS/Email opt-out visibile in UI**: Già implementato nel tab settings contatto (toggle + badge unsubscribed)

### Fase 3 — P2 ✅

- ✅ **WhatsApp/Stripe in SettingsIntegrations**: Card stato per ogni integrazione
- ✅ **Merge contatti duplicati**: UI + backend merge
- ✅ **Tab Azioni nel dettaglio contatto**: Azioni rapide (email, SMS, WhatsApp)

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

### Fase 4 ✅

- ✅ **F**: `send_sms` già implementato via Telnyx in `process-automation` e `telnyx-proxy`
- ✅ **G**: Enrollment bulk — `BulkEnrollAutomationDropdown` nel CRM contatti con selezione flussi pubblicati e inserimento in `automation_enrollments` + `automation_trigger_events`
- ✅ **send_ai_message**: Integrazione con Lovable AI Gateway (`google/gemini-3-flash-preview`) — genera messaggio personalizzato con contesto contatto e dispatcha su email/WhatsApp/SMS

---

## Analisi CRM vs GHL

### Fase 1 — P0 ✅

- ✅ **DND completo**: Colonne `optout_sms`, `optout_call` su `marketing_contacts` + UI toggle nel tab Impostazioni contatto + check DND in `process-automation` e `send-contact-message` + badge unsubscribed
- ✅ **Link prenotazione pubblica**: Colonna `booking_slug` su `marketing_calendars` + pagina pubblica `/prenota/:slug` + RLS anonima + creazione appuntamento + trigger `appointment_booked`
- ✅ **Tab Email AdminSettings**: Già funzionante
- ✅ **Crediti Stripe**: Già implementato

### Fase 2 — P1 ✅

- ✅ **Probabilità + Close Date + Loss Reason**: Colonne `probability`, `expected_close_date`, `loss_reason`, `loss_notes` su `marketing_opportunities` + tabella `opportunity_loss_reasons` + UI slider/date/dialog perdita in `OpportunityDetailDialog`
- ✅ **Promemoria appuntamenti**: Logica 24h/1h in `check-scheduled-triggers` + tabella `appointment_reminders_sent` + notifiche interne + trigger automazione
- ✅ **Google Calendar push**: Edge function `google-calendar-webhook` con register_watch, renew_watches, e ricezione push + colonne webhook su `google_calendar_connections`
- ✅ **Opt-out UI**: Toggle SMS/Call/WhatsApp/Email nel dettaglio contatto + badge disiscritto (già implementato in Fase 1)

### Fase 3 — P2 ✅

- ✅ **WhatsApp/Stripe in SettingsIntegrations**: Card status per WhatsApp, Stripe, Email Provider, Twilio con stato connessione e dettagli
- ✅ **Merge contatti duplicati**: Dialog di merge con ricerca, selezione master, spostamento opportunità/note/attività/appuntamenti/messaggi
- ✅ **Tab Azioni nel dettaglio contatto**: Azioni rapide (invia WhatsApp, Email, SMS, Chiama, Aggiungi ad automazione) con check opt-out

---

## Gestione Utenti — Fase 1: Database + Security ✅

### Migration SQL ✅
- ✅ **Nuove colonne `profiles`**: `password_changed_at`, `failed_login_count`, `locked_until`, `require_2fa`, `last_login_at`, `last_login_ip`
- ✅ **Nuove colonne `companies`**: `enforce_2fa`, `allowed_ips`, `password_expiry_days`, `max_failed_attempts`
- ✅ **Nuove colonne `staff_permissions`**: 9 permessi granulari (`can_export_clients`, `can_delete_orders`, `can_manage_payments`, `can_approve_orders`, `can_view_all_team_calendar`, `can_view_margins`, `can_manage_suppliers`, `can_view_financial_reports`, `can_manage_warehouse_items`)
- ✅ **Tabella `user_sessions`**: Traccia sessioni con IP, device, browser, revoca — RLS tenant + super_admin
- ✅ **Tabella `login_attempts`**: Log tentativi login con indice `(email, created_at DESC)` — RLS admin-only read
- ✅ **Tabella `permission_templates`**: Template permessi JSONB riutilizzabili — RLS admin CRUD + system_default read-only
- ✅ **Tabella `user_audit_log`**: Log azioni utente con actor/target — RLS admin-only read
- ✅ **Tabella `teams`**: Team aziendali con leader e colore — RLS tenant
- ✅ **Tabella `team_members`**: Membership team con ruolo — RLS tenant, unique(team_id, user_id)
- ✅ **Funzione `check_and_update_login_attempt`**: SECURITY DEFINER — verifica lock, resetta/incrementa contatore, blocco 30min dopo N tentativi
- ✅ **5 Template di Sistema**: Company Admin, Manager, Tecnico Standard, Commerciale Standard, Read-Only

### Frontend Updates ✅
- ✅ `StaffPermissions` interface: 9 nuovi campi
- ✅ `permissionsDefaults.ts`: DEFAULT_PERMISSIONS + nuova sezione `GRANULAR_SECTIONS`
- ✅ `Profile` type: campi security
- ✅ `Company` type: campi security
