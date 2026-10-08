/** Pure, shared by the stream writer and the UI. Never promote private metadata to an answer. */
export interface VisibleAnswerOptions {
  streaming?: boolean;
  structured?: boolean;
}

const INTERNAL_KEYS = new Set([
  "thinking", "confidence", "uncertainty_reasons", "requires_human_review",
  "no_rag_prefix", "followup_suggestions", "propose_action_id",
]);

function quotedString(text: string, start: number) {
  let value = "";
  let i = start + 1;
  for (; i < text.length; i++) {
    const char = text[i];
    if (char === '"') return { value, next: i + 1, closed: true };
    if (char !== "\\") { value += char; continue; }
    const escaped = text[++i];
    if (escaped === undefined) break;
    if (escaped === "u") {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[0-9a-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
      if (!(escaped in escapes)) break;
      value += escapes[escaped];
    }
  }
  // Do not flash half a surrogate pair while a Unicode escape is arriving.
  return { value: value.replace(/[\uD800-\uDBFF]$/, ""), next: i, closed: false };
}

function skipValue(text: string, start: number) {
  let depth = 0;
  let i = start;
  for (; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const string = quotedString(text, i);
      if (!string.closed) return text.length;
      i = string.next - 1;
    } else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") { if (!depth) return i; depth--; }
    else if (char === "," && !depth) return i;
  }
  return i;
}

function readEnvelope(text: string, start: number) {
  let i = start + 1;
  let internal = false;
  let answer: string | undefined;
  while (i < text.length) {
    while (/\s|,/.test(text[i] ?? "") && i < text.length) i++;
    if (text[i] !== '"') break;
    const key = quotedString(text, i);
    if (!key.closed) {
      if (key.value.length >= 3 && [...INTERNAL_KEYS].some(name => name.startsWith(key.value))) internal = true;
      break;
    }
    if (INTERNAL_KEYS.has(key.value)) internal = true;
    i = key.next;
    while (/\s/.test(text[i] ?? "") && i < text.length) i++;
    if (text[i++] !== ":") break;
    while (/\s/.test(text[i] ?? "") && i < text.length) i++;
    if (text[i] === '"') {
      const string = quotedString(text, i);
      if (key.value === "answer") answer = string.value;
      if (!string.closed) break;
      i = string.next;
    } else i = skipValue(text, i);
    while (/\s/.test(text[i] ?? "") && i < text.length) i++;
    if (text[i] === "}") break;
    if (text[i] === ",") i++;
    else if (text[i] !== '"') break; // tolerate a missing comma between quoted fields
  }
  return { internal, answer };
}

/** Handles bare/fenced JSON, a prose preamble, arbitrary chunk boundaries and escaped Markdown. */
export function visibleAiAnswer(raw: string, options: VisibleAnswerOptions = {}): string {
  if (!raw) return "";
  // Only object starts on their own line: a JSON example inside a sentence is not an envelope.
  const starts = /(?:^|\n)[ \t]*(?:```(?:json)?[ \t]*\r?\n[ \t]*)?(?:\[\s*)?(\{)/gi;
  for (const match of raw.matchAll(starts)) {
    const start = match.index! + match[0].lastIndexOf("{");
    const envelope = readEnvelope(raw, start);
    if (envelope.internal) return (envelope.answer ?? "").trim();
    if (options.streaming && !raw.trimEnd().endsWith("}") && !raw.trimEnd().endsWith("```")) {
      // Keep already-readable prose while holding an undecidable code/JSON fragment.
      return options.structured ? "" : raw.slice(0, match.index).trimEnd();
    }
  }
  // Some providers attach the object to their preamble on the same line.
  // Only a recognised private schema triggers extraction, not arbitrary JSON examples.
  for (const match of raw.matchAll(/\{/g)) {
    const envelope = readEnvelope(raw, match.index!);
    if (envelope.internal) return (envelope.answer ?? "").trim();
  }
  // In structured mode the preamble and keys are private. Wait for the answer field.
  if (options.streaming && options.structured) return "";
  // An initial JSON fragment is undecidable. Do not expose its opening keys in the UI.
  if (options.streaming && /^\s*(?:\{|```(?:j(?:s(?:o(?:n)?)?)?)?\s*$|```json\s*\{)/i.test(raw)
    && !raw.trimEnd().endsWith("}")) return "";
  return raw;
}

export const SILVIO_MISSING_PUBLIC_ANSWER = "Non è disponibile una risposta leggibile per questo messaggio. Puoi riprovare con una domanda più specifica.";

/** Also used for the last server-side check, including prose-prefixed/truncated envelopes. */
export function publicAiAnswer(raw: string): string {
  return visibleAiAnswer(raw).trim() || SILVIO_MISSING_PUBLIC_ANSWER;
}
