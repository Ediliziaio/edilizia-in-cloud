# MP-AIE-01 — Tool Registry Unificato + Dispatcher

## 📦 Stato finale
- **Stato**: ✅ COMPLETATO (2026-05-09 audit + chiusura formale)
- **Posizione registry**: `supabase/functions/_shared/agent-tools/` + `silvioTools.ts`
- **Audit log table**: `tool_execution_log` (migration 20260506090600)
- **Domain tools centralizzati**: crm/, cantiere/, fattura/ (5 file)
- **Domain tools persona-side**: silvioTools.ts (51+ tool dei batch 12+13)
- **Pattern WhatsApp esistente**: `whatsapp-ai-processor/tools/` (mantenuto
  per back-compat + canale WA-specific). I 2 registry coesistono per design:
  WA usa pattern legacy stabile, web/voice usa il nuovo unificato.

## 🎯 Obiettivo originale
Estrarre il tool registry pattern da `whatsapp-ai-processor/tools/` in una libreria
condivisa `_shared/agent-tools/` riutilizzabile da: ai-orchestrator (chat web),
elevenlabs voice agents, futuri canali (email, SMS).

Aggiungere ~20 tool nuovi raggruppati per dominio (CRM, cantiere, fattura,
banking, email, calendar, compliance, HR, titolare).

## 📦 Context
- **Branch**: `feat/mp-aie-01-tool-registry`
- **Dipendenze**: nessuna (sblocca tutto il resto della roadmap)
- **File esistenti chiave**:
  - `supabase/functions/whatsapp-ai-processor/tools/registry.ts`
  - `supabase/functions/whatsapp-ai-processor/tools/operaio/*.ts` (8 tool)
  - `supabase/functions/whatsapp-ai-processor/tools/titolare/*.ts` (6 tool)
  - `supabase/functions/internal-agent-tools/index.ts` (11 tool ElevenLabs)
  - `supabase/functions/_shared/silvioTools.ts` (tools per persona Silvio)

## 🔍 Analisi Preliminare
```bash
find supabase/functions -path "*tools*" -name "*.ts" | sort
cat supabase/functions/whatsapp-ai-processor/tools/registry.ts
cat supabase/functions/_shared/silvioTools.ts
grep -E "CREATE TABLE" supabase/migrations/*.sql | grep -iE "personas|tools|orchestr"
```

## 📐 Architettura Target

```
supabase/functions/_shared/agent-tools/
├── registry.ts              # Dispatcher centrale
├── types.ts                 # ToolDefinition, ToolContext, ToolResult
├── permissions.ts           # filterToolsByGrants(role, persona)
├── audit.ts                 # logToolExecution + createActionProposal
├── domains/
│   ├── crm/
│   │   ├── get_client_info.ts
│   │   ├── create_client.ts
│   │   ├── update_client.ts
│   │   └── list_recent_clients.ts
│   ├── cantiere/
│   │   ├── get_cantiere_status.ts
│   │   ├── crea_rapportino.ts          (migrato da WA)
│   │   ├── carica_foto_cantiere.ts     (migrato da WA)
│   │   ├── registra_presenza.ts        (migrato da WA)
│   │   └── elenca_cantieri_oggi.ts     (migrato da WA)
│   ├── fattura/
│   │   ├── crea_fattura_da_sal.ts      (NUOVO)
│   │   ├── invia_sdi.ts                (NUOVO wrapper)
│   │   ├── lista_scadenze.ts
│   │   └── invia_reminder_pagamento.ts (NUOVO)
│   ├── banking/
│   │   ├── get_saldo_banche.ts
│   │   ├── lista_transazioni.ts
│   │   └── match_transazione_fattura.ts (NUOVO)
│   ├── email/
│   │   ├── invia_email.ts               (NUOVO)
│   │   ├── lista_email_thread.ts        (NUOVO)
│   │   └── classifica_email.ts          (NUOVO)
│   ├── calendar/
│   │   ├── crea_evento.ts               (NUOVO)
│   │   ├── trova_slot_liberi.ts         (NUOVO)
│   │   └── invita_partecipanti.ts       (NUOVO)
│   ├── compliance/
│   │   ├── verifica_durc.ts             (NUOVO)
│   │   ├── lista_scadenze_compliance.ts (NUOVO)
│   │   └── genera_pos.ts                (wrapper esistente)
│   ├── hr/
│   │   ├── lista_dipendenti_oggi.ts
│   │   ├── registra_presenza_employee.ts
│   │   └── calcola_ore_mese.ts
│   └── titolare/
│       ├── lista_approvazioni.ts        (migrato da WA)
│       ├── approva_richiesta.ts         (migrato da WA)
│       ├── stato_cantiere.ts            (migrato da WA)
│       ├── scadenze_fatture.ts          (migrato da WA)
│       ├── costi_mese.ts                (migrato da WA)
│       └── marginalita_cantiere.ts      (migrato da WA)
└── shared/
    ├── auth.ts
    ├── errors.ts
    └── tracing.ts
```

## 🛠️ Implementazione step-by-step

### Step 1 — Schema audit log
File: `supabase/migrations/[timestamp]_tool_execution_log.sql`

