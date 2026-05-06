/**
 * structuredOutput — MP-04 CoT + Confidence calibration
 *
 * Schema JSON unificato per le risposte AI dei tier balanced/premium:
 *   - thinking: ragionamento interno (loggato, NON mostrato all'utente)
 *   - confidence: enum high/medium/low
 *   - uncertainty_reasons: array di ragioni per confidence != high
 *   - answer: testo finale per l'utente (markdown ammesso, può contenere [S1])
 *   - citations: marker citati
 *   - no_rag_prefix: bool, se la risposta è puramente conversazionale
 *   - followup_suggestions: max 3 chip per UI
 *   - requires_human_review: bool, se serve approvazione umana
 *   - propose_action_id: uuid se ha proposto azione via tool
 *
 * Modello compatibile con json_schema strict di OpenAI/OpenRouter.
 * Fallback: se il provider non supporta json_schema, si degrada a json_object
 * + inject schema nel system prompt (vedi STRUCTURED_OUTPUT_SYSTEM_RULES).
 */

export const AI_RESPONSE_SCHEMA = {
  type: "object",
  required: ["thinking", "confidence", "answer"],
  additionalProperties: false,
  properties: {
    thinking: {
      type: "string",
      description: "Ragionamento dettagliato. NON mostrato all'utente. Usa per debug e audit. 2-5 frasi.",
      maxLength: 2000,
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Stima certezza. high = dati solidi e citation in CONTEXT RAG. medium = inferenza ragionata. low = parziale o RAG vuoto.",
    },
    uncertainty_reasons: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Se confidence != high, elenca ragioni (es. 'KB vuota su questo argomento', 'tool ritorna dati parziali').",
    },
    answer: {
      type: "string",
      description: "Risposta finale per l'utente. Markdown ammesso. Include marker [S1], [S2], ... e sezione '## Fonti' se applicabile.",
      minLength: 1,
      maxLength: 8000,
    },
    citations: {
      type: "array",
      items: { type: "string" },
      maxItems: 20,
      description: "ID delle fonti citate dal CONTEXT RAG (es. ['S1', 'S3']). Vuoto se [no-rag].",
    },
    no_rag_prefix: {
      type: "boolean",
      description: "True se la risposta è puramente conversazionale e NON usa il blocco RAG.",
    },
    followup_suggestions: {
      type: "array",
      items: { type: "string", maxLength: 100 },
      maxItems: 3,
      description: "Massimo 3 domande successive utili. Italiano, formato imperativo o interrogativo.",
    },
    requires_human_review: {
      type: "boolean",
      description: "True se la decisione richiede review umana (HR, fiscale critico, contratti, importi > 5000€).",
    },
    propose_action_id: {
      type: ["string", "null"],
      description: "UUID restituito da propose_action se l'AI ha proposto un'azione tramite tool.",
    },
  },
} as const;

export type StructuredAiResponse = {
  thinking: string;
  confidence: "high" | "medium" | "low";
  uncertainty_reasons?: string[];
  answer: string;
  citations?: string[];
  no_rag_prefix?: boolean;
  followup_suggestions?: string[];
  requires_human_review?: boolean;
  propose_action_id?: string | null;
};

/**
 * Tier per cui è attivo lo structured output (json_schema strict).
 * Tier economici (t1/t2) restano prosa libera per latency/cost.
 */
const DEFAULT_STRUCTURED_TIERS = new Set(["t3_balanced", "t4_premium"]);

export function shouldUseStructured(tierKey: string | null | undefined): boolean {
  if (Deno.env.get("STRUCTURED_OUTPUT_TIERS") === "none") return false;
  if (!tierKey) return false;
  // Override env: comma-separated list
  const envTiers = Deno.env.get("STRUCTURED_OUTPUT_TIERS");
  if (envTiers && envTiers !== "none") {
    return envTiers.split(",").map((s) => s.trim()).includes(tierKey);
  }
  return DEFAULT_STRUCTURED_TIERS.has(tierKey);
}

/**
 * Blocco testuale da APPENDERE al system prompt quando si usa structured output.
 * Doppia rete di sicurezza: anche se json_schema strict non è supportato dal
 * provider, il modello segue queste regole e produce JSON valido.
 */
export const STRUCTURED_OUTPUT_SYSTEM_RULES = `
# OUTPUT STRUTTURATO OBBLIGATORIO

Rispondi ESATTAMENTE con un oggetto JSON conforme allo schema:

{
  "thinking": "ragionamento dettagliato (NON mostrato all'utente, loggato per audit)",
  "confidence": "high|medium|low",
  "uncertainty_reasons": ["ragione1", "ragione2"],
  "answer": "risposta finale Markdown per l'utente, può contenere [S1], [S2] e sezione ## Fonti",
  "citations": ["S1", "S3"],
  "no_rag_prefix": false,
  "followup_suggestions": ["domanda1", "domanda2", "domanda3"],
  "requires_human_review": false,
  "propose_action_id": null
}

REGOLE:
- "thinking" SEMPRE compilato col tuo ragionamento
- "confidence":
  - "high" SOLO se hai dati sicuri da CONTEXT RAG o tool
  - "medium" per inferenze plausibili
  - "low" se stai indovinando o RAG/tool vuoti
- "answer" è ciò che l'utente vede; segui regole formato italiano (€ 1.234,56, dd/mm/yyyy)
- "requires_human_review": true per HR (assunzioni/licenziamenti), bonifici sopra soglia,
  contratti formali, decisioni con impatto > €5.000
- "followup_suggestions": max 3, utili per continuare la conversazione

Niente testo fuori dal JSON. Niente backtick di apertura/chiusura.
`;

/**
 * Tenta di estrarre uno StructuredAiResponse dal raw content.
 * Robusto a:
 *   - JSON puro
 *   - JSON dentro \`\`\`json fences
 *   - Trailing commas (le rimuove)
 *   - Testo prosa fallback (ritorna null)
 */
export function parseStructuredResponse(raw: string): StructuredAiResponse | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Estrai dal primo { all'ultimo }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  s = s.substring(first, last + 1);
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed?.answer !== "string" || !parsed.answer) return null;
    return parsed as StructuredAiResponse;
  } catch {
    return null;
  }
}
