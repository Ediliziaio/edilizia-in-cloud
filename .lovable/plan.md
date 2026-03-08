

# Piano Implementazione — Modulo Agenti AI (Gap Analysis)

Il documento identifica 10 fix prioritari. Ecco lo stato attuale e il piano di implementazione organizzato in 3 fasi.

---

## Già presente nel codebase

| # | Feature | Stato |
|---|---------|-------|
| - | ElevenLabs Conversational AI + Proxy + Webhook | ✅ Completo |
| - | Multi-LLM 6 modelli | ✅ Completo |
| - | Sistema crediti atomico con markup | ✅ Completo |
| - | Knowledge Base per-agente e globale | ✅ Completo |
| - | Strumenti CRM (5 attivi) | ✅ Completo |
| - | Editor agente 10 tab | ✅ Completo |
| - | PlatformSettingsPage (API key, pricing, markup) | ✅ Esiste ma non collegata ad AdminSettings |

---

## Fase 1 — P0 (Critico)

### FIX 1: Abbonamento mensile per sbloccare il modulo AI
- **Migration SQL**: Creare tabella `ai_subscriptions` (company_id unique, status: trial/active/cancelled/paused, stripe_subscription_id, trial_ends_at, current_period_end, price_eur). Aggiungere in `platform_settings`: `ai_subscription_price_eur`, `ai_subscription_trial_days`, `ai_welcome_bonus_eur`.
- **Frontend Gate**: Creare componente `AISubscriptionGate.tsx` che wrappa il modulo AI in `index.tsx`. Se subscription non attiva → mostra pagina "Sblocca Agenti AI" con prezzo, trial info e pulsante Stripe.
- **Hook**: `useAISubscription()` per verificare stato abbonamento.
- **Stripe Integration**: Aggiungere case `ai_subscription` in `create-checkout-session` (mode: subscription). Gestire `customer.subscription.*` events in `stripe-webhook` per aggiornare `ai_subscriptions`. Al primo pagamento → bonus benvenuto in `ai_credits`.
- **SuperAdmin config**: Nella tab AI di AdminSettings (FIX 7), campi per prezzo canone, giorni trial, bonus benvenuto.

### FIX 2: Chiamate outbound — Edge Function `ai-outbound-call`
- **Nuova Edge Function** `ai-outbound-call/index.ts`:
  - Riceve: `agent_id`, `contact_id`, `phone_number`, `company_id`
  - Verifica: crediti sufficienti, DND call non attivo (`optout_call`), subscription attiva
  - Chiama ElevenLabs API per iniziare outbound call via Twilio
  - Salva record in `ai_agent_conversations` con `call_direction: 'outbound'`
- **Migration**: Aggiungere colonna `call_direction` (text, default 'inbound') su `ai_agent_conversations`.
- **UI**: Pulsante "Chiama con AI" in `ContactActionsTab.tsx` — dialog per selezionare agente, conferma, invoca edge function.

### FIX 3: Integrazione Automazioni ↔ Agente AI (bidirezionale)

**3a — Automazioni → Agente AI (nodo "Chiama con AI")**:
- In `src/types/automationBuilder.ts`: aggiungere azione `call_with_ai_agent` nella categoria "integration" di `ACTION_CATEGORIES`.
- In `ACTION_DESCRIPTIONS`: descrizione per `call_with_ai_agent`.
- In `validateActionConfig`: validazione per `ai_agent_id` obbligatorio.
- In `AutomationNodeConfig.tsx`: UI di configurazione con selector agente.
- In `process-automation/index.ts` → `executeAction`: case `call_with_ai_agent` che invoca `ai-outbound-call` edge function.

**3b — Webhook → Trigger automazione**:
- In `elevenlabs-webhook/index.ts`, DOPO il salvataggio conversazione e crediti, inserire in `automation_trigger_events`:
  - `ai_conversation_ended` (sempre)
  - `ai_appointment_booked` (se `appointmentCreated`)
  - `ai_contact_created` (se nuovo contatto creato)
- Payload: `duration_seconds`, `appointment_created`, `call_direction`, `agent_name`, `contact_id`.

