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
 *
 * 🛠️ v2 (2026-05-10): aggiunti BAD/GOOD example concreti + forbidden patterns
 * espliciti. Senza questi, modelli "medi" (Claude Haiku, Mistral Medium, Llama 3
 * 70B) tendono a dumpare il loro chain-of-thought direttamente dentro `answer`
 * con tool names ("calculate_revenue_needed_next_month ritorna:") e narrazione
 * interna ("Ho i dati dai tool. Analizzo:") visibili all'utente.
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

# REGOLE DI BASE

- "thinking": MASSIMO 2-5 frasi di ragionamento INTERNO, NON la risposta.
  ⚠ NON mettere mai dentro "thinking" la risposta completa che vuoi mostrare
  all'utente. "thinking" è un appunto privato (NON mostrato), non l'output finale.
  Esempio CORRETTO di thinking: "L'utente chiede X. Tool Y dà Z. Calcolo: A+B=C.
  Confidenza media perché manca dato D."
- "answer" è la risposta COMPLETA che l'utente vede (markdown, dettagli, calcoli, scenari).
  ⚠ Se la risposta è lunga 200+ parole, va TUTTA dentro "answer", NON dentro "thinking".
- "confidence":
  - "high" SOLO se hai dati sicuri da CONTEXT RAG o tool
  - "medium" per inferenze plausibili
  - "low" se stai indovinando o RAG/tool vuoti
- "requires_human_review": true per HR (assunzioni/licenziamenti), bonifici sopra soglia,
  contratti formali, decisioni con impatto > €5.000
- "followup_suggestions": max 3, utili per continuare la conversazione

# 🚫 COSA NON SCRIVERE MAI DENTRO "answer" (USER-FACING)

