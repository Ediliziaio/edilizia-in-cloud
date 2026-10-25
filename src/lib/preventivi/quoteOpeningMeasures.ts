/** Bounded arithmetic on explicitly written rectangular opening groups.
 * Not OCR, a survey, catalogue billing dimensions or a pricing conversion. */
export type OpeningMeasure = { count: number; kind: string; widthM: number; heightM: number; areaEachM2: number; areaTotalM2: number };
const round = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const number = (s: string) => Number(s.replace(",", "."));
export function quoteOpeningMeasures(text: string): OpeningMeasure[] {
  if (text.length > 3000) return [];
  const regex = /\b(\d{1,3})\s+(finestre|finestra|portefinestre|portafinestre|portafinestra)\s+(?:da|di)\s+(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/gi;
  const out: OpeningMeasure[] = [];
  for (const match of text.matchAll(regex)) {
    const count = Number(match[1]); const scale = match[5].toLowerCase() === "mm" ? 1000 : match[5].toLowerCase() === "cm" ? 100 : 1;
    const widthM = number(match[3]) / scale, heightM = number(match[4]) / scale;
    if (count < 1 || count > 100 || widthM < .1 || heightM < .1 || widthM > 10 || heightM > 10 || out.length >= 20) return [];
    out.push({ count, kind: match[2].toLowerCase(), widthM, heightM, areaEachM2: round(widthM * heightM), areaTotalM2: round(count * widthM * heightM) });
  }
  return out;
}
export function quoteOpeningMeasureText(groups: OpeningMeasure[]) {
  const n = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 4 });
  return `**Verifica geometrica locale delle misure scritte**\n\n${groups.map(g => `- ${g.count} ${g.kind}, ${n(g.widthM)} × ${n(g.heightM)} m: ${n(g.areaEachM2)} m² ciascuna, **${n(g.areaTotalM2)} m² totali**.`).join("\n")}\n\nSomma geometrica: **${n(round(groups.reduce((sum, g) => sum + g.areaTotalM2, 0)))} m²**. Non è una conferma di rilievo né la quantità fatturabile del prezzario: minimi, maggiorazioni e unità commerciali vanno verificati separatamente. Nessun prezzo o totale monetario applicato.`;
}
