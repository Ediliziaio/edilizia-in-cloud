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
- Per decisioni operative/economiche, "answer" deve separare: risposta breve, dati certi, ipotesi, scenari, azioni consigliate. Non dare mai un solo numero senza contesto.
- Per finanza/cassa, distingui sempre fatturato, incasso, margine e cassa libera dopo costi variabili.
- Per domande su "quanto vendere/fatturare/incassare", non usare mai fatturato come sinonimo di incasso: considera acconti, saldi, ritardi, costi variabili iniziali, IVA, manodopera, materiali, subappaltatori e tempi di pagamento.
- Se dai un target di nuovo venduto, indica anche: acconto minimo consigliato, quota assorbita da costi variabili, rischio se il cliente paga tardi e alternativa basata su recupero crediti.
- Se i dati non bastano per stimare costi variabili/margini, il numero e "minimo certificabile", non target definitivo.
- Se un tool contiene data_quality.warnings, "confidence" non può essere high e "answer" deve spiegare quali dati mancano.
- Se un tool contiene priorita_recupero o campi priorita, usa quell'ordine nella risposta.
- Se un tool contiene proposalId, _proposal, pending_review o riskLevel/risk_level yellow/red, "answer" deve dire che l'azione è da confermare, non eseguita.
- Non nominare mai internamente "persona", "CFO", "Cliente Tutor", "consulenti" o tool/RPC: la risposta finale deve sembrare una sola regia.
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
  if (first < 0 || last <= first) {
    // Nessun JSON trovato → ritorna null (chiamante mostra raw)
    return null;
  }
  const jsonSlice = s.substring(first, last + 1);
  try {
    const parsed = JSON.parse(jsonSlice);
    if (typeof parsed?.answer !== "string" || !parsed.answer) {
      return null;
    }
    return parsed as StructuredAiResponse;
  } catch {
    // Fallback regex: modelli piccoli (Ministral 3B, Llama 3 8B) producono
    // JSON malformato (stringhe non chiuse, virgole mancanti). Per non
    // mostrare MAI JSON crudo all'utente, proviamo a estrarre i campi via regex.
    return recoverFromMalformedJson(jsonSlice, s);
  }
}

/**
 * Recovery best-effort per JSON malformato.
 * Estrae `answer` (e altri campi opzionali) via regex tollerante.
 * Se nemmeno questo funziona → strip del wrapper "thinking" e ritorna prosa.
 */
function recoverFromMalformedJson(jsonSlice: string, fullText: string): StructuredAiResponse | null {
  // 1) Tenta di estrarre "answer": "..." (gestisce escape \" e newline)
  // Pattern strict: chiede chiusura formale con [, }]
  const answerStrict = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)"(?:\s*[,}])/s.exec(jsonSlice);
  let answerRaw: string | null = null;
  if (answerStrict) {
    answerRaw = answerStrict[1];
  } else {
    // Pattern tollerante: per Mistral Medium che produce stringhe con newline
    // non escapati. Cerca "answer": " ... fino al prossimo \"\s*[,}] oppure
    // fino alla fine del testo.
    const answerLoose = /"answer"\s*:\s*"([\s\S]*?)(?:"\s*(?:[,}]|$)|$)/s.exec(jsonSlice);
    if (answerLoose && answerLoose[1].length > 0) {
      answerRaw = answerLoose[1];
    }
  }

  if (answerRaw) {
    const cleanAnswer = answerRaw
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\t/g, "\t")
      .trim();
    if (cleanAnswer.length > 0) {
      const thinkingMatch = /"thinking"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(jsonSlice);
      const confMatch = /"confidence"\s*:\s*"(high|medium|low)"/i.exec(jsonSlice);
      return {
        thinking: thinkingMatch ? thinkingMatch[1].slice(0, 2000) : "",
        confidence: (confMatch?.[1]?.toLowerCase() as "high" | "medium" | "low") ?? "low",
        answer: cleanAnswer,
      };
    }
  }

  // 2) Nessun answer estraibile MA il JSON parla di "thinking" → modello debole
  // ha vomitato il template senza completarlo. Strip del wrapper JSON e ritorna
  // il testo grezzo come fallback (meglio del JSON crudo).
  if (/"thinking"\s*:/.test(jsonSlice)) {
    let stripped = fullText
      // Rimuove fence ``` e ```json apertura/chiusura ovunque
      .replace(/```(?:json|markdown)?\s*\n?/gi, "")
      .replace(/\n?```\s*/g, "")
      // Rimuove blocco "thinking": "...", anche se contiene newline non escapati
      .replace(/^[\s{]*"thinking"\s*:\s*"[\s\S]*?(?:"\s*[,}\n]|$)/m, "")
      // Rimuove altri campi metadata
      .replace(/^[\s{,]*"(?:confidence|uncertainty_reasons|citations|no_rag_prefix|followup_suggestions|requires_human_review|propose_action_id)"\s*:\s*[^,}]*[,}]?/gm, "")
      // Rimuove parentesi graffe orfane
      .replace(/^\s*[{}]\s*$/gm, "")
      .trim();
    // Rimuovi trailing virgole/quote orfane
    stripped = stripped.replace(/^["',\s]+/, "").replace(/["',\s]+$/, "").trim();
    // Rimuovi residuo "answer": " all'inizio se è rimasto
    stripped = stripped.replace(/^"answer"\s*:\s*"/i, "").trim();
    if (stripped.length > 20) {
      return {
        thinking: "",
        confidence: "low",
        answer: stripped,
      };
    }
  }

  return null;
}
