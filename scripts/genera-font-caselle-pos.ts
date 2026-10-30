/**
 * Genera il mini-font TrueType delle caselle del POS: due glifi, ☐ (U+2610) e ☒ (U+2612), disegnati qui sotto
 * (quadrati e una X): nessun font di terzi, nessuna licenza da rispettare. Roboto, il font del PDF, non ha questi simboli
 * e il modello del decreto (D.I. 9/9/2014) usa le caselle: fino a oggi uscivano come «[x]» e «[ ]».
 *
 * Uso (dalla radice del repository):
 *   deno run -A scripts/genera-font-caselle-pos.ts
 * Riscrive supabase/functions/_shared/posFontCaselle.ts. Il risultato si controlla con
 * `deno test -A --config supabase/functions/genera-pos/deno.json supabase/functions/_shared/posFont_test.ts`.
 */

type Punto = [number, number];
const UPM = 1000;
const LARGHEZZA = 780;

/** Area con segno ×2 (asse y verso l'alto): positiva = antiorario. */
const area2 = (p: Punto[]) => p.reduce((s, [x1, y1], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x1 * y2 - x2 * y1; }, 0);
/** TrueType: i contorni esterni sono orari, i fori antiorari (riempimento «nonzero»). */
const orario = (p: Punto[]) => (area2(p) < 0 ? p : [...p].reverse());
const antiorario = (p: Punto[]) => (area2(p) > 0 ? p : [...p].reverse());
const rettangolo = (x0: number, y0: number, x1: number, y1: number): Punto[] => [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];

// Quadrato 680×680 con bordo di 62 unità, un po' sotto la linea di base come fanno le caselle dei font di sistema.
const ESTERNO = orario(rettangolo(50, -30, 730, 650));
const FORO = antiorario(rettangolo(112, 32, 668, 588));

// La X è un unico contorno (un «+» ruotato di 45°): niente sovrapposizioni, quindi nessun buco al centro con qualunque regola di riempimento.
function croce(cx: number, cy: number, a: number, b: number): Punto[] {
  const piu: Punto[] = [[b, a], [b, -a], [a, -a], [a, -b], [-a, -b], [-a, -a], [-b, -a], [-b, a], [-a, a], [-a, b], [a, b], [a, a]];
  const r = Math.SQRT1_2;
  return orario(piu.map(([u, v]): Punto => [Math.round(cx + (u - v) * r), Math.round(cy + (u + v) * r)]));
}
const X = croce(390, 310, 42, 330);

const GLIFI: Array<{ contorni: Punto[][]; avanzamento: number }> = [
  { contorni: [], avanzamento: 500 }, // .notdef vuoto
  { contorni: [ESTERNO, FORO], avanzamento: LARGHEZZA }, // ☐ U+2610
  { contorni: [ESTERNO, FORO, X], avanzamento: LARGHEZZA }, // ☒ U+2612
];
const CODICI = [0x2610, 0x2612];

// ── Scrittura delle tabelle ────────────────────────────────────────────────────────────────────────────────────────
class Scrittore {
  private dati: number[] = [];
  u8(v: number) { this.dati.push(v & 0xff); return this; }
  u16(v: number) { return this.u8(v >> 8).u8(v); }
  i16(v: number) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v: number) { return this.u16(v >>> 16).u16(v & 0xffff); }
  byte(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.u8(b[i]); return this; }
  get lunghezza() { return this.dati.length; }
  bytes() { return Uint8Array.from(this.dati); }
}
const riempi = (b: Uint8Array) => { if (b.length % 4 === 0) return b; const o = new Uint8Array(b.length + (4 - (b.length % 4))); o.set(b); return o; };

function glifo(contorni: Punto[][]): Uint8Array {
  if (!contorni.length) return new Uint8Array(0);
  const punti = contorni.flat();
  const xs = punti.map((p) => p[0]), ys = punti.map((p) => p[1]);
  const w = new Scrittore().i16(contorni.length).i16(Math.min(...xs)).i16(Math.min(...ys)).i16(Math.max(...xs)).i16(Math.max(...ys));
  let fine = -1;
  for (const c of contorni) { fine += c.length; w.u16(fine); }
  w.u16(0); // nessuna istruzione di hinting
  punti.forEach(() => w.u8(0x01)); // tutti punti sulla curva, coordinate come differenze a 16 bit
  let px = 0; for (const [x] of punti) { w.i16(x - px); px = x; }
  let py = 0; for (const [, y] of punti) { w.i16(y - py); py = y; }
  return riempi(w.bytes());
}

const glifiBytes = GLIFI.map((g) => glifo(g.contorni));
const tutti = punti();
function punti() { return GLIFI.flatMap((g) => g.contorni.flat()); }
const xMin = Math.min(...tutti.map((p) => p[0])), xMax = Math.max(...tutti.map((p) => p[0]));
const yMin = Math.min(...tutti.map((p) => p[1])), yMax = Math.max(...tutti.map((p) => p[1]));
const lsb = (i: number) => (GLIFI[i].contorni.length ? Math.min(...GLIFI[i].contorni.flat().map((p) => p[0])) : 0);

