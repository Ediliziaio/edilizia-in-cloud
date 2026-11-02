/**
 * Rilievo del topografo: i punti battuti sul terreno (X, Y, quota), letti da un file e
 * messi sotto la pianta.
 *
 * File che si leggono:
 * - testo (CSV, TXT, PTS): una riga per punto, «X Y Z» oppure «nome X Y Z [codice]», con
 *   spazi, tabulazioni, punto e virgola o virgole; la virgola decimale va bene se i campi
 *   sono separati da punto e virgola o tabulazione. Metri.
 * - DXF: entità POINT, i vertici delle polilinee 3D (POLYLINE/VERTEX), le LWPOLYLINE delle
 *   curve di livello (quota nel codice 38), LINE e INSERT con la quota. Metri.
 *
 * Le coordinate del topografo sono assolute (Gauss-Boaga, UTM: milioni di metri) e la quota è
 * sul livello del mare: nel modello i punti si tengono in cm rispetto al loro centro, e una
 * trasformazione (spostamento, rotazione, quota del piano terra) li porta sotto la casa.
 *
 * Il terreno fra i punti è la triangolazione di Delaunay (TIN), come nei programmi di
 * topografia: piani fra tre punti vicini, niente «cerchi» attorno ai punti.
 */

export interface PuntoRilievo { x: number; y: number; z: number }

/** Il rilievo salvato nella pianta: punti in cm attorno all'origine, più come metterli. */
export interface Rilievo {
  nome?: string;
  /** Centro dei punti nelle coordinate del topografo (m): per ritrovarli nel file. */
  origine: { x: number; y: number };
  /** [x, y, z] in cm: x e y rispetto all'origine, z la quota assoluta (s.l.m.) in cm. */
  punti: Array<[number, number, number]>;
  /** Spostamento (cm), rotazione (gradi, antioraria) e quota s.l.m. del pavimento del piano terra (cm). */
  posa: { dx: number; dy: number; rotazione: number; quotaZero: number; scambiaXY?: boolean };
}

export const MASSIMO_PUNTI_RILIEVO = 5000;

// ─── Lettura ─────────────────────────────────────────────────────────────────

export interface EsitoLettura { punti: PuntoRilievo[]; scartate: number; formato: "testo" | "dxf" }

export function leggiRilievo(testo: string, nomeFile = ""): EsitoLettura {
  const dxf = /\.dxf$/i.test(nomeFile) || /^\s*0\s*\r?\n\s*SECTION/m.test(testo.slice(0, 2000));
  return dxf ? leggiDxf(testo) : leggiTesto(testo);
}

