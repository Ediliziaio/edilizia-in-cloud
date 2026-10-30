/**
 * La pianta in SVG, in scala: larghezza e altezza sono in millimetri veri,
 * il disegno dentro è in centimetri della pianta. Aperto in un browser o in
 * Inkscape e stampato al 100%, un muro di 4 m a 1:50 misura 8 cm.
 */
import { costruisciScena, ORDINE_LAYER, type OpzioniScena, type Primitiva, type Scena, type Tratto } from "./scena";
import type { VistaPianta } from "./tipi";

/** L'altezza di un carattere maiuscolo rispetto al corpo, per Helvetica. */
export const ALTEZZA_MAIUSCOLA = 0.72;

export interface OpzioniSvg extends OpzioniScena {
  sfondo?: "bianco" | "trasparente";
  /** Margine bianco attorno al disegno, in mm stampati. */
  margineMm?: number;
}

export interface RisultatoSvg {
  svg: string;
  larghezzaMm: number;
  altezzaMm: number;
  scena: Scena;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();

function attributiTratto(t: Tratto | undefined, mm: (v: number) => number): string {
  if (!t) return ` stroke="none"`;
  const tratteggio = t.tratteggioMm?.length ? ` stroke-dasharray="${t.tratteggioMm.map((v) => n(mm(v))).join(" ")}"` : "";
  return ` stroke="${t.colore}" stroke-width="${n(mm(t.spessoreMm))}" stroke-linejoin="round" stroke-linecap="round"${tratteggio}`;
}

function primitivaSvg(p: Primitiva, mm: (v: number) => number): string {
  switch (p.tipo) {
    case "poligono": {
      const punti = p.punti.map((q) => `${n(q.x)},${n(q.y)}`).join(" ");
      const fill = p.chiuso && p.riempimento ? p.riempimento : "none";
      return `<${p.chiuso ? "polygon" : "polyline"} points="${punti}" fill="${fill}"${attributiTratto(p.tratto, mm)}/>`;
    }
    case "cerchio":
      return `<circle cx="${n(p.centro.x)}" cy="${n(p.centro.y)}" r="${n(p.raggio)}" fill="${p.riempimento ?? "none"}"${attributiTratto(p.tratto, mm)}/>`;
    case "arco": {
      const a = { x: p.centro.x + p.raggio * Math.cos(p.inizio), y: p.centro.y + p.raggio * Math.sin(p.inizio) };
      const b = { x: p.centro.x + p.raggio * Math.cos(p.fine), y: p.centro.y + p.raggio * Math.sin(p.fine) };
      const grande = p.fine - p.inizio > Math.PI ? 1 : 0;
      return `<path d="M${n(a.x)} ${n(a.y)} A${n(p.raggio)} ${n(p.raggio)} 0 ${grande} 1 ${n(b.x)} ${n(b.y)}" fill="none"${attributiTratto(p.tratto, mm)}/>`;
    }
    case "testo": {
      const ancora = p.allinea === "sinistra" ? "start" : p.allinea === "destra" ? "end" : "middle";
      const base = p.verticale === "alto" ? "hanging" : p.verticale === "basso" ? "alphabetic" : "central";
      const ruota = p.rotazione ? ` transform="rotate(${n(p.rotazione)} ${n(p.posizione.x)} ${n(p.posizione.y)})"` : "";
      return `<text x="${n(p.posizione.x)}" y="${n(p.posizione.y)}" font-size="${n(mm(p.altezzaMm / ALTEZZA_MAIUSCOLA))}" text-anchor="${ancora}" dominant-baseline="${base}" fill="${p.colore}"${p.grassetto ? ` font-weight="bold"` : ""}${ruota}>${xml(p.testo)}</text>`;
    }
  }
}

/** Disegna una scena già costruita. */
export function scenaInSvg(scena: Scena, opzioni: Pick<OpzioniSvg, "sfondo" | "margineMm"> = {}): RisultatoSvg {
  const mm = (v: number) => (v * scena.scala) / 10;
  const margine = mm(opzioni.margineMm ?? 5);
  const r = scena.riquadro;
  const x0 = r.minX - margine, y0 = r.minY - margine;
  const w = r.maxX - r.minX + 2 * margine, h = r.maxY - r.minY + 2 * margine;
  const larghezzaMm = (w * 10) / scena.scala, altezzaMm = (h * 10) / scena.scala;
  const gruppi = ORDINE_LAYER.map((layer) => {
    const voci = scena.primitive.filter((p) => p.layer === layer);
    if (voci.length === 0) return "";
    return `<g id="${layer.toLowerCase()}">${voci.map((p) => primitivaSvg(p, mm)).join("")}</g>`;
  }).join("\n");
  const sfondo = (opzioni.sfondo ?? "bianco") === "bianco"
    ? `<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="#FFFFFF"/>\n`
    : "";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(larghezzaMm)}mm" height="${n(altezzaMm)}mm" viewBox="${n(x0)} ${n(y0)} ${n(w)} ${n(h)}" font-family="Helvetica, Arial, sans-serif">
<title>Pianta in scala 1:${scena.scala}</title>
${sfondo}${gruppi}
</svg>
`;
  return { svg, larghezzaMm, altezzaMm, scena };
}

export function esportaSvg(vista: VistaPianta, opzioni: OpzioniSvg = {}): RisultatoSvg {
  return scenaInSvg(costruisciScena(vista, opzioni), opzioni);
}