L'utente NON deve MAI vedere nessuno di questi elementi nella tua risposta:
1. ❌ Nomi di tool/funzioni: \`calculate_revenue_needed_next_month\`, \`get_overdue_payments\`,
   \`get_revenue_forecast\`, \`get_cashflow_status\`, \`search_brain\`, \`propose_action\`,
   o qualsiasi altro identificatore snake_case/camelCase di tipo programmatico.
2. ❌ Frasi di "narrazione interna" tipo: "Ho i dati dai tool", "Analizzo:", "Vedo che",
   "I tool ritornano", "Dai dati che ho", "Procedo a calcolare", "Esamino i risultati",
   "Faccio un'analisi", "tool 1 ritorna...", "tool X ha errore".
3. ❌ Riferimenti a "persona", "CFO", "Cliente Tutor", "consulenti", "agenti",
   "Council", "orchestrator", "RPC", "edge function", "OpenRouter", o qualsiasi
   meta-discussione sull'architettura AI.
4. ❌ Output programmatico tipo \`X ritorna: { campo1: 123 }\`, JSON inline,
   identificatori UUID nudi, riferimenti a ID tecnici.
5. ❌ Inglese tecnico (return, error, status, data) — sempre italiano colloquiale.

# ✅ COME DEVE ESSERE "answer" (FORMATO PROFESSIONALE)

L'utente è un imprenditore edile italiano. La risposta deve sembrare scritta dal
suo consulente più esperto, non da un programma. Quindi:
- Inizia con un titolo H2/H3 chiaro in italiano
- Numeri in formato italiano: € 1.234,56, dd/mm/yyyy
- Bold per i valori chiave (€ totali, scadenze, percentuali)
- Sezioni separate da divider (---) o titoli H3 quando la risposta è strutturata
- Tabelle markdown quando ci sono ≥ 3 righe di dati da confrontare
- Bullet point o numerazione per liste di azioni
- Ogni numero deve avere contesto (cosa rappresenta, da dove viene)

# 📋 ESEMPIO BAD vs GOOD

DOMANDA: "Quanto dovrei fatturare il mese prossimo per pagare i costi fissi?"

❌ BAD (NON FARE COSÌ — questo è chain-of-thought leak):
"Ho i dati dai tool. Analizzo:
1. calculate_revenue_needed_next_month ritorna:
- Gap cassa giugno: €20.495
- Fatturato minimo teorico: €68.316,67
2. get_overdue_payments ritorna:
- 6 rate scadute per €22.238 totali
3. get_cashflow_status ha errore, ma non serve."

✅ GOOD (FAI COSÌ — risposta finale pulita per imprenditore):
"## Quanto Fatturare a Giugno 2026 — Risposta Diretta

**Il gap di cassa da coprire è € 20.495** per pagare stipendi (€ 43.500),
costi fissi scaduti (€ 4.140) e IMU (€ 850).

### Incassi Già Disponibili
- Rate scadute da recuperare: **€ 22.238** (6 clienti in ritardo)
- Incassi previsti giugno: **€ 5.757** (saldo Costruzioni Rossi)
- **Totale: € 27.995**

**Buona notizia**: Se recuperi i crediti scaduti, copri il gap senza
fatturare nuovo. ..."

La differenza: il BAD descrive il PROCESSO di analisi, il GOOD presenta il
RISULTATO come un report di consulenza.

# REGOLE BUSINESS (sempre dentro "answer")

- Per decisioni operative/economiche, separa: risposta breve, dati certi, ipotesi,
  scenari, azioni consigliate. Non dare mai un solo numero senza contesto.
- Per finanza/cassa, distingui sempre fatturato, incasso, margine e cassa libera
  dopo costi variabili.
- Per domande su "quanto vendere/fatturare/incassare", non usare fatturato come
  sinonimo di incasso: considera acconti, saldi, ritardi, costi variabili
  iniziali, IVA, manodopera, materiali, subappaltatori e tempi di pagamento.
- Se dai un target di nuovo venduto, indica: acconto minimo consigliato, quota
  assorbita da costi variabili, rischio se il cliente paga tardi e alternativa
  basata su recupero crediti.
- Se i dati non bastano per stimare costi variabili/margini, il numero è
  "minimo certificabile", non target definitivo.
- Se un tool contiene data_quality.warnings, "confidence" non può essere high
  e "answer" deve spiegare quali dati mancano (in italiano colloquiale, senza
  nominare il tool).
- Se un tool contiene priorita_recupero o campi priorita, usa quell'ordine nella
  risposta (senza nominare il campo).
- Se un tool contiene proposalId, _proposal, pending_review o riskLevel yellow/red,
  "answer" deve dire che l'azione è da confermare, non eseguita.

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
    return normalizeAndValidate(parsed);
  } catch {
    // Fallback regex: modelli piccoli (Ministral 3B, Llama 3 8B) producono
    // JSON malformato (stringhe non chiuse, virgole mancanti). Per non
    // mostrare MAI JSON crudo all'utente, proviamo a estrarre i campi via regex.
    return recoverFromMalformedJson(jsonSlice, s);
  }
}

/**
 * 🆕 Pattern di "narrazione interna" che NON devono mai apparire dentro
 * `answer` (sono chain-of-thought leak). Usati sia da `looksLikeInternalNarration`
 * (per evitare swap sbagliato) sia da `sanitizeAnswer` (per stripping content-level).
 *
 * Sviluppato osservando casi reali in cui Claude Haiku / Mistral Medium dumpano
 * il loro ragionamento dentro answer:
 *   "Ho i dati dai tool. Analizzo:"
 *   "1. **calculate_revenue_needed_next_month** ritorna:"
 *   "1. **get_overdue_payments** ritorna:"
 *   "tool X ha errore, ma non serve"
 */
const INTERNAL_NARRATION_OPENERS: RegExp[] = [
  /^\s*ho\s+i\s+dati\s+(?:dai\s+)?tool/i,
  /^\s*analizzo[:\s]/i,
  /^\s*(?:vedo|noto|osservo)\s+che/i,
  /^\s*procedo\s+(?:a|con)/i,
  /^\s*esamino\s+(?:i\s+)?(?:risultati|dati)/i,
  /^\s*(?:i|gli)?\s*tool\s+ritornano?/i,
  /^\s*dai\s+dati\s+che\s+ho/i,
  /^\s*faccio\s+un[''\s]?analisi/i,
  /^\s*okay[,.]?\s+ho\s+capito/i,
];

/**
 * Detecta se una stringa "appare" essere narrazione interna del modello
 * piuttosto che una risposta finale formattata. Usata per evitare di
 * swappare `thinking → answer` quando il thinking contiene chain-of-thought
 * (che andrebbe scartato, non promosso a risposta visibile).
 */
function looksLikeInternalNarration(text: string): boolean {
  if (!text) return false;
  // Prima riga (il modello tende a dichiarare l'inizio della narrazione qui)
  const firstLine = text.split(/\r?\n/, 1)[0]?.slice(0, 200) ?? "";
  if (INTERNAL_NARRATION_OPENERS.some((re) => re.test(firstLine))) return true;

  // Tool names visibili (es. `calculate_revenue_needed_next_month ritorna:`)
  // Pattern: snake_case identifier followed by "ritorna" / "returns" / "ha errore"
  const toolNamePattern = /\b[a-z]+(?:_[a-z]+){2,}\b\s*(?:ritorna|returns?|ha\s+errore|fallisce|crash|error)/i;
  if (toolNamePattern.test(text)) return true;

  return false;
}

/**
 * 🆕 v3 (2026-05-10): post-parse content sanitization.
 *
 * Anche con BAD/GOOD example nel prompt, modelli "medi" occasionalmente
 * dumpano chain-of-thought dentro answer. Questa funzione fa una pulizia
 * conservativa: strip di righe/blocchi che assomigliano a narrazione interna,
 * MA preserva il resto se la risposta contiene anche contenuto "buono".
 *
 * Strategia:
 *   1. Se l'INTERA answer è chain-of-thought → ritorna messaggio fallback
 *      (la chat non può mostrare nulla di utile)
 *   2. Altrimenti → strip righe specifiche che leakano (tool names, opener narrativi)
 *      preservando il contenuto valido
 */
export function sanitizeAnswer(rawAnswer: string): { cleaned: string; wasModified: boolean; isFullyChainOfThought: boolean } {
  if (!rawAnswer) return { cleaned: rawAnswer, wasModified: false, isFullyChainOfThought: false };

  let cleaned = rawAnswer;
  let wasModified = false;

  // Step 1: rimuovi opener narrativo se presente all'inizio
  for (const re of INTERNAL_NARRATION_OPENERS) {
    if (re.test(cleaned.split(/\r?\n/, 1)[0] ?? "")) {
      // Strip first line (e ogni riga successiva vuota)
      cleaned = cleaned.replace(/^[^\n]*\n+/, "").trim();
      wasModified = true;
      break;
    }
  }

  // Step 2: rimuovi righe del tipo "1. **calculate_revenue_needed_next_month** ritorna:"
  // o "**get_overdue_payments** ritorna:" (con o senza numerazione/bold).
  const toolLineRegex = /^\s*(?:\d+\.\s*)?(?:[*_]{1,2})?[a-z]+(?:_[a-z]+){2,}(?:[*_]{1,2})?\s*(?:ritorna|returns?|ha\s+errore|fallisce)[:\s].*$/gim;
  if (toolLineRegex.test(cleaned)) {
    cleaned = cleaned.replace(toolLineRegex, "").replace(/\n{3,}/g, "\n\n").trim();
    wasModified = true;
  }

  // Step 3: rimuovi blocchi tipo "tool X ha errore, ma non serve"
  cleaned = cleaned.replace(/^\s*\d+\.\s*\*?\*?[a-z_]+\*?\*?\s+ha\s+errore[^\n]*\n?/gim, () => {
    wasModified = true;
    return "";
  });

  // Step 4: detect tool names sparsi nel testo (forma libera)
  // Non li rimuoviamo (rischio di rompere il flow), ma flagghiamo via warning
  // per logging. La pulizia 1-3 dovrebbe già aver coperto i casi grossi.

  // Step 5: se dopo tutti gli strip l'output è troppo corto (< 30 char) →
  // l'answer era TUTTA chain-of-thought. Non possiamo mostrare niente di utile.
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  const isFullyChainOfThought = cleaned.length < 30 && rawAnswer.length > 100;

  return { cleaned, wasModified, isFullyChainOfThought };
}

/**
 * 🆕 Bug fix 2026-05-10: il modello (specie Claude Haiku/Mistral medi) talvolta
 * mette la risposta vera dentro `thinking` invece che in `answer`, oppure
 * lascia `answer` vuota/troppo corta. Detection + recovery:
 *   - Se answer è valida → use as-is (con sanitizeAnswer per stripping leak)
 *   - Se answer è vuota/molto corta MA thinking è sostanziale e NON è
 *     chain-of-thought → use thinking
 *   - Se entrambi vuoti o solo chain-of-thought → null (chiamante mostra raw/fallback)
 *
 * 🛠️ v3 (2026-05-10): tightened swap — non swappiamo se thinking sembra
 * narrazione interna (es. "Ho i dati dai tool. Analizzo: tool_X ritorna...")
 * perché promuovere quella robaccia ad answer fa peggio che mostrare il raw.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAndValidate(parsed: any): StructuredAiResponse | null {
  if (!parsed || typeof parsed !== "object") return null;

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const thinking = typeof parsed.thinking === "string" ? parsed.thinking.trim() : "";

  // Caso 1: answer valida (>50 char) → usa answer (sanitizzata)
  if (answer.length > 50) {
    const { cleaned, isFullyChainOfThought } = sanitizeAnswer(answer);
    // Se l'answer dopo strip è vuota MA thinking esiste e non è narrazione →
    // ricadiamo nel caso swap (raro: significa che ANCHE answer era CoT leak)
    if (isFullyChainOfThought && thinking.length > 100 && !looksLikeInternalNarration(thinking)) {
      return {
        thinking: "",
        confidence: parsed.confidence ?? "medium",
        uncertainty_reasons: parsed.uncertainty_reasons,
        answer: thinking,
        citations: parsed.citations,
        no_rag_prefix: parsed.no_rag_prefix,
        followup_suggestions: parsed.followup_suggestions,
        requires_human_review: parsed.requires_human_review,
        propose_action_id: parsed.propose_action_id,
      };
    }
    return {
      thinking: thinking.substring(0, 2000),
      confidence: parsed.confidence ?? "medium",
      uncertainty_reasons: parsed.uncertainty_reasons,
      answer: cleaned || answer,
      citations: parsed.citations,
      no_rag_prefix: parsed.no_rag_prefix,
      followup_suggestions: parsed.followup_suggestions,
      requires_human_review: parsed.requires_human_review,
      propose_action_id: parsed.propose_action_id,
    };
  }

  // Caso 2: answer vuota/corta MA thinking è sostanzioso (>100 char) → SWAP
  // 🛠️ v3: solo se thinking NON è narrazione interna. Promuovere "Ho i dati
  // dai tool. Analizzo: get_X ritorna..." ad answer è peggio del fallback.
  if (thinking.length > 100 && !looksLikeInternalNarration(thinking)) {
    return {
      thinking: "", // svuotato (era effettivamente la risposta)
      confidence: parsed.confidence ?? "medium",
      uncertainty_reasons: parsed.uncertainty_reasons,
      answer: thinking, // <- swap: il "thinking" diventa visibile
      citations: parsed.citations,
      no_rag_prefix: parsed.no_rag_prefix,
      followup_suggestions: parsed.followup_suggestions,
      requires_human_review: parsed.requires_human_review,
      propose_action_id: parsed.propose_action_id,
    };
  }

  // Caso 3: answer breve (es. 1-50 char) ma esistente → usa lo stesso
  if (answer.length > 0) {
    return {
      thinking: thinking.substring(0, 2000),
      confidence: parsed.confidence ?? "medium",
      answer,
    } as StructuredAiResponse;
  }

  return null;
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
    if (cleanAnswer.length > 50) {
      // Caso normale: answer valida
      const thinkingMatch = /"thinking"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(jsonSlice);
      const confMatch = /"confidence"\s*:\s*"(high|medium|low)"/i.exec(jsonSlice);
      return {
        thinking: thinkingMatch ? thinkingMatch[1].slice(0, 2000) : "",
        confidence: (confMatch?.[1]?.toLowerCase() as "high" | "medium" | "low") ?? "low",
        answer: cleanAnswer,
      };
    }
    // 🆕 Caso swap: answer corta, thinking lungo → usa thinking come answer
    const thinkingLooseMatch = /"thinking"\s*:\s*"([\s\S]*?)(?:"\s*(?:[,}]|$)|$)/s.exec(jsonSlice);
    const thinkingContent = thinkingLooseMatch?.[1]
      ?.replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
    if (thinkingContent && thinkingContent.length > 100) {
      return {
        thinking: "",
        confidence: "medium" as const,
        answer: thinkingContent,
      };
    }
    // Fallback: usa answer corta come ultima spiaggia
    if (cleanAnswer.length > 0) {
      return {
        thinking: "",
        confidence: "low" as const,
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
