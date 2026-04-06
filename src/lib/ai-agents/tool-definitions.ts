/**
 * tool-definitions.ts
 * Definizioni complete dei tool che l'agente AI può usare in Edilizia in Cloud.
 *
 * Queste definizioni devono essere passate alla configurazione ElevenLabs ConvAI
 * sia in fase di creazione agente (create_agent) che di aggiornamento (update_agent).
 *
 * Struttura tools_config nel DB (colonna JSONB in ai_agents):
 * {
 *   system_tools: { end_conversation: true, detect_language: true, ... },
 *   custom_tools: [{ id, name, description }],
 *   edilizia_tools: {
 *     create_appointment: { enabled: true, webhook_url: "https://..." },
 *     get_lead_info: { enabled: true, webhook_url: "https://..." },
 *     ...
 *   }
 * }
 */

// ── Tipi interni (DB) ────────────────────────────────────────────────────────

export interface ToolsConfigSystemTools {
  [toolId: string]: boolean;
}

export interface ToolsConfigCustomTool {
  id: string;
  name: string;
  description: string;
}

export interface ToolsConfigEdiliziaTool {
  enabled: boolean;
  webhook_url: string;
}

export interface ToolsConfig {
  system_tools?: ToolsConfigSystemTools;
  custom_tools?: ToolsConfigCustomTool[];
  edilizia_tools?: Record<string, ToolsConfigEdiliziaTool>;
}

// ── Tipi ElevenLabs ConvAI ───────────────────────────────────────────────────
// Formato richiesto dall'API ElevenLabs Conversational AI v1
// https://elevenlabs.io/docs/conversational-ai/api-reference

export interface ElevenLabsSystemTool {
  type: "system";
  name: string;
}

export interface ElevenLabsWebhookTool {
  type: "webhook";
  name: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  response_timeout_secs: number;
  headers?: Array<{ key: string; value: string }>;
  body_schema?: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export type ElevenLabsTool = ElevenLabsSystemTool | ElevenLabsWebhookTool;

// ── Nomi tool di sistema ElevenLabs ─────────────────────────────────────────
// Mappatura ID interno → nome ElevenLabs
const SYSTEM_TOOL_MAP: Record<string, string> = {
  end_conversation: "end_call",
  detect_language: "language_detection",
  skip_turn: "skip_turn",
  transfer_agent: "transfer_to_agent",
  transfer_number: "transfer_call",
  play_dtmf: "play_dtmf",
  voicemail_detection: "voicemail_detection",
};

// ── Descrizioni tool Edilizia in Cloud (usate come fallback in ElevenLabs) ──
const EDILIZIA_TOOL_DESCRIPTIONS: Record<string, string> = {
  get_lead_info:
    "Recupera i dati di un contatto/lead dal CRM di Edilizia in Cloud. " +
    "Usa questo tool quando il chiamante chiede informazioni su un cliente esistente " +
    "o quando vuoi verificare i dati di un contatto già registrato.",
  create_appointment:
    "Crea un nuovo appuntamento nel calendario aziendale. " +
    "Usa questo tool quando il chiamante chiede di fissare un appuntamento, " +
    "una visita in cantiere, una consulenza o qualsiasi altro incontro.",
  search_products:
    "Cerca prodotti o materiali nel catalogo aziendale. " +
    "Usa questo tool quando il chiamante chiede informazioni su disponibilità, " +
    "prezzi o caratteristiche di prodotti/materiali.",
  get_availability:
    "Verifica la disponibilità di slot liberi nel calendario aziendale. " +
    "Usa questo tool prima di creare un appuntamento per trovare " +
    "date e orari disponibili.",
  assign_to_user:
    "Assegna un contatto o lead a un membro specifico del team. " +
    "Usa questo tool quando il chiamante deve essere seguito da un agente particolare " +
    "o quando si vuole smistare il contatto all'ufficio competente.",
};

// ── Funzione principale di conversione ───────────────────────────────────────

/**
 * Converte la struttura tools_config del DB nel formato ElevenLabs ConvAI.
 * Usata da elevenlabs-proxy (Edge Function) per sincronizzare i tool all'agente.
 *
 * @param toolsConfig - Struttura JSONB dalla colonna tools_config di ai_agents
 * @returns Array di tool nel formato ElevenLabs
 */
export function buildElevenLabsTools(
  toolsConfig: ToolsConfig | null | undefined
): ElevenLabsTool[] {
  if (!toolsConfig) return [];

  const tools: ElevenLabsTool[] = [];

  // 1. Tool di sistema (end_conversation, detect_language, ...)
  if (toolsConfig.system_tools) {
    for (const [toolId, enabled] of Object.entries(toolsConfig.system_tools)) {
      if (!enabled) continue;
      const elName = SYSTEM_TOOL_MAP[toolId];
      if (elName) {
        tools.push({ type: "system", name: elName });
      }
    }
  }

  // 2. Tool Edilizia in Cloud (webhook verso elevenlabs-webhook edge function)
  if (toolsConfig.edilizia_tools) {
    for (const [toolId, config] of Object.entries(toolsConfig.edilizia_tools)) {
      if (!config.enabled || !config.webhook_url) continue;

      const description =
        EDILIZIA_TOOL_DESCRIPTIONS[toolId] ??
        `Strumento ${toolId} di Edilizia in Cloud`;

      tools.push({
        type: "webhook",
        name: toolId,
        description,
        url: config.webhook_url,
        method: "POST",
        response_timeout_secs: 20,
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      } satisfies ElevenLabsWebhookTool);
    }
  }

  // 3. Tool personalizzati (custom_tools — webhook generico)
  if (toolsConfig.custom_tools) {
    for (const customTool of toolsConfig.custom_tools) {
      if (!customTool.name) continue;
      // I custom tools non hanno webhook_url configurato qui —
      // vengono registrati come tool di sistema senza endpoint fisso.
      // Aggiungere in futuro il supporto a webhook personalizzati per i custom tools.
    }
  }

  return tools;
}

/**
 * Verifica se due configurazioni di tool producono lo stesso array ElevenLabs.
 * Usata per evitare update inutili all'API ElevenLabs.
 */
export function toolsConfigEquals(
  a: ToolsConfig | null | undefined,
  b: ToolsConfig | null | undefined
): boolean {
  return JSON.stringify(buildElevenLabsTools(a)) === JSON.stringify(buildElevenLabsTools(b));
}
