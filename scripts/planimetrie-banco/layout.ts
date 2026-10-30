// Piante sintetiche con verità nota: appartamenti a stanze rettangolari,
// costruiti dividendo un rettangolo (o una L) e assegnando le destinazioni
// per dimensione. Tutto deterministico dal seme: rigenerare dà gli stessi file.
// Nessun dato reale: niente indirizzi, nomi o catastali veri.

export interface Rett { x0: number; y0: number; x1: number; y1: number }

export interface StanzaVera {
  nome: string;
  destinazione: string;
  /** Rettangolo sugli assi dei muri (cm). */
  assi: Rett;
  /** Rettangolo netto (filo interno), cm. */
  netto: Rett;
}

export interface AperturaVera {
  tipo: "porta" | "finestra" | "portafinestra";
  /** Estremi del vano sull'asse del muro (cm). */
  da: { x: number; y: number };
  a: { x: number; y: number };
  stanze: string[];
}

export interface PiantaVera {
  stanze: StanzaVera[];
  aperture: AperturaVera[];
  ingombro: Rett;
}

export const SPESSORE_EST = 30;
export const SPESSORE_INT = 10;

export function rng(seme: number): () => number {
  let s = seme >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arr5 = (v: number) => Math.round(v / 5) * 5;

/** Divide il rettangolo in parti con le aree proporzionali ai pesi, mantenendo l'ordine. */
function dividi(r: Rett, pesi: number[], caso: () => number, out: Rett[]): void {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  if (pesi.length <= 1) {
    out.push(r);
    return;
  }
  const totale = pesi.reduce((a, b) => a + b, 0);
  // punto di taglio che bilancia meglio le due metà (con un po' di caso)
  let migliore = 1;
  let scarto = Infinity;
  let somma = 0;
  for (let i = 1; i < pesi.length; i++) {
    somma += pesi[i - 1];
    const s = Math.abs(somma / totale - 0.5) + caso() * 0.08;
    if (s < scarto) {
      scarto = s;
      migliore = i;
    }
  }
  const sx = pesi.slice(0, migliore);
  const dx = pesi.slice(migliore);
  const quota = sx.reduce((a, b) => a + b, 0) / totale;
  if (w >= h) {
    const x = arr5(r.x0 + w * quota);
    dividi({ ...r, x1: x }, sx, caso, out);
    dividi({ ...r, x0: x }, dx, caso, out);
  } else {
    const y = arr5(r.y0 + h * quota);
    dividi({ ...r, y1: y }, sx, caso, out);
    dividi({ ...r, y0: y }, dx, caso, out);
  }
}

const area = (r: Rett) => (r.x1 - r.x0) * (r.y1 - r.y0);
const lato = (r: Rett) => Math.min(r.x1 - r.x0, r.y1 - r.y0);

/** Tratto in comune fra due rettangoli che si toccano su un asse. */
export function tratto(a: Rett, b: Rett): { da: { x: number; y: number }; a: { x: number; y: number } } | null {
  if (a.x1 === b.x0 || b.x1 === a.x0) {
    const x = a.x1 === b.x0 ? a.x1 : a.x0;
    const y0 = Math.max(a.y0, b.y0);
    const y1 = Math.min(a.y1, b.y1);
    return y1 - y0 > 0 ? { da: { x, y: y0 }, a: { x, y: y1 } } : null;
  }
  if (a.y1 === b.y0 || b.y1 === a.y0) {
    const y = a.y1 === b.y0 ? a.y1 : a.y0;
    const x0 = Math.max(a.x0, b.x0);
    const x1 = Math.min(a.x1, b.x1);
    return x1 - x0 > 0 ? { da: { x: x0, y }, a: { x: x1, y } } : null;
  }
  return null;
}

function vano(t: { da: { x: number; y: number }; a: { x: number; y: number } }, larghezza: number, f: number) {
  const l = Math.hypot(t.a.x - t.da.x, t.a.y - t.da.y);
  const w = Math.min(larghezza, l - 30);
  const c = Math.min(Math.max(l * f, w / 2 + 15), l - w / 2 - 15);
  const ux = (t.a.x - t.da.x) / l;
  const uy = (t.a.y - t.da.y) / l;
  return {
    da: { x: Math.round(t.da.x + ux * (c - w / 2)), y: Math.round(t.da.y + uy * (c - w / 2)) },
    a: { x: Math.round(t.da.x + ux * (c + w / 2)), y: Math.round(t.da.y + uy * (c + w / 2)) },
  };
}

const PROGRAMMI: Record<number, Array<[string, number]>> = {
  3: [["soggiorno", 22], ["camera", 13], ["bagno", 5]],
  4: [["soggiorno", 24], ["camera", 14], ["bagno", 5], ["disimpegno", 4]],
  5: [["soggiorno", 22], ["cucina", 10], ["camera", 14], ["bagno", 5], ["disimpegno", 4.5]],
  6: [["soggiorno", 24], ["cucina", 10], ["camera", 14], ["camera", 10], ["bagno", 5], ["disimpegno", 5]],
  7: [["soggiorno", 26], ["cucina", 11], ["camera", 15], ["camera", 11], ["bagno", 5.5], ["bagno", 4], ["disimpegno", 6]],
  8: [["soggiorno", 28], ["cucina", 12], ["camera", 15], ["camera", 12], ["camera", 9.5], ["bagno", 5.5], ["bagno", 4], ["disimpegno", 7]],
};

export function generaPianta(seme: number, nStanze: number, larghezza: number, profondita: number): PiantaVera {
  const caso = rng(seme);
  const programma = PROGRAMMI[nStanze];
  let rett: Rett[] = [];
  let ordineStanze: Array<[string, number]> = programma;
  let miglioreScarto = Infinity;
  let migliori: { rett: Rett[]; ordine: Array<[string, number]> } | null = null;
  for (let prova = 0; prova < 400; prova++) {
    const mescolate = [...programma].map((x) => [x, caso()] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    rett = [];
    dividi({ x0: 0, y0: 0, x1: larghezza, y1: profondita }, mescolate.map((x) => x[1] * (0.9 + caso() * 0.2)), caso, rett);
    // stanze proporzionate: solo il disimpegno può essere stretto
    const scarto = rett.reduce((s, r, i) => {
      const lt = lato(r);
      const lungo = Math.max(r.x1 - r.x0, r.y1 - r.y0);
      const d = mescolate[i][0];
      const minimo = d === "disimpegno" ? 110 : d === "bagno" ? 160 : 240;
      return s + Math.max(0, minimo - lt) + Math.max(0, lungo / lt - (d === "disimpegno" ? 6 : 2.2)) * 100;
    }, 0);
    if (scarto < miglioreScarto) {
      miglioreScarto = scarto;
      migliori = { rett, ordine: mescolate };
    }
    if (scarto === 0) break;
  }
  rett = migliori!.rett;
  ordineStanze = migliori!.ordine;
  const ingombro = { x0: 0, y0: 0, x1: larghezza, y1: profondita };
  const dest = ordineStanze.map((x) => x[0]);
  const ordine = rett.map((_, i) => i).sort((a, b) => area(rett[b]) - area(rett[a]));
  const soggiorno = dest.indexOf("soggiorno");
  ordine.splice(ordine.indexOf(soggiorno), 1);
  ordine.unshift(soggiorno);
  const contatori: Record<string, number> = {};
  const totali: Record<string, number> = {};
  dest.forEach((d) => (totali[d] = (totali[d] ?? 0) + 1));
  const NOMI: Record<string, string> = { soggiorno: "Soggiorno", cucina: "Cucina", camera: "Camera", bagno: "Bagno", disimpegno: "Disimpegno" };
  const stanze: StanzaVera[] = rett.map((r, i) => {
    const d = dest[i];
    contatori[d] = (contatori[d] ?? 0) + 1;
    const nome = totali[d] > 1 ? `${NOMI[d]} ${contatori[d]}` : NOMI[d];
    const ins = (v: number, bordo: number) => (v === bordo ? SPESSORE_EST / 2 : SPESSORE_INT / 2);
    return {
      nome,
      destinazione: d,
      assi: r,
      netto: {
        x0: r.x0 + ins(r.x0, ingombro.x0),
        y0: r.y0 + ins(r.y0, ingombro.y0),
        x1: r.x1 - ins(r.x1, ingombro.x1),
        y1: r.y1 - ins(r.y1, ingombro.y1),
      },
    };
  });

  // Porte: albero di collegamento a partire dal soggiorno.
  const aperture: AperturaVera[] = [];
  const collegate = new Set<number>([ordine[0]]);
  while (collegate.size < stanze.length) {
    let migliore: { a: number; b: number; l: number } | null = null;
    for (const a of collegate) {
      for (let b = 0; b < stanze.length; b++) {
        if (collegate.has(b)) continue;
        const t = tratto(stanze[a].assi, stanze[b].assi);
        if (!t) continue;
        const l = Math.hypot(t.a.x - t.da.x, t.a.y - t.da.y);
        // Si preferisce passare da disimpegno e soggiorno.
        const peso = l * (["disimpegno", "soggiorno"].includes(stanze[a].destinazione) ? 3 : 1);
        if (l >= 110 && (!migliore || peso > migliore.l)) migliore = { a, b, l: peso };
      }
    }
    if (!migliore) break;
    const t = tratto(stanze[migliore.a].assi, stanze[migliore.b].assi)!;
    const largo = stanze[migliore.b].destinazione === "bagno" ? 70 : 80;
    aperture.push({ tipo: "porta", ...vano(t, largo, 0.25 + caso() * 0.5), stanze: [stanze[migliore.a].nome, stanze[migliore.b].nome] });
    collegate.add(migliore.b);
  }
  // Finestre sui lati esterni, poi il portoncino dove c'è posto.
  type Lato = { da: { x: number; y: number }; a: { x: number; y: number } };
  const lunghezza = (t: Lato) => Math.hypot(t.a.x - t.da.x, t.a.y - t.da.y);
  const latiEsterni = (r: Rett): Lato[] => [
    r.y0 === ingombro.y0 ? { da: { x: r.x0, y: r.y0 }, a: { x: r.x1, y: r.y0 } } : null,
    r.y1 === ingombro.y1 ? { da: { x: r.x0, y: r.y1 }, a: { x: r.x1, y: r.y1 } } : null,
    r.x0 === ingombro.x0 ? { da: { x: r.x0, y: r.y0 }, a: { x: r.x0, y: r.y1 } } : null,
    r.x1 === ingombro.x1 ? { da: { x: r.x1, y: r.y0 }, a: { x: r.x1, y: r.y1 } } : null,
  ].filter((t): t is Lato => t !== null).sort((a, b) => lunghezza(b) - lunghezza(a));
  const libero = (v: Lato) => !aperture.some((ap) => {
    const stessaRiga = v.da.y === v.a.y ? ap.da.y === ap.a.y && ap.da.y === v.da.y : ap.da.x === ap.a.x && ap.da.x === v.da.x;
    if (!stessaRiga) return false;
    const k = v.da.y === v.a.y ? "x" : "y";
    const [a0, a1] = [Math.min(ap.da[k], ap.a[k]), Math.max(ap.da[k], ap.a[k])];
    const [b0, b1] = [Math.min(v.da[k], v.a[k]), Math.max(v.da[k], v.a[k])];
    return Math.min(a1, b1) > Math.max(a0, b0) - 30;
  });
  for (const s of stanze) {
    const lati = latiEsterni(s.assi);
    if (!lati.length || s.destinazione === "disimpegno") continue;
    const tipo = s.destinazione === "soggiorno" ? "portafinestra" : "finestra";
    const largo = s.destinazione === "bagno" ? 60 : tipo === "portafinestra" ? 140 : 120;
    const v = vano(lati[0], largo, s.destinazione === "soggiorno" ? 0.35 : 0.5);
    if (libero(v)) aperture.push({ tipo, ...v, stanze: [s.nome] });
  }
  const candidate = [...stanze].sort((a, b) => ["soggiorno", "disimpegno", "cucina"].indexOf(b.destinazione) - ["soggiorno", "disimpegno", "cucina"].indexOf(a.destinazione));
  cerca: for (const s of candidate) {
    for (const lt of latiEsterni(s.assi)) {
      for (const f of [0.8, 0.2, 0.5]) {
        if (lunghezza(lt) < 160) continue;
        const v = vano(lt, 90, f);
        if (libero(v)) {
          aperture.push({ tipo: "porta", ...v, stanze: [s.nome] });
          break cerca;
        }
      }
    }
  }
  return { stanze, aperture, ingombro };
}
