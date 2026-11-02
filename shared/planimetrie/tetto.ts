/**
 * Il tetto sopra un piano: le falde e i pannelli fotovoltaici che ci stanno.
 *
 * Un'unica geometria per il 3D, per il conteggio dei pannelli e per il computo. Si lavora in
 * coordinate «di pianta» con y verso il basso (sud in basso, come sul foglio), in cm; le quote
 * (z) sono in cm da terra del piano. Il tetto copre il rettangolo dei muri, allargato dello sporto.
 *
 * Tipi: piano (soletta), una falda (sale verso nord), due falde (colmo sul lato lungo, timpani),
 * padiglione (quattro falde), shed (a dente di sega: falde a nord-sud in serie, tipico dei
 * capannoni, con la parte verticale vetrata a nord).
 */
export type TipoTetto = "piano" | "una_falda" | "due_falde" | "padiglione" | "shed";

export interface Fotovoltaico {
  /** Watt di picco di un pannello (predefinito 430). */
  potenzaPannelloW?: number;
  /** Al massimo questi pannelli (predefinito: quanti ne stanno). */
  pannelliMax?: number;
}

export interface TettoGeom {
  tipo: TipoTetto;
  pendenza: number;
  sporto: number;
  fotovoltaico?: Fotovoltaico;
  /**
   * Mansarda: le stanze stanno sotto le falde, senza solaio. `imposta` è l'altezza (cm) del
   * soffitto inclinato dove incontra i muri esterni di gronda: da lì il tetto sale.
   */
  mansarda?: { imposta: number };
}

/**
 * La quota (cm) da cui partono le falde, sul bordo dello sporto. Senza mansarda è la cima dei
 * muri; con la mansarda la falda passa per l'imposta sulla linea dei muri, quindi sul bordo
 * dello sporto sta più in basso di sporto × pendenza.
 */
export function baseTetto(t: TettoGeom, cimaMuri: number): number {
  if (!t.mansarda || t.tipo === "piano") return cimaMuri;
  return t.mansarda.imposta - (t.sporto * t.pendenza) / 100;
}

/**
 * La quota (cm) della falda sopra il punto (x, y), o null se il punto non sta sotto il tetto.
 * Sotto il colmo vale la falda più alta. Le coordinate sono quelle usate per le facce.
 */
export function quotaFalde(facce: readonly Faccia[], x: number, y: number): number | null {
  let z: number | null = null;
  for (const f of facce) {
    if (f.genere !== "falda") continue;
    const v = f.vertici;
    // dentro la proiezione sul piano (bordi compresi, con una tolleranza di 0,5 cm)
    let dentro = false;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      if ((v[i].y > y) !== (v[j].y > y) && x < ((v[j].x - v[i].x) * (y - v[i].y)) / (v[j].y - v[i].y) + v[i].x) dentro = !dentro;
    }
    if (!dentro && !v.some((a, i) => { const b = v[(i + 1) % v.length]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (l * l))); return Math.hypot(a.x + t * (b.x - a.x) - x, a.y + t * (b.y - a.y) - y) < 0.5; })) continue;
    // piano della faccia: z = a + b·x + c·y dai primi tre vertici non allineati
    const [p0, p1] = v;
    const p2 = v.slice(2).find((q) => Math.abs((p1.x - p0.x) * (q.y - p0.y) - (p1.y - p0.y) * (q.x - p0.x)) > 1e-6);
    if (!p2) continue;
    const det = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
    const b = ((p1.z - p0.z) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.z - p0.z)) / det;
    const c = ((p1.x - p0.x) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.x - p0.x)) / det;
    const q = p0.z + b * (x - p0.x) + c * (y - p0.y);
    z = z === null ? q : Math.max(z, q);
  }
  return z;
}

export interface P3 { x: number; y: number; z: number }
export type Esposizione = "sud" | "nord" | "est" | "ovest" | "piano";

export interface Faccia {
  vertici: P3[];
  /** Falda (tegole o soletta), timpano (muratura) o vetrata (shed). */
  genere: "falda" | "timpano" | "vetrata";
  esposizione: Esposizione;
}

export interface Rettangolo { x0: number; y0: number; x1: number; y1: number }