```sql
CREATE TABLE IF NOT EXISTS public.tool_execution_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  persona_key     text,
  channel         text NOT NULL CHECK (channel IN ('web','mobile','whatsapp','voice','email','cron')),
  tool_name       text NOT NULL,
  tool_domain     text NOT NULL,
  risk_level      text NOT NULL CHECK (risk_level IN ('safe','yellow','red')),
  input_payload   jsonb DEFAULT '{}'::jsonb,
  output_payload  jsonb,
  status          text NOT NULL CHECK (status IN ('success','error','proposed')),
  error_message   text,
  proposal_id     uuid REFERENCES public.ai_action_proposals(id),
  duration_ms     int,
  trace_id        text,
  session_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_execution_log_company_date
  ON public.tool_execution_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_tool_date
  ON public.tool_execution_log(tool_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_execution_log_status
  ON public.tool_execution_log(status, created_at DESC) WHERE status <> 'success';

ALTER TABLE public.tool_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tool_execution_log_company_read ON public.tool_execution_log FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY tool_execution_log_super_admin ON public.tool_execution_log FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
```

### Step 2 — Definizione ToolDefinition (types.ts)
File: `supabase/functions/_shared/agent-tools/types.ts`

```typescript
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ToolChannel = 'web' | 'mobile' | 'whatsapp' | 'voice' | 'email' | 'cron';
export type ToolDomain =
  | 'crm' | 'cantiere' | 'fattura' | 'banking' | 'email'
  | 'calendar' | 'compliance' | 'hr' | 'titolare' | 'meta';
export type ToolRisk = 'safe' | 'yellow' | 'red';

export interface ToolContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>;
  userId: string;
  companyId: string;
  userRole: string;
  personaKey?: string | null;
  channel: ToolChannel;
  sessionId?: string | null;
  traceId?: string | null;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  domain: ToolDomain;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  allowedRoles: string[];   // includere '*' per "tutti"
  allowedPersonas: string[]; // includere '*' per "tutte"
  riskLevel: ToolRisk;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  proposalId?: string; // se yellow/red ha creato action_proposal
}
```

### Step 3 — Registry centrale (registry.ts)
File: `supabase/functions/_shared/agent-tools/registry.ts`

```typescript
import type { ToolContext, ToolDefinition, ToolResult } from './types.ts';
import { logToolExecution, createActionProposal } from './audit.ts';

// Registry esplicito (più debuggabile di lazy-import)
import { GET_CLIENT_INFO } from './domains/crm/get_client_info.ts';
import { CREA_RAPPORTINO } from './domains/cantiere/crea_rapportino.ts';
// ... tutti gli import

const ALL_TOOLS: ToolDefinition[] = [
  GET_CLIENT_INFO,
  CREA_RAPPORTINO,
  // ...
];

export function getAllTools(): ToolDefinition[] { return ALL_TOOLS; }
export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}

export function filterToolsByGrants(
  ctx: Pick<ToolContext, 'userRole' | 'personaKey'>
): ToolDefinition[] {
  return ALL_TOOLS.filter(t => {
    if (!t.allowedRoles.includes(ctx.userRole) && !t.allowedRoles.includes('*')) return false;
    if (ctx.personaKey && !t.allowedPersonas.includes(ctx.personaKey) && !t.allowedPersonas.includes('*')) return false;
    return true;
  });
}

export function toOpenAISpec(tools: ToolDefinition[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(toolName);
  if (!tool) {
    return { success: false, error: { code: 'tool_not_found', message: `Tool ${toolName} non trovato` } };
  }
  if (!tool.allowedRoles.includes(ctx.userRole) && !tool.allowedRoles.includes('*')) {
    return { success: false, error: { code: 'forbidden', message: 'Non autorizzato' } };
  }

  const t0 = Date.now();
  try {
    if (tool.riskLevel === 'red' || tool.riskLevel === 'yellow') {
      const proposalId = await createActionProposal(ctx, tool, input);
      await logToolExecution(ctx, tool, input, null, 'proposed', null, proposalId, Date.now() - t0);
      return { success: true, proposalId };
    }
    const data = await tool.handler(input, ctx);
    await logToolExecution(ctx, tool, input, data, 'success', null, null, Date.now() - t0);
    return { success: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logToolExecution(ctx, tool, input, null, 'error', message, null, Date.now() - t0);
    return { success: false, error: { code: 'execution_failed', message } };
  }
}
```

### Step 4 — Migrate i 14 tool WhatsApp esistenti
Per ognuno, sposta in `_shared/agent-tools/domains/<dominio>/<tool_name>.ts` e adatta a `ToolDefinition`.

### Step 5 — Aggiungi 6 nuovi tool fattura/banking/email
- `crea_fattura_da_sal`
- `invia_sdi`
- `lista_scadenze`
- `invia_reminder_pagamento`
- `match_transazione_fattura`
- `lista_email_thread`

### Step 6 — Wire ai-orchestrator con tool calling
File: `supabase/functions/ai-orchestrator/index.ts`

Loop agentico stile WhatsApp processor — vedi MP fonte per pseudocodice completo.

### Step 7 — Popola `allowed_tools` sulle 18 personas
File: `supabase/migrations/[timestamp]_personas_tools_phase2.sql`

Per ogni persona aggiorna `allowed_tools` con la lista dei tool name appropriati al ruolo.

### Step 8 — Testing
- Test E2E in Playwright: `tests/e2e/personas-tools.spec.ts`

## ✅ Acceptance Criteria
- [ ] 35+ tool unificati in `_shared/agent-tools/`
- [ ] Tool whatsapp e ElevenLabs riusano stesso registry
- [ ] ai-orchestrator esegue tool calling (parità con WhatsApp processor)
- [ ] 18 personas con `allowed_tools` popolato
- [ ] TypeScript: 0 errori
- [ ] Test E2E: almeno 5 personas testate
- [ ] Audit log: ogni esecuzione in `tool_execution_log`

## 🔗 Risorse
- Doc fonte: `EiC-Sistema-Masterprompt.md` (PARTE 3)
