// Le caratteristiche tecniche scritte nella voce del computo (23/11/2026): formato, spessore,
// prestazioni, colore, «su misura». Servono a chi ordina e a chi abbina l'articolo del catalogo;
// prima restavano nell'estesa e il materiale usciva col solo nome.
//
// Non entrano nella chiave del materiale: le righe già confermate nelle commesse hanno la
// chiave senza caratteristiche, e cambiarla le farebbe riproporre come nuove.

const REGOLE: { re: RegExp; come?: (m: RegExpExecArray) => string }[] = [
  { re: /\bsu misura\b/i, come: () => "su misura" },
  // 120x140 cm, 60×60, 30x60x1 cm
  { re: /\b\d+(?:[.,]\d+)?\s?[x×]\s?\d+(?:[.,]\d+)?(?:\s?[x×]\s?\d+(?:[.,]\d+)?)?(?:\s?(?:mm|cm|m)\b)?/i },
  { re: /\bspessore\s+(?:di\s+|minimo\s+|medio\s+)?\d+(?:[.,]\d+)?\s?(?:mm|cm)\b/i },
  { re: /(?:\bdiametro\s+(?:di\s+)?|ø\s?|\bdn\s?)\d+(?:[.,]\d+)?(?:\s?(?:mm|cm)\b)?/i },
  { re: /\bh\.?\s?\d+(?:[.,]\d+)?\s?(?:mm|cm|m)\b/i },
  { re: /\bvetrocamera\s+\d[\d/+.,]*(?:\s+basso emissivo)?/i },
  { re: /\bU[wgf]?\s*(?:=|≤|<=|pari a|di)?\s*\d[.,]\d+\s*W\/m[2²]\s?K/ },
  { re: /\b(?:classe|tipo)\s+(?:di resistenza\s+)?[A-Z]{1,3}\s?\d[\w./+-]*/ },
  { re: /\bR?EI\s?\d{2,3}\b/ },
  { re: /\b\d+(?:[.,]\d+)?\s?(?:kWp|kWh|kW|W|A|V|mmq|mm2|mm²|l\/min|bar)\b/ },
  { re: /\b(?:colore|tinta|finitura)\s+(?:RAL\s?\d{4}|[a-zà-ù]+(?:\s[a-zà-ù]+)?)/i },
  { re: /\bRAL\s?\d{4}\b/ },
  { re: /\b(?:marca|modello|mod\.)\s+[A-Z][\w-]*(?:\s[A-Z0-9][\w-]*)?/ },
];

/** Le caratteristiche tecniche lette dal testo della voce, nell'ordine in cui compaiono, senza doppioni. */
export function caratteristicheTecniche(testo: string | null | undefined): string[] {
  const t = (testo ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const trovate: { pos: number; valore: string }[] = [];
  for (const { re, come } of REGOLE) {
    const globale = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (let m = globale.exec(t); m; m = globale.exec(t)) {
      trovate.push({ pos: m.index, valore: (come ? come(m) : m[0]).trim() });
      if (m[0].length === 0) globale.lastIndex++;
    }
  }
  trovate.sort((a, b) => a.pos - b.pos || b.valore.length - a.valore.length);
  const viste: string[] = [];
  for (const { valore } of trovate) {
    const v = valore.toLowerCase();
    // «RAL 9010» dentro «colore RAL 9010»: resta la più lunga.
    if (viste.some((x) => x.toLowerCase().includes(v))) continue;
    viste.push(valore);
  }
  return viste.slice(0, 8);
}

/** Due elenchi dicono la stessa cosa? Per non sommare, senza dirlo, un 120x140 con un 80x140. */
export function stesseCaratteristiche(a: string[], b: string[]): boolean {
  const n = (x: string[]) => x.map((s) => s.toLowerCase().replace(/\s+/g, "")).sort().join("|");
  return n(a) === n(b);
}
