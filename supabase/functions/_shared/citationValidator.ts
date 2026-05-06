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
  missingFontiSection: boolean;      // ha citato ma manca "## Fonti"
  noRagPrefix: boolean;              // "[no-rag]" all'inizio
  cleanedResponse: string;           // response con Fonti normalizzata (mode enforce)
  appliedMode: "warn" | "enforce" | "off";
}

const MARKER_RE = /\[S(\d+)\+?\]/g;
const FONTI_SECTION_RE = /\n#{1,3}\s+Fonti\s*[\s\S]*$/i;

export function validateCitations(
  response: string,
  sources: RagSource[],
  mode: "warn" | "enforce" | "off" = "warn",
): CitationValidationResult {
  const empty: CitationValidationResult = {
    citationsUsed: [],
    citationsAvailable: sources.map((s) => s.id),
    citationsMissing: false,
    invalidCitations: [],
    missingFontiSection: false,
    noRagPrefix: false,
    cleanedResponse: response,
    appliedMode: mode,
  };
  if (mode === "off") return empty;

  const text = String(response ?? "");
  const available = sources.map((s) => s.id);
  const used = new Set<string>();
  let m: RegExpExecArray | null;
  // reset regex (global stateful)
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    used.add(`S${m[1]}`);
  }
  const usedArr = Array.from(used).sort();
  const invalid = usedArr.filter((s) => !available.includes(s));
  const noRag = text.trimStart().startsWith("[no-rag]");
  const hasFontiSection = FONTI_SECTION_RE.test(text);
  const missingFonti = used.size > 0 && !hasFontiSection;
  const citationsMissing = !noRag && sources.length > 0 && used.size === 0;

  let cleanedResponse = text;
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
      cleanedResponse = text.replace(FONTI_SECTION_RE, fontiBlock);
    } else {
      cleanedResponse = text.trimEnd() + fontiBlock;
    }
  }

  return {
    citationsUsed: usedArr,
    citationsAvailable: available,
    citationsMissing,
    invalidCitations: invalid,
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
