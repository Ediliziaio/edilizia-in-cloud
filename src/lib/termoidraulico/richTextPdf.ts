/**
 * richTextPdf — converte il testo dei campi "prosa" del template Termoidraulico
 * (Chi siamo, condizioni di pagamento) in blocchi tipizzati pronti per @react-pdf.
 *
 * I campi sono editati con un editor WYSIWYG (TipTap → HTML) ma possono anche
 * contenere testo semplice "legacy" (record salvati prima dell'upgrade). Questo
 * helper normalizza ENTRAMBI i casi in una lista di blocchi:
 *  - paragrafo: una riga di testo con run inline (grassetto/corsivo)
 *  - bullet: voce di elenco puntato
 *
 * È PURO (niente DOM): usabile sia nel render PDF (browser) sia nei test (vitest),
 * e robusto se @react-pdf gira in contesti senza `DOMParser`.
 */

export interface IdrRichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface IdrRichBlock {
  type: "paragraph" | "bullet";
  runs: IdrRichRun[];
}

const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&euro;": "€",
  "&agrave;": "à",
  "&egrave;": "è",
  "&eacute;": "é",
  "&igrave;": "ì",
  "&ograve;": "ò",
  "&ugrave;": "ù",
};

/** Decodifica le entità HTML più comuni (numeriche, esadecimali e nominali note). */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n: string) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&[a-zA-Z][a-zA-Z0-9]+;/g, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function looksLikeHtml(s: string): boolean {
  return /<\/?(p|br|ul|ol|li|strong|b|em|i|h[1-6]|div|span)\b[^>]*>/i.test(s);
}

const BULLET_LINE = /^\s*[-•*•]\s+/;

/** Run inline da un frammento HTML: gestisce <strong>/<b> (grassetto), <em>/<i> (corsivo), <br>; scarta gli altri tag. */
function parseInlineRuns(html: string): IdrRichRun[] {
  const runs: IdrRichRun[] = [];
  let bold = 0;
  let italic = 0;
  const tagRe = /<(\/?)(strong|b|em|i|br)\s*\/?>/gi;
  let last = 0;
  let m: RegExpExecArray | null;

  const push = (rawChunk: string) => {
    const text = decodeHtmlEntities(stripTags(rawChunk)).replace(/\s+/g, " ");
    if (!text) return;
    const isBold = bold > 0;
    const isItalic = italic > 0;
    const prev = runs[runs.length - 1];
    if (prev && Boolean(prev.bold) === isBold && Boolean(prev.italic) === isItalic) {
      prev.text += text;
      return;
    }
    runs.push({ text, ...(isBold ? { bold: true } : {}), ...(isItalic ? { italic: true } : {}) });
  };

  while ((m = tagRe.exec(html))) {
    push(html.slice(last, m.index));
    const slash = m[1];
    const tag = m[2].toLowerCase();
    if (tag === "br") push(" ");
    else if (tag === "strong" || tag === "b") bold = slash ? Math.max(0, bold - 1) : bold + 1;
    else if (tag === "em" || tag === "i") italic = slash ? Math.max(0, italic - 1) : italic + 1;
    last = tagRe.lastIndex;
  }
  push(html.slice(last));

  // Trim bordi del primo/ultimo run.
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^\s+/, "");
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
  }
  return runs.filter((r) => r.text.length > 0);
}

function htmlToBlocks(html: string): IdrRichBlock[] {
  const blocks: IdrRichBlock[] = [];
  const blockRe = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const runs = parseInlineRuns(m[2]);
    if (!runs.length) continue;
    blocks.push({ type: tag === "li" ? "bullet" : "paragraph", runs });
  }
  // Nessun blocco riconosciuto (HTML "inline" senza <p>/<li>): ripiega su testo semplice.
  if (!blocks.length) {
    const plain = decodeHtmlEntities(stripTags(html)).trim();
    return plain ? plainTextToBlocks(plain) : [];
  }
  return blocks;
}

function plainTextToBlocks(text: string): IdrRichBlock[] {
  const blocks: IdrRichBlock[] = [];
  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const allBullets = lines.every((l) => BULLET_LINE.test(l));
    if (allBullets) {
      for (const l of lines) {
        blocks.push({ type: "bullet", runs: [{ text: l.replace(BULLET_LINE, "") }] });
      }
    } else {
      blocks.push({ type: "paragraph", runs: [{ text: lines.join(" ") }] });
    }
  }
  return blocks;
}

/**
 * Converte una stringa (HTML da WYSIWYG o testo semplice legacy) in blocchi per il
 * PDF. Ritorna `[]` per input vuoto/whitespace.
 */
export function htmlToRichBlocks(input: string | null | undefined): IdrRichBlock[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  return looksLikeHtml(raw) ? htmlToBlocks(raw) : plainTextToBlocks(raw);
}

/** Versione "piatta" (solo testo) utile per anteprime/troncamenti. */
export function richBlocksToPlainText(blocks: IdrRichBlock[]): string {
  return blocks
    .map((b) => (b.type === "bullet" ? "• " : "") + b.runs.map((r) => r.text).join(""))
    .join("\n");
}
