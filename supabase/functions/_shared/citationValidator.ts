/**
 * citationValidator — MP-03 Citation enforcement
 *
 * Valida la risposta AI vs le source RAG iniettate, e se necessario:
 *   1. Detecta marker [S1], [S2], ... usati inline
 *   2. Detecta citation INVENTATE (marker non presenti nelle source)
 *   3. Rimuove/normalizza la sezione "## Fonti" se errata
 *   4. Aggiunge la sezione "## Fonti" se mancante e ci sono citation
 *   5. Detecta prefix "[no-rag]" che indica risposta puramente conversazionale
 *
 * Modalità (Deno.env CITATION_VALIDATION):
 *   - "warn"     (default): valida e logga, NON modifica response (rollout iniziale)
 *   - "enforce":            usa cleanedResponse (auto-fix Fonti)
 *   - "off":                skip totale, ritorna risultato vuoto
 *
 * NON throw mai: degrada gracefully.
 */
import type { RagSource } from "./ragInjector.ts";

export interface CitationValidationResult {
  citationsUsed: string[];           // ["S1", "S3"]
  citationsAvailable: string[];      // ["S1", "S2", "S3", "S4", "S5", "S6"]
  citationsMissing: boolean;         // true se RAG fornita ma 0 citation
  invalidCitations: string[];        // [Sx] citati ma non esistenti
  /** Chunk IDs citati con formato [chunk:abc12345] — più preciso di [S1] */
  chunkIdsUsed: string[];
  /** Chunk IDs citati ma non presenti nelle source */
  chunkIdsInvalid: string[];
  missingFontiSection: boolean;      // ha citato ma manca "## Fonti"
  noRagPrefix: boolean;              // "[no-rag]" all'inizio
  cleanedResponse: string;           // response con Fonti normalizzata (mode enforce)
  appliedMode: "warn" | "enforce" | "off";
}

const INITIAL_MARKER_RE = /\[S(\d+)\]/g;
const TOOL_MARKER_RE = /\[S(\d+)\+\]/g;
// Formato chunk_id: [chunk:abc12345] (8 char alphanumerici)
const CHUNK_ID_MARKER_RE = /\[chunk:([a-zA-Z0-9]{6,32})\]/g;
const FONTI_SECTION_RE = /\n#{1,3}\s+Fonti\s*[\s\S]*$/i;

