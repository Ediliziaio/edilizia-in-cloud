

# Fase 4 — Webhook + Smart Routing

## Obiettivo
Creare la edge function `internal-agent-webhook` per il post-processing delle chiamate degli agenti interni, ed estendere `telnyx-webhook` con Smart Routing per instradare le chiamate al modulo corretto (marketing vs interno) in base a `routing_mode`.

## Cosa viene implementato

### 1. Edge Function `internal-agent-webhook`
Nuova funzione che ElevenLabs chiama al termine di una conversazione con un agente interno. Gestisce:
- Salvataggio del log chiamata in `internal_call_logs` (trascrizione, durata, sommario)
- Salvataggio delle azioni CRM in `internal_agent_actions` (da `tool_calls`)
- Deduzione crediti atomica via `deduct_ai_credits` RPC (riuso infrastruttura esistente)
- Lookup contatto per telefono dal metadata della chiamata
- Auto-recharge e blocco chiamate (stessa logica di `elevenlabs-webhook`)
- Trigger automazione `internal_call_completed`

### 2. Smart Routing in `telnyx-webhook`
Modifica del case `call.initiated` per:
- Leggere `routing_mode` e `internal_agent_id` da `ai_agent_phone_numbers`
- Se `routing_mode = 'internal'`: lookup agente da `internal_ai_agents`, log in `internal_call_logs`, routing SIP a ElevenLabs con l'agent ID interno
- Se `routing_mode = 'marketing'` (default): comportamento attuale invariato
- Funzione helper `resolveAgent()` che restituisce `{ type, agentId, elevenlabsAgentId, companyId }` in base al routing_mode

### 3. Config
- Aggiungere `[functions.internal-agent-webhook] verify_jwt = false` a `config.toml`

### File coinvolti
- **Nuovo**: `supabase/functions/internal-agent-webhook/index.ts`
- **Modificato**: `supabase/functions/telnyx-webhook/index.ts` (Smart Routing)
- **Modificato**: `supabase/config.toml` (JWT config)