/** Il rettangolo coperto: i muri (con il loro spessore) più lo sporto. */
export function rettangoloTetto(muri: ReadonlyArray<{ a: { x: number; y: number }; b: { x: number; y: number }; spessore: number }>, sporto: number): Rettangolo | null {
  if (!muri.length) return null;
  const xs = muri.flatMap((m) => [m.a.x - m.spessore / 2, m.a.x + m.spessore / 2, m.b.x - m.spessore / 2, m.b.x + m.spessore / 2]);
  const ys = muri.flatMap((m) => [m.a.y - m.spessore / 2, m.a.y + m.spessore / 2, m.b.y - m.spessore / 2, m.b.y + m.spessore / 2]);
  return { x0: Math.min(...xs) - sporto, y0: Math.min(...ys) - sporto, x1: Math.max(...xs) + sporto, y1: Math.max(...ys) + sporto };
}

/** L'esposizione di una falda: verso dove scende (sud = +y). */
function esposizioneDi(p: P3[]): Esposizione {
  const u = { x: p[1].x - p[0].x, y: p[1].y - p[0].y, z: p[1].z - p[0].z };
  const v = { x: p[2].x - p[0].x, y: p[2].y - p[0].y, z: p[2].z - p[0].z };
  let n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  if (n.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  const orizz = Math.hypot(n.x, n.y);
  if (orizz < 1e-6 * Math.hypot(n.x, n.y, n.z) + 1e-9) return "piano";
  if (Math.abs(n.y) >= Math.abs(n.x)) return n.y > 0 ? "sud" : "nord";
  return n.x > 0 ? "est" : "ovest";
}

/** Le facce del tetto; `h` è la quota della cima dei muri. */
export function facceTetto(r: Rettangolo, h: number, t: TettoGeom): Faccia[] {
  const p = t.pendenza / 100;
  const falda = (v: P3[]): Faccia => ({ vertici: v, genere: "falda", esposizione: esposizioneDi(v) });
  const timpano = (v: P3[]): Faccia => ({ vertici: v, genere: "timpano", esposizione: "piano" });
  const { x0, x1, y0, y1 } = r;
  if (t.tipo === "piano") return [{ vertici: [{ x: x0, y: y0, z: h + 25 }, { x: x1, y: y0, z: h + 25 }, { x: x1, y: y1, z: h + 25 }, { x: x0, y: y1, z: h + 25 }], genere: "falda", esposizione: "piano" }];
  if (t.tipo === "una_falda") {
    // basso a sud (gronda), alto a nord: la falda guarda a sud, la migliore per i pannelli
    const alto = h + (y1 - y0) * p;
    return [
      falda([{ x: x0, y: y1, z: h }, { x: x1, y: y1, z: h }, { x: x1, y: y0, z: alto }, { x: x0, y: y0, z: alto }]),
      timpano([{ x: x0, y: y1, z: h }, { x: x0, y: y0, z: alto }, { x: x0, y: y0, z: h }]),
      timpano([{ x: x1, y: y1, z: h }, { x: x1, y: y0, z: h }, { x: x1, y: y0, z: alto }]),
      timpano([{ x: x0, y: y0, z: h }, { x: x0, y: y0, z: alto }, { x: x1, y: y0, z: alto }, { x: x1, y: y0, z: h }]),
    ];
  }
  if (t.tipo === "shed") {
    // denti di circa 6 m lungo y (nord-sud): ognuno sale verso nord, poi una vetrata verticale
    const n = Math.max(1, Math.round((y1 - y0) / 600));
    const passo = (y1 - y0) / n;
    const alto = h + passo * p;
    const out: Faccia[] = [];
    for (let i = 0; i < n; i++) {
      const sud = y1 - i * passo, nord = sud - passo;
      out.push(falda([{ x: x0, y: sud, z: h }, { x: x1, y: sud, z: h }, { x: x1, y: nord, z: alto }, { x: x0, y: nord, z: alto }]));
      out.push({ vertici: [{ x: x0, y: nord, z: h }, { x: x0, y: nord, z: alto }, { x: x1, y: nord, z: alto }, { x: x1, y: nord, z: h }], genere: "vetrata", esposizione: "nord" });
      out.push(timpano([{ x: x0, y: sud, z: h }, { x: x0, y: nord, z: alto }, { x: x0, y: nord, z: h }]));
      out.push(timpano([{ x: x1, y: sud, z: h }, { x: x1, y: nord, z: h }, { x: x1, y: nord, z: alto }]));
    }
    return out;
  }
  // due falde e padiglione: il colmo corre lungo il lato lungo
  const lungoX = x1 - x0 >= y1 - y0;
  const P = (a: number, b: number, z: number): P3 => (lungoX ? { x: a, y: b, z } : { x: b, y: a, z });
  const [a0, a1, b0, b1] = lungoX ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const meta = (b1 - b0) / 2, bc = (b0 + b1) / 2, colmo = h + meta * p;
  if (t.tipo === "due_falde") {
    const s = t.sporto;
    const zt = h + (meta - s) * p;
    return [
      falda([P(a0, b0, h), P(a1, b0, h), P(a1, bc, colmo), P(a0, bc, colmo)]),
      falda([P(a1, b1, h), P(a0, b1, h), P(a0, bc, colmo), P(a1, bc, colmo)]),
      timpano([P(a0 + s, b0 + s, h), P(a0 + s, b1 - s, h), P(a0 + s, bc, zt)]),
      timpano([P(a1 - s, b1 - s, h), P(a1 - s, b0 + s, h), P(a1 - s, bc, zt)]),
    ];
  }
  const c0 = Math.min(a0 + meta, (a0 + a1) / 2), c1 = Math.max(a1 - meta, (a0 + a1) / 2);
  return [
    falda([P(a0, b0, h), P(a1, b0, h), P(c1, bc, colmo), P(c0, bc, colmo)]),
    falda([P(a1, b1, h), P(a0, b1, h), P(c0, bc, colmo), P(c1, bc, colmo)]),
    falda([P(a0, b1, h), P(a0, b0, h), P(c0, bc, colmo)]),
    falda([P(a1, b0, h), P(a1, b1, h), P(c1, bc, colmo)]),
  ];
}

// ─── Fotovoltaico ─────────────────────────────────────────────────────────────

/** Pannello standard (cm): 113 lungo la gronda, 172 lungo la falda. */
export const PANNELLO = { largo: 113, alto: 172, potenzaW: 430 } as const;
const MARGINE = 40;
const FUGA = 2;

export interface RisultatoFotovoltaico {
  /** Ogni pannello: quattro vertici (in senso antiorario visto da sopra), appena sopra la falda. */
  pannelli: P3[][];
  numero: number;
  kWp: number;
  esposizione: Esposizione[];
}

/** Le falde migliori per i pannelli: sud; senza, est e ovest; un tetto piano, la soletta. */
function falde(facce: Faccia[]): Faccia[] {
  const f = facce.filter((x) => x.genere === "falda");
  for (const scelta of [["sud"], ["est", "ovest"], ["piano"]] as Esposizione[][]) {
    const qui = f.filter((x) => scelta.includes(x.esposizione));
    if (qui.length) return qui;
  }
  return [];
}

/** I pannelli su una falda: righe dalla gronda verso il colmo, centrate, dentro il contorno. */
function pannelliSuFalda(f: Faccia, max: number): P3[][] {
  const v = f.vertici;
  // gronda = i due vertici più bassi in fila; la direzione «su» è perpendicolare, verso il colmo
  const zMin = Math.min(...v.map((p) => p.z));
  const bassi = v.filter((p) => Math.abs(p.z - zMin) < 0.5);
  const piano = f.esposizione === "piano";
  const g0 = piano ? v[0] : bassi[0], g1 = piano ? v[1] : bassi[bassi.length - 1];
  const lg = Math.hypot(g1.x - g0.x, g1.y - g0.y, g1.z - g0.z);
  if (lg < 1) return [];
  const e = { x: (g1.x - g0.x) / lg, y: (g1.y - g0.y) / lg, z: (g1.z - g0.z) / lg };
  // «su» lungo la falda: dal punto della gronda verso il vertice più lontano, tolta la componente e
  const lontano = v.reduce((m, p) => { const d = Math.hypot(p.x - g0.x, p.y - g0.y, p.z - g0.z); return d > m.d ? { p, d } : m; }, { p: v[2], d: 0 }).p;
  const w0 = { x: lontano.x - g0.x, y: lontano.y - g0.y, z: lontano.z - g0.z };
  const k = w0.x * e.x + w0.y * e.y + w0.z * e.z;
  const w1 = { x: w0.x - k * e.x, y: w0.y - k * e.y, z: w0.z - k * e.z };
  const lw = Math.hypot(w1.x, w1.y, w1.z);
  if (lw < 1) return [];
  const u = { x: w1.x / lw, y: w1.y / lw, z: w1.z / lw };
  // contorno della falda nelle coordinate (s lungo la gronda, t su per la falda)
  const st = v.map((p) => { const d = { x: p.x - g0.x, y: p.y - g0.y, z: p.z - g0.z }; return { s: d.x * e.x + d.y * e.y + d.z * e.z, t: d.x * u.x + d.y * u.y + d.z * u.z }; });
  const tMax = Math.max(...st.map((q) => q.t));
  // intervallo in s del contorno all'altezza t
  const intervallo = (t: number): [number, number] | null => {
    const xs: number[] = [];
    st.forEach((a, i) => {
      const b = st[(i + 1) % st.length];
      if ((a.t - t) * (b.t - t) <= 0 && a.t !== b.t) xs.push(a.s + ((t - a.t) / (b.t - a.t)) * (b.s - a.s));
      else if (a.t === t) xs.push(a.s);
    });
    return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
  };
  const sopra = 8; // cm sopra la falda
  const n3 = (() => { const c = { x: e.y * u.z - e.z * u.y, y: e.z * u.x - e.x * u.z, z: e.x * u.y - e.y * u.x }; return c.z < 0 ? { x: -c.x, y: -c.y, z: -c.z } : c; })();
  const punto = (s: number, t: number): P3 => ({ x: g0.x + e.x * s + u.x * t + n3.x * sopra, y: g0.y + e.y * s + u.y * t + n3.y * sopra, z: g0.z + e.z * s + u.z * t + n3.z * sopra });
  const out: P3[][] = [];
  // sui tetti piani le file si distanziano (ombre): 1,6 volte l'altezza del pannello
  const passo = piano ? PANNELLO.alto * 1.6 : PANNELLO.alto + FUGA;
  for (let t = MARGINE; t + PANNELLO.alto <= tMax - MARGINE && out.length < max; t += passo) {
    const a = intervallo(t), b = intervallo(t + PANNELLO.alto);
    if (!a || !b) continue;
    const s0 = Math.max(a[0], b[0]) + MARGINE, s1 = Math.min(a[1], b[1]) - MARGINE;
    const quanti = Math.floor((s1 - s0 + FUGA) / (PANNELLO.largo + FUGA));
    if (quanti <= 0) continue;
    const inizio = (s0 + s1) / 2 - (quanti * (PANNELLO.largo + FUGA) - FUGA) / 2;
    for (let i = 0; i < quanti && out.length < max; i++) {
      const s = inizio + i * (PANNELLO.largo + FUGA);
      out.push([punto(s, t), punto(s + PANNELLO.largo, t), punto(s + PANNELLO.largo, t + PANNELLO.alto), punto(s, t + PANNELLO.alto)]);
    }
  }
  return out;
}

export function fotovoltaicoSulTetto(facce: Faccia[], fv: Fotovoltaico): RisultatoFotovoltaico {
  const scelte = falde(facce);
  let resto = fv.pannelliMax && fv.pannelliMax > 0 ? Math.floor(fv.pannelliMax) : Infinity;
  const pannelli: P3[][] = [];
  for (const f of scelte) {
    const qui = pannelliSuFalda(f, resto);
    pannelli.push(...qui);
    resto -= qui.length;
    if (resto <= 0) break;
  }
  const w = fv.potenzaPannelloW && fv.potenzaPannelloW > 0 ? fv.potenzaPannelloW : PANNELLO.potenzaW;
  return { pannelli, numero: pannelli.length, kWp: Math.round((pannelli.length * w) / 10) / 100, esposizione: [...new Set(scelte.map((f) => f.esposizione))] };
}

/** Superficie delle falde (copertura), in mq: per il computo. */
export function superficieFalde(facce: Faccia[]): number {
  let tot = 0;
  for (const f of facce) {
    if (f.genere !== "falda") continue;
    const v = f.vertici;
    // area di un poligono piano nello spazio: metà del modulo della somma dei prodotti vettoriali
    let nx = 0, ny = 0, nz = 0;
    v.forEach((a, i) => {
      const b = v[(i + 1) % v.length];
      nx += a.y * b.z - a.z * b.y; ny += a.z * b.x - a.x * b.z; nz += a.x * b.y - a.y * b.x;
    });
    tot += Math.hypot(nx, ny, nz) / 2;
  }
  return tot / 10_000;
}
