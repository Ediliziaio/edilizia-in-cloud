export type QuoteChatCommand = { kind: "price" | "quantity"; index: number; value: number; unit?: string }
  | { kind: "include" | "exclude" | "restore"; index: number };
/** Deliberately explicit commands in this non-LLM prototype. Never guess from
 * ranges, negations, multiple amounts, or a partially parsed sentence. */
export function parseQuoteChatCommand(raw: string): QuoteChatCommand | null {
  const text = raw.trim().toLowerCase();
  const simple = text.match(/^(conferma|escludi|ripristina prezzo)\s+voce\s+(\d{1,2})$/);
  if (simple) return { kind: simple[1] === "conferma" ? "include" : simple[1] === "escludi" ? "exclude" : "restore", index: Number(simple[2]) - 1 };
  const edit = text.match(/^(prezzo|quantità|quantita)\s+voce\s+(\d{1,2})\s*:\s*(\d+(?:[.,]\d{1,2})?)\s*(€|euro|mq|m²|m2|cad|pz|ml|m)?$/);
  if (!edit) return null;
  const n = Number(edit[3].replace(",", "."));
  const kind = edit[1] === "prezzo" ? "price" : "quantity";
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000 || kind === "price" && edit[4] && !["€", "euro"].includes(edit[4])) return null;
  return { kind, index: Number(edit[2]) - 1, value: n, unit: edit[4] };
}