function tabellaHead(): Uint8Array {
  return new Scrittore().u32(0x00010000).u32(0x00010000).u32(0) /* checkSumAdjustment: si riempie alla fine */ .u32(0x5f0f3cf5)
    .u16(0x0001).u16(UPM).u32(0).u32(0).u32(0).u32(0).i16(xMin).i16(yMin).i16(xMax).i16(yMax).u16(0).u16(8).i16(2).i16(1).i16(0).bytes();
}
function tabellaHhea(): Uint8Array {
  const minRsb = Math.min(...GLIFI.map((g, i) => (g.contorni.length ? g.avanzamento - lsb(i) - (Math.max(...g.contorni.flat().map((p) => p[0])) - lsb(i)) : 9999)));
  return new Scrittore().u32(0x00010000).i16(800).i16(-200).i16(0).u16(LARGHEZZA).i16(50).i16(minRsb).i16(xMax).i16(1).i16(0).i16(0)
    .i16(0).i16(0).i16(0).i16(0).i16(0).u16(GLIFI.length).bytes();
}
function tabellaMaxp(): Uint8Array {
  const maxPunti = Math.max(...GLIFI.map((g) => g.contorni.flat().length));
  const maxContorni = Math.max(...GLIFI.map((g) => g.contorni.length));
  return new Scrittore().u32(0x00010000).u16(GLIFI.length).u16(maxPunti).u16(maxContorni).u16(0).u16(0).u16(2)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).bytes();
}
function tabellaHmtx(): Uint8Array {
  const w = new Scrittore();
  GLIFI.forEach((g, i) => w.u16(g.avanzamento).i16(lsb(i)));
  return w.bytes();
}
function tabellaCmap(): Uint8Array {
  // Un solo sottotipo (3,1) di formato 4, un segmento per carattere più quello finale obbligatorio.
  const seg = CODICI.length + 1;
  const w = new Scrittore().u16(0).u16(1).u16(3).u16(1).u32(12);
  const lunghezza = 16 + 8 * seg;
  const potenza = 2 ** Math.floor(Math.log2(seg));
  w.u16(4).u16(lunghezza).u16(0).u16(seg * 2).u16(potenza * 2).u16(Math.log2(potenza)).u16(seg * 2 - potenza * 2);
  for (const c of CODICI) w.u16(c);
  w.u16(0xffff).u16(0);
  for (const c of CODICI) w.u16(c);
  w.u16(0xffff);
  CODICI.forEach((c, i) => w.u16((i + 1 - c) & 0xffff));
  w.u16(1);
  for (let i = 0; i < seg; i++) w.u16(0);
  return w.bytes();
}
function tabellaGlyfLoca(): { glyf: Uint8Array; loca: Uint8Array } {
  const glyf = new Scrittore(), loca = new Scrittore();
  for (const g of glifiBytes) { loca.u32(glyf.lunghezza); glyf.byte(g); }
  loca.u32(glyf.lunghezza);
  return { glyf: glyf.bytes(), loca: loca.bytes() };
}
function tabellaName(): Uint8Array {
  const voci: Array<[number, string]> = [[1, "PosCaselle"], [2, "Regular"], [4, "PosCaselle Regular"], [6, "PosCaselle-Regular"]];
  const utf16 = (s: string) => { const b: number[] = []; for (const c of s) b.push(0, c.charCodeAt(0)); return b; };
  const w = new Scrittore().u16(0).u16(voci.length).u16(6 + 12 * voci.length);
  let offset = 0;
  for (const [id, s] of voci) { const l = utf16(s).length; w.u16(3).u16(1).u16(0x0409).u16(id).u16(l).u16(offset); offset += l; }
  for (const [, s] of voci) w.byte(utf16(s));
  return w.bytes();
}
function tabellaPost(): Uint8Array {
  return new Scrittore().u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0).bytes();
}

const checksum = (b: Uint8Array) => { let s = 0; const p = riempi(b); for (let i = 0; i < p.length; i += 4) s = (s + ((p[i] << 24) | (p[i + 1] << 16) | (p[i + 2] << 8) | p[i + 3])) >>> 0; return s; };

function costruisci(): Uint8Array {
  const { glyf, loca } = tabellaGlyfLoca();
  const tabelle: Array<[string, Uint8Array]> = [
    ["cmap", tabellaCmap()], ["glyf", glyf], ["head", tabellaHead()], ["hhea", tabellaHhea()], ["hmtx", tabellaHmtx()],
    ["loca", loca], ["maxp", tabellaMaxp()], ["name", tabellaName()], ["post", tabellaPost()],
  ]; // ordine alfabetico dei tag, come vuole la specifica
  const n = tabelle.length;
  const potenza = 2 ** Math.floor(Math.log2(n));
  const testa = new Scrittore().u32(0x00010000).u16(n).u16(potenza * 16).u16(Math.log2(potenza)).u16(n * 16 - potenza * 16);
  let offset = 12 + 16 * n;
  const corpo: Uint8Array[] = [];
  let posizioneHead = 0;
  for (const [tag, dati] of tabelle) {
    const rd = riempi(dati);
    if (tag === "head") posizioneHead = offset;
    testa.byte([...tag].map((c) => c.charCodeAt(0))).u32(checksum(dati)).u32(offset).u32(dati.length);
    corpo.push(rd); offset += rd.length;
  }
  const font = new Uint8Array(offset);
  font.set(testa.bytes(), 0);
  let o = 12 + 16 * n;
  for (const c of corpo) { font.set(c, o); o += c.length; }
  const aggiusta = (0xb1b0afba - checksum(font)) >>> 0; // checkSumAdjustment = 0xB1B0AFBA − somma dell'intero font
  new DataView(font.buffer).setUint32(posizioneHead + 8, aggiusta);
  return font;
}

const font = costruisci();
const base64 = btoa(String.fromCharCode(...font));
const destinazione = new URL("../supabase/functions/_shared/posFontCaselle.ts", import.meta.url);
await Deno.writeTextFile(destinazione, `// Generato da scripts/genera-font-caselle-pos.ts: non modificare a mano (vedi lo script per il disegno dei glifi).
// Mini-font TrueType con due caselle, ☐ (U+2610) e ☒ (U+2612), ${font.length} byte.
export const FONT_CASELLE_BASE64 = "${base64}";
`);
console.log(`posFontCaselle.ts scritto: ${font.length} byte di font, ${base64.length} caratteri base64`);
