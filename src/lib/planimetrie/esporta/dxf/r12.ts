/**
 * Un motore DXF in TypeScript, senza dipendenze, che scrive il formato R12
 * (AC1009): il più vecchio e il più letto. Lo aprono AutoCAD, LibreCAD,
 * DraftSight, QCAD, BricsCAD e ogni programma che importa un DXF.
 *
 * Bastano poche entità: LINE, POLYLINE, ARC, CIRCLE, TEXT e SOLID (il pieno dei
 * muri). Il testo va in Windows-1252 come dichiara $DWGCODEPAGE; ciò che non ci
 * sta (rari) va come \U+XXXX, che AutoCAD e LibreCAD capiscono.
 */
import type { DefinizioneLayer, MotoreDxf, OpzioniTestoDxf, PuntoDxf } from "./motore";

/** I caratteri di Windows-1252 fra 0x80 e 0x9F, che in Unicode stanno altrove. */
const CP1252_ALTI: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export function codificaCp1252(testo: string): Uint8Array {
  const byte: number[] = [];
  for (const ch of testo) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) byte.push(c);
    else if (CP1252_ALTI[c] !== undefined) byte.push(CP1252_ALTI[c]);
    else for (const b of `\\U+${c.toString(16).toUpperCase().padStart(4, "0")}`) byte.push(b.charCodeAt(0));
  }
  return Uint8Array.from(byte);
}

const num = (v: number): string => {
  const r = Math.round(v * 10_000) / 10_000;
  return Object.is(r, -0) ? "0.0" : Number.isInteger(r) ? `${r}.0` : String(r);
};

/** I nomi dei layer DXF R12: maiuscole, cifre, $ - _. */
const nomeLayer = (s: string) => s.toUpperCase().replace(/[^A-Z0-9$_-]/g, "_").slice(0, 31) || "0";

export class MotoreDxfR12 implements MotoreDxf {
  readonly nome = "r12-typescript";
  private layers = new Map<string, DefinizioneLayer>([["0", { nome: "0", colore: 7 }]]);
  private entita: string[] = [];
  private conti: Record<string, number> = {};
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  layer(def: DefinizioneLayer): void {
    this.layers.set(nomeLayer(def.nome), { ...def, nome: nomeLayer(def.nome) });
  }

  private conta(layer: string) {
    const l = nomeLayer(layer);
    if (!this.layers.has(l)) this.layers.set(l, { nome: l, colore: 7 });
    this.conti[l] = (this.conti[l] ?? 0) + 1;
    return l;
  }

  private estendi(p: PuntoDxf, r = 0) {
    this.minX = Math.min(this.minX, p.x - r);
    this.minY = Math.min(this.minY, p.y - r);
    this.maxX = Math.max(this.maxX, p.x + r);
    this.maxY = Math.max(this.maxY, p.y + r);
  }

  private coppie(...valori: (string | number)[]) {
    const righe: string[] = [];
    for (let i = 0; i < valori.length; i += 2) {
      const v = valori[i + 1];
      righe.push(String(valori[i]).padStart(3, " "), typeof v === "number" ? num(v) : v);
    }
    this.entita.push(righe.join("\n"));
  }

  private xy(base: number, p: PuntoDxf): (string | number)[] {
    this.estendi(p);
    return [base, p.x, base + 10, p.y, base + 20, 0];
  }

  linea(layer: string, a: PuntoDxf, b: PuntoDxf): void {
    const l = this.conta(layer);
    this.coppie(0, "LINE", 8, l, ...this.xy(10, a), ...this.xy(11, b));
  }

  polilinea(layer: string, punti: PuntoDxf[], chiusa: boolean): void {
    if (punti.length < 2) return;
    const l = this.conta(layer);
    this.coppie(0, "POLYLINE", 8, l, 66, "     1", 10, 0, 20, 0, 30, 0, 70, chiusa ? "     1" : "     0");
    for (const p of punti) this.coppie(0, "VERTEX", 8, l, ...this.xy(10, p));
    this.coppie(0, "SEQEND", 8, l);
  }

  arco(layer: string, centro: PuntoDxf, raggio: number, inizioGradi: number, fineGradi: number): void {
    const l = this.conta(layer);
    this.estendi(centro, raggio);
    this.coppie(0, "ARC", 8, l, 10, centro.x, 20, centro.y, 30, 0, 40, raggio, 50, inizioGradi, 51, fineGradi);
  }

  cerchio(layer: string, centro: PuntoDxf, raggio: number): void {
    const l = this.conta(layer);
    this.estendi(centro, raggio);
    this.coppie(0, "CIRCLE", 8, l, 10, centro.x, 20, centro.y, 30, 0, 40, raggio);
  }