**3c — Trigger AI nel TriggerPicker**:
- In `TRIGGER_CATEGORIES`: nuova categoria `ai_agent` con label "Agente AI" e 3 trigger: `ai_conversation_ended`, `ai_appointment_booked`, `ai_contact_created`.
- In `TRIGGER_DESCRIPTIONS`: descrizioni per i 3 trigger.
- Aggiungere `"ai_agent"` al type `TriggerCategory`.
- In `TriggerPickerDialog.tsx`: aggiungere icona `Bot` per categoria `ai_agent`.

### FIX 4: Post-call conferma automatica
- **Migration**: colonna `send_confirmation_after_booking` (boolean, default true) su `ai_agents`.
- **Webhook**: in `elevenlabs-webhook`, se `appointmentCreated && agent.send_confirmation_after_booking`, inviare conferma via `send-contact-message` (WhatsApp se phone disponibile, altrimenti email).
- **UI**: Toggle nel tab Avanzato dell'editor agente.

---

## Fase 2 — P1

### FIX 5: Strumento `assign_to_user`
- In `elevenlabs-webhook`: gestire tool call `assign_to_user` → aggiorna `marketing_contacts.assigned_to`.
- In `AgentToolsTab.tsx`: aggiungere `assign_to_user` nella lista "EdiliziaInCloud Tools" con dropdown utenti del team.
- In `elevenlabs-proxy`: passare la config del tool `assign_to_user` quando si crea/aggiorna agente su ElevenLabs.

### FIX 6: Sezione AI in SettingsCredits
- In `SettingsCredits.tsx`: aggiungere tab "Agente AI" con:
  - Saldo corrente AI (`ai_credits.balance_eur`)
  - Stato abbonamento (da `ai_subscriptions`)
  - Pacchetti minuti: €10/€25/€50/€100 (calcolati su modello più economico)
  - Toggle auto-ricarica con `company_auto_topup` wallet_type='ai'

### FIX 7: Tab "Agenti AI" in AdminSettings
- Creare `AdminSettingsAI.tsx` che importa `PlatformSettingsPage` dal modulo.
- In `AdminLayout.tsx` → `AdminSettingsSidebar`: aggiungere link con icona `Bot`.
- In `App.tsx`: route `impostazioni/agenti-ai` → `AdminSettingsAI`.
- Estendere `PlatformSettingsPage` con sezione abbonamento (prezzo, trial, bonus).

### FIX 8: DND check su chiamate AI
- In `ai-outbound-call`: prima di chiamare, verificare `optout_call` su `marketing_contacts`. Se true → rifiuta con errore "Contatto in DND per chiamate".
- In `elevenlabs-webhook`: loggare se la chiamata inbound era verso un contatto con DND attivo.

---

## Fase 3 — P2

### FIX 9: Attivazione numeri Twilio
- Infrastruttura pronta (`ai_agent_phone_numbers`). Da completare in sessione dedicata con configurazione Twilio reale.

### FIX 10: A/B Testing agenti
- Tab Branch già presente come guscio UI. Da completare in sessione dedicata.

---

## Riepilogo file principali

| File | Fix |
|------|-----|
| Nuova migration SQL | 1, 2, 4 |
| Nuovo `ai-outbound-call/index.ts` | 2, 8 |
| Nuovo `AISubscriptionGate.tsx` | 1 |
| Nuovo `AdminSettingsAI.tsx` | 7 |
| `elevenlabs-webhook/index.ts` | 3b, 4, 5 |
| `process-automation/index.ts` | 3a |
| `src/types/automationBuilder.ts` | 3a, 3c |
| `TriggerPickerDialog.tsx` | 3c |
| `ContactActionsTab.tsx` | 2 |
| `AgentToolsTab.tsx` | 5 |
| `AgentEditorPage.tsx` | 4 |
| `SettingsCredits.tsx` | 6 |
| `AdminLayout.tsx` | 7 |
| `App.tsx` | 7 |
| `create-checkout-session/index.ts` | 1 |
| `stripe-webhook/index.ts` | 1 |
| `src/modules/ai-agents/index.tsx` | 1 |

---

## Ordine di implementazione

Prima **Fase 1** (abbonamento + outbound call + automazioni + post-call conferma), poi **Fase 2** (assign_to_user + crediti AI in settings + tab admin + DND), infine **Fase 3** (Twilio attivo + A/B test). Totale stimato: ~6-8 sessioni di lavoro.

Inizio con la Fase 1?

