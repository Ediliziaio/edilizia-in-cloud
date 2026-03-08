

# Piano: A/B Testing Agenti AI (FIX 10)

## Obiettivo
Permettere di creare varianti (branch) di un agente con configurazioni diverse (prompt, voce, LLM) e dividere il traffico tra le varianti per confrontare le performance.

---

## Database

### Nuova tabella `ai_agent_branches`
```sql
CREATE TABLE public.ai_agent_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Variante',
  traffic_percent integer NOT NULL DEFAULT 0 CHECK (traffic_percent >= 0 AND traffic_percent <= 100),
  is_main boolean NOT NULL DEFAULT false,
  -- Override fields (null = usa quelli dell'agente principale)
  system_prompt text,
  first_message text,
  voice_id text,
  llm_model text,
  -- Stats (cached, aggiornati dal webhook)
  conversations_count integer NOT NULL DEFAULT 0,
  appointments_count integer NOT NULL DEFAULT 0,
  avg_duration_seconds numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Colonna `branch_id` su `ai_agent_conversations`
```sql
ALTER TABLE public.ai_agent_conversations 
  ADD COLUMN branch_id uuid REFERENCES public.ai_agent_branches(id) ON DELETE SET NULL;
```

RLS: tenant isolation via `company_id = get_my_company_id()` + super_admin full access.

---

## Backend

### Webhook (`elevenlabs-webhook/index.ts`)
- Quando salva la conversazione, se esiste `metadata.branch_id`, assegna `branch_id` alla riga.
- Incrementa `conversations_count` e `appointments_count` sulla branch corrispondente.
- Ricalcola `avg_duration_seconds`.

### Widget / Outbound call
- Quando si inizia una conversazione, il frontend (o edge function) seleziona la branch tramite random weighted selection basata su `traffic_percent`.
- Passa `branch_id` nei metadata della sessione ElevenLabs.
- Se la branch ha override (prompt/voce/LLM), usa quelli al posto dei valori dell'agente principale.

---

## Frontend — `AgentBranchTab.tsx` (riscrittura completa)

Rimuovere il guscio placeholder. Implementare:

1. **Lista branch** da database con CRUD:
   - Branch "Principale" (is_main=true, sempre presente, non eliminabile)
   - Pulsante "Crea variante" → dialog con nome
   - Per ogni branch: nome, % traffico, conversazioni, appuntamenti, durata media
   
2. **Slider divisione traffico**:
   - Slider per ogni branch (somma deve essere 100%)
   - Validazione: non si può salvare se la somma ≠ 100%
   - Auto-distribuzione quando si aggiunge/rimuove un branch

3. **Configurazione override per branch**:
   - Click su una branch → dialog/accordion con campi override:
     - System prompt (se vuoto usa quello principale)
     - First message
     - Voice ID (selector)
     - LLM model (selector)

4. **Dashboard comparativa**:
   - Tabella con KPI per branch: conversazioni, appuntamenti, tasso appuntamento, durata media
   - Badge "Vincitore" sulla branch con miglior tasso appuntamento (se ≥30 conversazioni per significatività)

5. **Azioni**: Elimina branch (redistribuisce traffico), Promuovi a principale (copia override sull'agente e resetta branch)

---

## File da creare/modificare

| File | Azione |
|------|--------|
| Migration SQL | Creare `ai_agent_branches`, colonna `branch_id` su conversations |
| `AgentBranchTab.tsx` | Riscrittura completa con CRUD, slider traffico, override, dashboard |
| `src/modules/ai-agents/hooks/useAgentBranches.ts` | Nuovo hook CRUD per branches |
| `supabase/functions/elevenlabs-webhook/index.ts` | Aggiornare stats branch dopo conversazione |
| `AgentEditorPage.tsx` | Passare `agentId` a `AgentBranchTab` |