  testo(layer: string, posizione: PuntoDxf, testo: string, altezza: number, o: OpzioniTestoDxf = {}): void {
    const l = this.conta(layer);
    this.estendi(posizione, altezza * Math.max(1, testo.length) * 0.3);
    const h = o.orizzontale === "centro" ? 1 : o.orizzontale === "destra" ? 2 : 0;
    const v = o.verticale === "centro" ? 2 : o.verticale === "alto" ? 3 : 0;
    const pulito = testo.replace(/[\r\n]+/g, " ");
    const allineato = h !== 0 || v !== 0;
    this.coppie(
      0, "TEXT", 8, l, 10, posizione.x, 20, posizione.y, 30, 0, 40, altezza, 1, pulito, 50, o.rotazione ?? 0, 7, "STANDARD",
      ...(allineato ? [72, `     ${h}`, 11, posizione.x, 21, posizione.y, 31, 0, 73, `     ${v}`] : []),
    );
  }

  pieno(layer: string, punti: PuntoDxf[]): void {
    if (punti.length < 3 || punti.length > 4) return;
    const l = this.conta(layer);
    // L'ordine dei vertici di SOLID è a «Z»: 1, 2, 4, 3.
    const [a, b, c, d = punti[2]] = punti;
    this.coppie(0, "SOLID", 8, l, ...this.xy(10, a), ...this.xy(11, b), ...this.xy(12, d), ...this.xy(13, c));
  }

  conteggio(): Record<string, number> {
    return { ...this.conti };
  }

  chiudi(): Uint8Array {
    const vuoto = !Number.isFinite(this.minX);
    const [x0, y0, x1, y1] = vuoto ? [0, 0, 1, 1] : [this.minX, this.minY, this.maxX, this.maxY];
    const c = (codice: number | string, valore: string | number) =>
      `${String(codice).padStart(3, " ")}\n${typeof valore === "number" ? num(valore) : valore}`;
    const righe: string[] = [];
    const push = (...xs: string[]) => righe.push(...xs);

    push(c(0, "SECTION"), c(2, "HEADER"));
    push(c(9, "$ACADVER"), c(1, "AC1009"));
    push(c(9, "$DWGCODEPAGE"), c(3, "ANSI_1252"));
    push(c(9, "$INSBASE"), c(10, 0), c(20, 0), c(30, 0));
    push(c(9, "$EXTMIN"), c(10, x0), c(20, y0), c(30, 0));
    push(c(9, "$EXTMAX"), c(10, x1), c(20, y1), c(30, 0));
    push(c(9, "$LIMMIN"), c(10, x0), c(20, y0));
    push(c(9, "$LIMMAX"), c(10, x1), c(20, y1));
    push(c(9, "$LUNITS"), c(70, "     2"), c(9, "$LUPREC"), c(70, "     2"));
    push(c(9, "$TEXTSTYLE"), c(7, "STANDARD"), c(9, "$CLAYER"), c(8, "0"));
    push(c(0, "ENDSEC"));

    push(c(0, "SECTION"), c(2, "TABLES"));
    push(c(0, "TABLE"), c(2, "LTYPE"), c(70, "     2"));
    push(c(0, "LTYPE"), c(2, "CONTINUOUS"), c(70, "     0"), c(3, "Continua"), c(72, "    65"), c(73, "     0"), c(40, 0));
    push(c(0, "LTYPE"), c(2, "TRATTEGGIATA"), c(70, "     0"), c(3, "__ __ __"), c(72, "    65"), c(73, "     2"), c(40, 15), c(49, 10), c(49, -5));
    push(c(0, "ENDTAB"));
    push(c(0, "TABLE"), c(2, "LAYER"), c(70, `${this.layers.size}`.padStart(6, " ")));
    for (const def of this.layers.values()) {
      push(c(0, "LAYER"), c(2, def.nome), c(70, "     0"), c(62, `${def.colore}`.padStart(6, " ")), c(6, def.tipoLinea ?? "CONTINUOUS"));
    }
    push(c(0, "ENDTAB"));
    push(c(0, "TABLE"), c(2, "STYLE"), c(70, "     1"));
    push(c(0, "STYLE"), c(2, "STANDARD"), c(70, "     0"), c(40, 0), c(41, 1), c(50, 0), c(71, "     0"), c(42, 2.5), c(3, "txt"), c(4, ""));
    push(c(0, "ENDTAB"));
    push(c(0, "ENDSEC"));

    push(c(0, "SECTION"), c(2, "BLOCKS"), c(0, "ENDSEC"));

    push(c(0, "SECTION"), c(2, "ENTITIES"));
    righe.push(...this.entita);
    push(c(0, "ENDSEC"), c(0, "EOF"));
    // Fine riga CR LF, come li scrive AutoCAD.
    return codificaCp1252((righe.join("\n") + "\n").replace(/\n/g, "\r\n"));
  }
}
