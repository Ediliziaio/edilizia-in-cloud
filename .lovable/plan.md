

# AI Agents Gestione Interna — Analisi Stato Implementazione

## Risultato: NULLA E' STATO IMPLEMENTATO

L'intero modulo "Agenti AI Gestione Interna" descritto nel documento (28 pagine) non esiste nel codebase. Zero dei 5 prompt sono stati eseguiti.

---

## Scorecard Completa

| # | Componente | Stato | Dettaglio |
|---|-----------|-------|-----------|
| **P0** | Database Schema (5 tabelle + RLS) | **NON FATTO** | Nessuna tabella `internal_ai_agents`, `internal_call_logs`, `internal_agent_actions`, `internal_outbound_campaigns` |
| **P0** | Edge Function `internal-agent-tools` (11 tool CRM) | **NON FATTO** | Non esiste in `supabase/functions/` |
| **P0** | Modulo UI `src/modules/ai-agents-internal/` | **NON FATTO** | La directory non esiste. Solo `src/modules/ai-agents/` (marketing) esiste |
| **P1** | `InternalCallLogsPage` + `ActionTimeline` | **NON FATTO** | Nessun file |
| **P1** | Edge Function `internal-agent-webhook` | **NON FATTO** | Non esiste |
| **P1** | Smart Routing (`routing_mode` su `ai_agent_phone_numbers`) | **NON FATTO** | Colonna non aggiunta, nessuna logica routing in `telnyx-webhook` |
| **P1** | `InternalCampaignsPage` + Campaign Builder | **NON FATTO** | Nessun file |
| **P2** | Edge Function `internal-campaign-manager` | **NON FATTO** | Non esiste |
| **P2** | Automation trigger `internal_call_completed` | **NON FATTO** | Non configurato |
| **P3** | WhatsApp adapter | **NON FATTO** | Futuro, non previsto ora |

---

## Infrastruttura Condivisa Esistente (riutilizzabile)

Questi componenti del modulo Marketing **esistono gia** e possono essere importati:

- `VoiceSelector.tsx`, `LLMSelector.tsx` — selettori voce e modello LLM
- `elevenlabs-proxy` edge function — crea/aggiorna agenti ElevenLabs
- `ai_credits` + `deduct_ai_credits` RPC — sistema crediti
- `check-credits-before-call` — validazione pre-chiamata
- `ai_agent_phone_numbers` — tabella numeri Telnyx
- `PhoneNumberManager.tsx` — gestione numeri
- `telnyx-webhook` — webhook chiamate inbound (da estendere con Smart Routing)

---

## Piano di Implementazione (5 fasi, come da documento)

### Fase 1 — Database + Edge Function Tools (P0)
- Migration SQL: creare 4 tabelle (`internal_ai_agents`, `internal_call_logs`, `internal_agent_actions`, `internal_outbound_campaigns`) + ALTER `ai_agent_phone_numbers` per `routing_mode` e `internal_agent_id`
- RLS policies per tutte le tabelle (isolamento `company_id` + `super_admin`)
- Edge function `internal-agent-tools/index.ts` con i 11 tool CRM: `identify_caller`, `get_client_info`, `get_order_status`, `get_orders_list`, `get_appointment_info`, `create_note`, `create_activity`, `update_order_date`, `send_sms_confirmation`, `create_support_ticket`, `schedule_callback`

### Fase 2 — Modulo UI Lista + Editor (P0)
- Creare `src/modules/ai-agents-internal/` con routing (`/agente-interno/`, `/agente-interno/:id`, ecc.)
- `InternalAgentsListPage` — grid di card agenti con wizard creazione
- `InternalAgentEditorPage` — 8 tab (Agente, Strumenti CRM, KB, Telefono, Test, Analytics, Sicurezza, Avanzato)
- Componenti dedicati: `InternalAgentCard`, `ToolConfigCard`, `InternalToolsTab`
- Riutilizzo di `VoiceSelector`, `LLMSelector` dal modulo marketing

### Fase 3 — Call Logs + Action Timeline (P1)
- `InternalCallLogsPage` con tabella filtrata, drawer dettaglio, trascrizione bubble chat
- `ActionTimeline` — timeline verticale delle azioni CRM eseguite in chiamata
- Export CSV

### Fase 4 — Webhook + Smart Routing (P1)
- Edge function `internal-agent-webhook` — post-call processing (salva log, deduci crediti, aggiorna contatto)
- Estendere `telnyx-webhook` con logica Smart Routing (`resolveAgent`)
- Tabella opzionale `call_routing_log`

### Fase 5 — Campagne Outbound (P1)
- `InternalCampaignsPage` con dashboard stats e tabella campagne
- `CampaignBuilder` — wizard 4 step (tipo, target, schedulazione, preview)
- Edge function `internal-outbound-call` per chiamate singole outbound
- Edge function `internal-campaign-manager` per batch scheduling (P2)

---

## Stima Complessiva

| Fase | Stima | Priorita |
|------|-------|----------|
| Fase 1 — DB + Tools | 3-4h | P0 |
| Fase 2 — UI Module | 4-5h | P0 |
| Fase 3 — Call Logs | 3h | P1 |
| Fase 4 — Webhook + Routing | 3h | P1 |
| Fase 5 — Campagne | 4h | P1 |
| **Totale** | **17-19h** | |

Data la complessita, consiglio di procedere una fase alla volta. **Vuoi che inizi dalla Fase 1** (migration SQL + edge function `internal-agent-tools`)?

