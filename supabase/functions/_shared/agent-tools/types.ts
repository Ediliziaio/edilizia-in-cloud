/**
 * MP-AIE-01 — Tool Registry Unificato (types)
 *
 * Definizioni cross-canale per il sistema di agent tools EiC.
 * Riusabile da: ai-orchestrator (chat web), whatsapp-ai-processor (WA),
 * internal-agent-tools (ElevenLabs voice), futuri canali (email, SMS).
 *
 * Ogni tool è auto-contenuto e dichiara:
 *   - parameters JSON-Schema (per LLM tool calling)
 *   - allowedRoles + allowedPersonas (RBAC)
 *   - riskLevel: safe (esegui subito) | yellow (proponi) | red (forza HITL)
 *   - handler(input, ctx): logica business
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient = any;

export type ToolChannel = "web" | "mobile" | "whatsapp" | "voice" | "email" | "cron";

export type ToolDomain =
  | "crm"
  | "cantiere"
  | "fattura"
  | "banking"
  | "email"
  | "calendar"
  | "compliance"
  | "hr"
  | "titolare"
  | "meta";

export type ToolRisk = "safe" | "yellow" | "red";

/**
 * Contesto di esecuzione passato al handler di ogni tool.
 * Auth & company già verificati a monte (dall'edge function entry point).
 */
export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  companyId: string;
  /** Ruolo utente (es. 'company_admin', 'super_admin', 'pm', ...). */
  userRole: string;
  /** Persona AI che invoca il tool (es. 'silvio', 'cfo', 'pm_cantiere'). */
  personaKey?: string | null;
  /** Canale di provenienza per analytics + comportamenti differenziati. */
  channel: ToolChannel;
  /** ID conversazione/sessione corrente (se applicabile). */
  sessionId?: string | null;
  /** Trace ID per correlazione con ai_call_ledger / log esterni. */
  traceId?: string | null;
}

/**
 * Schema JSON-Schema-compatible (sub-set OpenAI function calling spec).
 */
export interface ToolParametersSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties?: boolean;
}

/**
 * Definizione di un tool. Pattern preferito: const TOOL_NAME: ToolDefinition = {...}
 * + export, poi import in `registry.ts`.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  /** Identificatore univoco, snake_case lowercase. */
  name: string;
  /** Descrizione per LLM (cosa fa, quando usarlo). 1-2 frasi. */
  description: string;
  /** Dominio logico per filtering UI/RBAC. */
  domain: ToolDomain;
  /** JSON-Schema dei parametri input. */
  parameters: ToolParametersSchema;
  /** Ruoli abilitati. Includere '*' per "tutti". */
  allowedRoles: string[];
  /** Personas abilitate. Includere '*' per "tutte". */
  allowedPersonas: string[];
  /** Risk level per sistema action_proposals. */
  riskLevel: ToolRisk;
  /** Funzione che esegue il tool. */
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

/**
 * Risultato standardizzato di un'esecuzione tool.
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  /** Se yellow/red ha creato un'action_proposal anziché eseguire direttamente. */
  proposalId?: string;
}

/**
 * Subset di campi necessari per filtraggio RBAC senza requisiti DB extra.
 */
export type GrantContext = Pick<ToolContext, "userRole" | "personaKey">;