function numero(s: string, virgolaDecimale: boolean): number | null {
  const t = virgolaDecimale ? s.replace(",", ".") : s;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function leggiTesto(testo: string): EsitoLettura {
  const punti: PuntoRilievo[] = [];
  let scartate = 0;
  for (const riga of testo.split(/\r?\n/)) {
    const r = riga.trim();
    if (!r || r.startsWith("#") || r.startsWith("//")) continue;
    const separatoreForte = /[;\t]/.test(r);
    const campi = separatoreForte ? r.split(/\s*[;\t]\s*/) : r.split(/[\s,]+/);
    const numeri = campi.map((c) => numero(c.trim(), separatoreForte)).filter((v): v is number => v !== null);
    if (numeri.length < 3) { if (/\d/.test(r)) scartate++; continue; }
    // «nome X Y Z [codice]»: col nome numerico i numeri sono quattro o più, le coordinate dal secondo
    const [x, y, z] = numeri.length >= 4 ? numeri.slice(1, 4) : numeri.slice(0, 3);
    punti.push({ x, y, z });
  }
  return { punti, scartate, formato: "testo" };
}

function leggiDxf(testo: string): EsitoLettura {
  const righe = testo.split(/\r?\n/);
  const coppie: Array<[number, string]> = [];
  for (let i = 0; i + 1 < righe.length; i += 2) coppie.push([Number(righe[i].trim()), righe[i + 1].trim()]);
  const punti: PuntoRilievo[] = [];
  let scartate = 0;
  let entita = "";
  let campi: Map<number, string[]> = new Map();
  const chiudi = () => {
    const prendi = (c: number) => (campi.get(c) ?? []).map(Number);
    const xs = prendi(10), ys = prendi(20), zs = prendi(30);
    if (entita === "POINT" || entita === "VERTEX" || entita === "INSERT") {
      if (xs.length && ys.length && zs.length && (entita !== "INSERT" || zs[0] !== 0)) punti.push({ x: xs[0], y: ys[0], z: zs[0] });
    } else if (entita === "LINE") {
      const x2 = prendi(11), y2 = prendi(21), z2 = prendi(31);
      if (zs.length && z2.length && (zs[0] !== 0 || z2[0] !== 0)) { punti.push({ x: xs[0], y: ys[0], z: zs[0] }); punti.push({ x: x2[0], y: y2[0], z: z2[0] }); }
    } else if (entita === "LWPOLYLINE") {
      const quota = prendi(38)[0];
      if (quota !== undefined && quota !== 0) for (let k = 0; k < Math.min(xs.length, ys.length); k++) punti.push({ x: xs[k], y: ys[k], z: quota });
      else if (xs.length) scartate++;
    }
  };
  let inEntita = false;
  for (const [codice, valore] of coppie) {
    if (codice === 0) {
      if (inEntita) chiudi();
      entita = valore;
      campi = new Map();
      inEntita = ["POINT", "VERTEX", "INSERT", "LINE", "LWPOLYLINE"].includes(valore);
      continue;
    }
    if (!inEntita) continue;
    const l = campi.get(codice) ?? [];
    l.push(valore);
    campi.set(codice, l);
  }
  if (inEntita) chiudi();
  return { punti: punti.filter((p) => [p.x, p.y, p.z].every(Number.isFinite)), scartate, formato: "dxf" };
}

/**
 * Dai punti letti al rilievo da salvare: doppioni tolti, al massimo MASSIMO_PUNTI_RILIEVO
 * (se sono di più se ne tiene uno ogni tanto), quote in mm riconosciute. Errore se i punti
 * non hanno quote o sono meno di tre.
 */
export function creaRilievo(letti: PuntoRilievo[], nome?: string): Rilievo {
  if (letti.length < 3) throw new Error("Nel file ci sono meno di tre punti con X, Y e quota.");
  if (letti.every((p) => p.z === letti[0].z)) throw new Error("I punti del file hanno tutti la stessa quota: manca l'altimetria.");
  // quote in millimetri (rilievi esportati in mm): oltre 10 km non è una quota in metri
  const zm = mediana(letti.map((p) => Math.abs(p.z)));
  const kz = zm > 10_000 ? 0.001 : 1;
  const xy = mediana(letti.map((p) => Math.abs(p.x) + Math.abs(p.y)));
  const kxy = xy > 50_000_000 ? 0.001 : 1; // coordinate in mm
  const visti = new Set<string>();
  let unici = letti.filter((p) => {
    const k = `${Math.round(p.x * kxy * 100)}:${Math.round(p.y * kxy * 100)}`;
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
  if (unici.length > MASSIMO_PUNTI_RILIEVO) {
    const passo = unici.length / MASSIMO_PUNTI_RILIEVO;
    unici = Array.from({ length: MASSIMO_PUNTI_RILIEVO }, (_, i) => unici[Math.floor(i * passo)]);
  }
  const cx = unici.reduce((t, p) => t + p.x * kxy, 0) / unici.length;
  const cy = unici.reduce((t, p) => t + p.y * kxy, 0) / unici.length;
  const punti = unici.map((p): [number, number, number] => [Math.round((p.x * kxy - cx) * 100), Math.round((p.y * kxy - cy) * 100), Math.round(p.z * kz * 100)]);
  return {
    ...(nome ? { nome: nome.slice(0, 120) } : {}),
    origine: { x: Math.round(cx * 1000) / 1000, y: Math.round(cy * 1000) / 1000 },
    punti,
    posa: { dx: 0, dy: 0, rotazione: 0, quotaZero: Math.round(mediana(punti.map((p) => p[2]))) },
  };
}

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** I punti del rilievo nelle coordinate della pianta (cm, y in su) e quota rispetto al piano terra. */
export function puntiDelRilievo(r: Rilievo): Array<{ x: number; y: number; quota: number }> {
  const a = (r.posa.rotazione * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return r.punti.map(([x0, y0, z]) => {
    const [x, y] = r.posa.scambiaXY ? [y0, x0] : [x0, y0];
    return { x: x * c - y * s + r.posa.dx, y: x * s + y * c + r.posa.dy, quota: z - r.posa.quotaZero };
  });
}

export function rilievoValido(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const n = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const o = r.origine as Record<string, unknown> | undefined;
  const p = r.posa as Record<string, unknown> | undefined;
  return (r.nome === undefined || typeof r.nome === "string")
    && !!o && n(o.x) && n(o.y)
    && !!p && n(p.dx) && n(p.dy) && n(p.rotazione) && n(p.quotaZero) && (p.scambiaXY === undefined || typeof p.scambiaXY === "boolean")
    && Array.isArray(r.punti) && r.punti.length <= MASSIMO_PUNTI_RILIEVO
    && r.punti.every((q) => Array.isArray(q) && q.length === 3 && q.every(n));
}

// ─── Triangolazione di Delaunay (Bowyer-Watson) ──────────────────────────────

export interface Tin { punti: Array<{ x: number; y: number; quota: number }>; triangoli: Array<[number, number, number]> }

export function triangola(punti: Array<{ x: number; y: number; quota: number }>): Tin {
  const n = punti.length;
  if (n < 3) return { punti, triangoli: [] };
  const xs = punti.map((p) => p.x), ys = punti.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const d = Math.max(maxX - minX, maxY - minY) * 20 || 1;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...punti.map((p) => ({ x: p.x, y: p.y })), { x: mx - d, y: my - d }, { x: mx + d, y: my - d }, { x: mx, y: my + d }];
  type T = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const circ = (a: number, b: number, c: number): T => {
    const A = P[a], B = P[b], C = P[c];
    const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) || 1e-12;
    const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / D;
    const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / D;
    return { a, b, c, cx: ux, cy: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };
  let tri: T[] = [circ(n, n + 1, n + 2)];
  // inserimento in ordine di x: i triangoli «chiusi» (cerchio tutto a sinistra) si mettono da parte
  const ordine = punti.map((_, i) => i).sort((i, j) => P[i].x - P[j].x);
  const chiusi: T[] = [];
  for (const i of ordine) {
    const p = P[i];
    const bordo: Array<[number, number]> = [];
    const restano: T[] = [];
    for (const t of tri) {
      const dx = p.x - t.cx;
      if (dx > 0 && dx * dx > t.r2) { chiusi.push(t); continue; }
      if (dx * dx + (p.y - t.cy) ** 2 < t.r2) bordo.push([t.a, t.b], [t.b, t.c], [t.c, t.a]);
      else restano.push(t);
    }
    // i lati presenti una volta sola sono il contorno del buco
    const conta = new Map<string, number>();
    for (const [u, v] of bordo) { const k = u < v ? `${u},${v}` : `${v},${u}`; conta.set(k, (conta.get(k) ?? 0) + 1); }
    for (const [u, v] of bordo) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (conta.get(k) === 1) restano.push(circ(u, v, i));
    }
    tri = restano;
  }
  const tutti = [...chiusi, ...tri].filter((t) => t.a < n && t.b < n && t.c < n);
  return { punti, triangoli: tutti.map((t) => [t.a, t.b, t.c]) };
}

/** Indice a griglia dei triangoli, per trovare in fretta quello sotto un punto. */
export interface TinIndicizzato extends Tin { cerca: (x: number, y: number) => number | null }

export function indicizza(tin: Tin): TinIndicizzato {
  const { punti, triangoli } = tin;
  if (!triangoli.length) return { ...tin, cerca: () => null };
  const xs = punti.map((p) => p.x), ys = punti.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const lato = Math.max(1, Math.ceil(Math.sqrt(triangoli.length / 2)));
  const cw = (x1 - x0) / lato || 1, ch = (y1 - y0) / lato || 1;
  const celle: number[][] = Array.from({ length: lato * lato }, (): number[] => []);
  const cella = (v: number, o: number, w: number) => Math.max(0, Math.min(lato - 1, Math.floor((v - o) / w)));
  triangoli.forEach(([a, b, c], k) => {
    const tx = [punti[a].x, punti[b].x, punti[c].x], ty = [punti[a].y, punti[b].y, punti[c].y];
    for (let i = cella(Math.min(...tx), x0, cw); i <= cella(Math.max(...tx), x0, cw); i++)
      for (let j = cella(Math.min(...ty), y0, ch); j <= cella(Math.max(...ty), y0, ch); j++) celle[j * lato + i].push(k);
  });
  const quota = (k: number, x: number, y: number): number | null => {
    const [a, b, c] = triangoli[k];
    const A = punti[a], B = punti[b], C = punti[c];
    const det = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
    if (Math.abs(det) < 1e-9) return null;
    const l1 = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / det;
    const l2 = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) return null;
    return l1 * A.quota + l2 * B.quota + l3 * C.quota;
  };
  return {
    ...tin,
    cerca: (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return null;
      for (const k of celle[cella(y, y0, ch) * lato + cella(x, x0, cw)]) {
        const q = quota(k, x, y);
        if (q !== null) return q;
      }
      return null;
    },
  };
}
