/**
 * P2-4: parser JSON robusto per output LLM (Claude, OpenAI, Gemini, ...).
 *
 * Tollera:
 *   - fence ```json ... ```
 *   - fence ``` ... ``` (senza lingua)
 *   - testo prima e dopo la fence ("Ecco il preventivo:\n```json\n...\n```\n")
 *   - JSON non fenced (raw output)
 *   - whitespace/newline arbitrari
 *
 * Ritorna il valore parsed o lancia Error con un messaggio umano + snippet
 * dell'input.
 */
export function extractJsonFromLLM<T = unknown>(raw: string): T {
  if (raw === null || raw === undefined) {
    throw new Error("LLM response vuota o null");
  }
  if (typeof raw !== "string") {
    throw new Error(`LLM response non è una stringa (${typeof raw})`);
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("LLM response è una stringa vuota");
  }

  // Tentativo 1: direct JSON.parse su tutto l'input.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // continue
  }

  // Tentativo 2: cerca fence ```json ... ``` / ```jsonc ... ``` / ``` ... ```
  const fenceRegex = /```(?:json|jsonc)?\s*\n?([\s\S]*?)\n?```/i;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // continue
    }
  }

  // Tentativo 3: primo `{` e ultimo `}` (JSON object potenzialmente racchiuso
  // in prosa).
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // continue
    }
  }

  // Tentativo 4: primo `[` e ultimo `]` (JSON array).
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // continue
    }
  }

  throw new Error(
    `JSON non estraibile dalla risposta LLM: ${trimmed.slice(0, 300)}`,
  );
}