export function validateCitations(
  response: string,
  sources: RagSource[],
  mode: "warn" | "enforce" | "off" = "warn",
): CitationValidationResult {
  // Strip [no-rag] anche se mode='off' (è un marker interno mai user-facing)
  const responseStrippedForOff = String(response ?? "")
    .replace(/^\s*\[no-rag\]\s*\n?/i, "")
    .trimStart();
  const empty: CitationValidationResult = {
    citationsUsed: [],
    citationsAvailable: sources.map((s) => s.id),
    citationsMissing: false,
    invalidCitations: [],
    chunkIdsUsed: [],
    chunkIdsInvalid: [],
    missingFontiSection: false,
    noRagPrefix: String(response ?? "").trimStart().toLowerCase().startsWith("[no-rag]"),
    cleanedResponse: responseStrippedForOff,
    appliedMode: mode,
  };
  if (mode === "off") return empty;

  const text = String(response ?? "");
  const available = sources.map((s) => s.id);
  const used = new Set<string>();
  const toolUsed = new Set<string>();
  let m: RegExpExecArray | null;

  // reset regex (global stateful). [S1] valida solo fonti pre-RAG; [S1+]
  // indica fonti recuperate via tool e non deve mascherare citazioni inventate.
  INITIAL_MARKER_RE.lastIndex = 0;
  while ((m = INITIAL_MARKER_RE.exec(text)) !== null) {
    used.add(`S${m[1]}`);
  }
  TOOL_MARKER_RE.lastIndex = 0;
  while ((m = TOOL_MARKER_RE.exec(text)) !== null) {
    toolUsed.add(`S${m[1]}+`);
  }

  // Chunk ID markers — più precisi di [Sx]: l'LLM cita il chunk esatto
  const chunkIdsUsedSet = new Set<string>();
  CHUNK_ID_MARKER_RE.lastIndex = 0;
  while ((m = CHUNK_ID_MARKER_RE.exec(text)) !== null) {
    chunkIdsUsedSet.add(m[1]);
  }
  const chunkIdsAvailable = new Set(
    sources.map((s) => s.chunk_id).filter((id): id is string => Boolean(id))
  );
  const chunkIdsInvalid = Array.from(chunkIdsUsedSet).filter(
    (id) => !chunkIdsAvailable.has(id)
  );

  const usedArr = Array.from(used).sort();
  const invalid = usedArr.filter((s) => !available.includes(s));
  const noRag = text.trimStart().startsWith("[no-rag]");
  const hasFontiSection = FONTI_SECTION_RE.test(text);
  const missingFonti =
    (used.size > 0 || toolUsed.size > 0 || chunkIdsUsedSet.size > 0) && !hasFontiSection;
  const citationsMissing =
    !noRag &&
    sources.length > 0 &&
    used.size === 0 &&
    toolUsed.size === 0 &&
    chunkIdsUsedSet.size === 0;

  let cleanedResponse = text;

  // 🆕 Strip [no-rag] prefix SEMPRE (è un marker interno LLM, non per l'utente).
  // Bug fix: prima il prefisso era visibile in chat ("[no-rag] Ciao...") perché
  // veniva solo rilevato in `noRagPrefix` ma mai rimosso dalla response.
  if (noRag) {
    cleanedResponse = cleanedResponse
      .replace(/^\s*\[no-rag\]\s*\n?/i, "")
      .trimStart();
  }

  if (mode === "enforce" && used.size > 0) {
    // Costruisci sezione Fonti deterministica
    const fontiBlock = [
      "",
      "## Fonti",
      ...usedArr
        .filter((id) => available.includes(id))
        .map((id) => {
          const s = sources.find((x) => x.id === id)!;
          return `- [${id}] ${s.title} (sim ${s.similarity.toFixed(2)})`;
        }),
    ].join("\n");

    if (hasFontiSection) {
      cleanedResponse = cleanedResponse.replace(FONTI_SECTION_RE, fontiBlock);
    } else {
      cleanedResponse = cleanedResponse.trimEnd() + fontiBlock;
    }
  }

  return {
    citationsUsed: usedArr,
    citationsAvailable: available,
    citationsMissing,
    invalidCitations: invalid,
    chunkIdsUsed: Array.from(chunkIdsUsedSet),
    chunkIdsInvalid,
    missingFontiSection: missingFonti,
    noRagPrefix: noRag,
    cleanedResponse,
    appliedMode: mode,
  };
}

/** Helper per ricavare la mode dall'env (default warn). */
export function getCitationMode(): "warn" | "enforce" | "off" {
  const raw = (Deno.env.get("CITATION_VALIDATION") ?? "warn").toLowerCase();
  if (raw === "enforce" || raw === "off") return raw;
  return "warn";
}

/** Blocco testuale da APPENDERE al system prompt per indurre il modello a citare. */
export const CITATION_FORMAT_RULES = `
# FORMATO RISPOSTA OBBLIGATORIO — Citation rules

Quando usi un'informazione del blocco CONTEXT RAG (sopra), cita inline col marker [S1], [S2], ...
Esempio: "Il DSO medio del settore edile è 87 giorni [S2], mentre la tua azienda è a 112 giorni [S5]."

Se la risposta usa almeno un marker, chiudi con questa sezione (NIENTE di più, NIENTE di meno):

## Fonti
- [S1] {title} (sim {similarity})
- [S2] ...

Se la risposta è puramente conversazionale (saluto, conferma, chiarimento) e NON usa il blocco RAG,
premetti \`[no-rag]\` come PRIMA riga della risposta e ometti la sezione Fonti.

Se hai chiamato \`search_brain\` durante la risposta (tool call), tratta i risultati come fonti
ulteriori aggiungendo [S1+], [S2+], ... alla numerazione.

# Anti-pattern (mai fare)
- Citare un marker [Sx] che non esiste nel CONTEXT RAG
- Aggiungere fonti inventate alla sezione 'Fonti'
- Concludere con frasi tipo 'fonti: vari documenti aziendali' senza marker espliciti
`;
