

# Piano: Modulo AI Agents — Fase 1

## Contesto

Il progetto usa `company_id` come tenant FK (non `workspace_id`). La sidebar usa `sidebarConfig.ts` con `marketingNavItems`. La route "Agente AI" esiste già come placeholder. Il sistema non ha ancora un secret `ELEVENLABS_API_KEY`. Le Edge Functions seguono un pattern consolidato (CORS, auth via header, service role client per operazioni privilegiate). La API key ElevenLabs va gestita a livello piattaforma (tabella `platform_elevenlabs_config`) con proxy edge function.

---

## Fase 1 — Primo step da implementare

### 1. Migration SQL — Tabelle isolate

Creare le seguenti tabelle (adattate al pattern `company_id` del progetto):

- **`ai_agents`**: `id`, `company_id` (FK companies), `elevenlabs_agent_id`, `name`, `system_prompt`, `first_message`, `voice_id`, `llm_model` (default `gemini-2.5-flash`), `language` (default `it`), `is_interruptible`, `status` (text: draft/active/archived, default draft), `created_by`, `created_at`, `updated_at`
- **`ai_agent_knowledge_docs`**: `id`, `agent_id` (FK nullable), `company_id` (FK), `elevenlabs_doc_id`, `name`, `type` (text: url/file/text), `source_url`, `created_by`, `created_at`
- **`ai_agent_conversations`**: `id`, `agent_id` (FK), `company_id` (FK), `elevenlabs_conversation_id`, `duration_seconds`, `messages_count`, `status`, `started_at`, `contact_id` (FK nullable → marketing_contacts), `appointment_created` (default false)
- **`ai_agent_credits`**: `id`, `company_id` (FK, unique), `total_minutes_purchased` (numeric default 0), `minutes_used` (numeric default 0), `updated_at`
- **`platform_elevenlabs_config`**: `id`, `api_key_encrypted` (text), `default_llm` (text default `gemini-2.5-flash`), `markup_multiplier` (numeric default 2.0), `updated_at`. Singola riga piattaforma, no FK company.
- **`ai_agent_audit_log`**: `id`, `company_id` (FK), `agent_id` (uuid nullable), `user_id` (uuid), `action` (text), `details` (jsonb), `created_at`

RLS su tutte le tabelle con `get_my_company_id()` per isolamento tenant. `platform_elevenlabs_config` accessibile solo da super_admin.

Indici su `company_id` per tutte le tabelle.

### 2. Edge Function `elevenlabs-proxy`

Proxy sicuro in `supabase/functions/elevenlabs-proxy/index.ts`:
- Autenticazione utente via JWT
- Legge `company_id` dal profilo utente
- Legge `api_key_encrypted` da `platform_elevenlabs_config` e decripta con `_shared/encryption.ts`
- Supporta azioni: `create_agent`, `get_agent`, `list_agents`, `update_agent`, `delete_agent`, `get_voices`, `get_models`
- Forwarda a ElevenLabs API con la key decriptata
- Logga su `ai_agent_audit_log`
- Aggiungere `[functions.elevenlabs-proxy] verify_jwt = false` a config.toml

### 3. Struttura modulo frontend

Creare `src/modules/ai-agents/` con:

```
index.tsx                    — lazy routes export
pages/
  AgentsListPage.tsx         — lista agenti + wizard creazione
  AgentEditorPage.tsx        — editor con tab (solo tab Agente funzionante in fase 1)
components/
  AgentCard.tsx              — card agente per la lista
  CreateAgentWizard.tsx      — dialog 2-step (tipo + form)
  AgentTab.tsx               — tab principale (prompt, voce, LLM, primo messaggio)
  VoiceSelector.tsx          — selettore voce con preview
  LLMSelector.tsx            — selettore modello LLM
hooks/
  useAgents.ts               — CRUD agenti via React Query + edge function
  useElevenLabsProxy.ts      — wrapper per chiamate all'edge function
types/
  agent.types.ts             — tipi TypeScript completi
```

### 4. Routing

In `App.tsx`, aggiungere sotto le marketing routes dentro CompanyLayout:
```
<Route path="marketing/agente-ai/*" element={<AIAgentsModule />} />
```
Con sub-routes:
- `/` → `AgentsListPage`
- `/:id` → `AgentEditorPage`

Rimuovere il vecchio import `MarketingAiAgent` e la route `marketing/agente-ai`.

### 5. Sidebar

Aggiornare `sidebarConfig.ts`: la voce "Agente AI" punta già a `/azienda/marketing/agente-ai` — non serve cambiare.

### 6. API Key ElevenLabs

Prima di poter testare: richiedere il secret `ELEVENLABS_API_KEY` all'utente tramite `add_secret`. L'edge function lo userà.

Nella `PlatformSettingsPage` (fase successiva) il super_admin potrà salvare la key nella tabella `platform_elevenlabs_config` (criptata). Per la fase 1, si usa direttamente il secret Supabase.

---

## Pagine — Dettaglio UI

### AgentsListPage
- Header "Agenti AI" + badge conteggio + pulsante "+ Nuovo agente"
- Tabella: Nome, Stato (badge colorato), Lingua, Modello LLM, Data creazione, Azioni (modifica/archivia/elimina)
- Empty state con illustrazione
- Skeleton loading
- Click "+ Nuovo agente" apre `CreateAgentWizard`

### CreateAgentWizard (Dialog 2-step)
- **Step 1**: 3 card cliccabili — Agente Vuoto / Assistente Personale / Agente Aziendale
- **Step 2**: Form — Nome (max 50), Sito web (opzionale), Obiettivo principale (textarea), Toggle solo chat
- Submit → chiama edge function `create_agent` → salva in DB → redirect a editor

### AgentEditorPage
- Header con breadcrumb, badge stato, pulsanti Pubblica/Bozza
- Tab bar: **Agente** | Workflow | Knowledge Base | Analisi | Strumenti | Widget | Sicurezza | Avanzato (tab non-Agente mostrano placeholder "In arrivo")
- **Tab Agente** (2 colonne):
  - Sinistra: Prompt sistema (textarea espandibile), Primo messaggio, Toggle interrompibile
  - Destra: VoiceSelector (lista voci ElevenLabs con play preview), LLMSelector (dropdown modelli con latenza/costo), Lingua
- Salvataggio auto-save con debounce → chiama edge function `update_agent`

---

## File da creare/modificare

**Creare:**
1. `src/modules/ai-agents/types/agent.types.ts`
2. `src/modules/ai-agents/hooks/useElevenLabsProxy.ts`
3. `src/modules/ai-agents/hooks/useAgents.ts`
4. `src/modules/ai-agents/components/AgentCard.tsx`
5. `src/modules/ai-agents/components/CreateAgentWizard.tsx`
6. `src/modules/ai-agents/components/AgentTab.tsx`
7. `src/modules/ai-agents/components/VoiceSelector.tsx`
8. `src/modules/ai-agents/components/LLMSelector.tsx`
9. `src/modules/ai-agents/pages/AgentsListPage.tsx`
10. `src/modules/ai-agents/pages/AgentEditorPage.tsx`
11. `src/modules/ai-agents/index.tsx`
12. `supabase/functions/elevenlabs-proxy/index.ts`

**Modificare:**
13. `src/App.tsx` — sostituire route MarketingAiAgent con lazy module
14. `supabase/config.toml` — aggiungere `[functions.elevenlabs-proxy]`

**Migration SQL:** 1 migration con tutte le tabelle + RLS + indici

**Secret:** richiedere `ELEVENLABS_API_KEY`

