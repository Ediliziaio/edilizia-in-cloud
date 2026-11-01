/**
 * «Arreda con un clic»: gli arredi tipici della destinazione della stanza, appoggiati alle pareti,
 * lontani da porte e finestre, senza sovrapporsi né uscire dalla stanza. È una prima proposta da
 * ritoccare a mano (si annulla con Ctrl+Z); il 3D e il render AI usano poi i mobili dove stanno.
 *
 * Coordinate della pianta di lavoro: cm, y verso il basso. Rotazione oraria sullo schermo; a 0° il
 * lato d'attacco del simbolo (schienale, cassetta del WC) guarda in alto.
 */
import type { Destinazione } from "../../../../shared/planimetrie/modello.ts";
import type { Pianta, Punto } from "./adattatore";
import { CATALOGO, type VoceCatalogo } from "./catalogo";
import { aggiungiElemento, statoNuovo, visibile, type Vista } from "./comandi";

/** Cosa mettere, nell'ordine in cui conta. `angolo`: meglio in fondo a una parete. */
interface Richiesta { tipo: string; angolo?: boolean; centro?: boolean; larghezzaMinima?: number; etichetta?: string }

/** Con `perNumero` un tipo già presente vale per una richiesta, non per tutte (prese, punti luce). */
export interface OpzioniArreda { programma?: Richiesta[]; perNumero?: boolean }

const PROGRAMMA: Partial<Record<Destinazione, Richiesta[]>> = {
  bagno: [{ tipo: "doccia", angolo: true }, { tipo: "wc" }, { tipo: "bidet" }, { tipo: "lavabo" }, { tipo: "lavatrice", angolo: true }],
  cucina: [{ tipo: "cucina", larghezzaMinima: 180 }, { tipo: "frigorifero", angolo: true }, { tipo: "tavolo", centro: true }],
  camera: [{ tipo: "letto_matrimoniale" }, { tipo: "armadio", larghezzaMinima: 120 }, { tipo: "scrivania" }],
  soggiorno: [{ tipo: "divano" }, { tipo: "tavolo", centro: true }],
  studio: [{ tipo: "scrivania" }, { tipo: "armadio", larghezzaMinima: 100 }],
  lavanderia: [{ tipo: "lavatrice", angolo: true }, { tipo: "lavabo" }],
};

export const destinazioneArredabile = (d: Destinazione) => !!PROGRAMMA[d]?.length;

const PASSO = 5; // le posizioni si arrotondano ai 5 cm, come quando si trascina
const STACCO = 2; // aria fra mobile e muro
const SPAZIO_PORTA = 90; // davanti a una porta resta libero almeno un passaggio

interface Rett { x0: number; y0: number; x1: number; y1: number }
const sovrapposti = (a: Rett, b: Rett) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

/** L'ingombro sul foglio di un mobile ruotato (riquadro allineato agli assi). */
function ingombro(c: Punto, w: number, d: number, gradi: number): Rett {
  const a = (gradi * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * d) / 2;
  const hd = (Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * d) / 2;
  return { x0: c.x - hw, y0: c.y - hd, x1: c.x + hw, y1: c.y + hd };
}

function dentro(p: Punto, poly: Punto[]): boolean {
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
}

function areaConSegno(poly: Punto[]) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

interface Lato {
  a: Punto; // inizio del tratto libero di muro, sul filo interno
  u: Punto; // direzione
  n: Punto; // verso l'interno della stanza
  lunghezza: number;
  /** Rotazione che appoggia lo schienale a questo muro. */
  rotazione: number;
  /** Tratti dove non si può appoggiare niente (porte, e finestre per i mobili alti): [da, a] in cm lungo il lato. */
  vietati: Array<{ da: number; a: number; soloAlti?: number }>;
}

/** I lati della stanza visti da dentro: filo interno del muro, porte e finestre proiettate. */
function latiDellaStanza(pianta: Pianta, contorno: Punto[], vista: Vista): { lati: Lato[]; zoneLibere: Rett[] } {
  const verso = areaConSegno(contorno) > 0 ? 1 : -1; // y in giù: area positiva = senso orario sullo schermo
  const muri = pianta.muri.filter((m) => visibile(m.stato, vista) && m.stato !== "da_demolire");
  const lati: Lato[] = [];
  const zoneLibere: Rett[] = [];
  const mezzoSpessore = (p: Punto, q: Punto) => {
    const m = muri.find((x) => {
      const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
      const dist = (r: Punto) => Math.abs((r.x - p.x) * dy - (r.y - p.y) * dx) / l;
      return dist(x.p1) < 3 && dist(x.p2) < 3;
    });
    return (m?.spessore ?? 10) / 2;
  };
  for (let i = 0; i < contorno.length; i++) {
    const p = contorno[i], q = contorno[(i + 1) % contorno.length];
    const prima = contorno[(i - 1 + contorno.length) % contorno.length], dopo = contorno[(i + 2) % contorno.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < 30) continue;
    const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
    // senso orario sullo schermo (y in giù): l'interno sta a destra di p→q, cioè (-u.y, u.x)
    const n = verso > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const s = mezzoSpessore(p, q);
    const sPrima = mezzoSpessore(prima, p), sDopo = mezzoSpessore(q, dopo);
    const a = { x: p.x + n.x * s + u.x * sPrima, y: p.y + n.y * s + u.y * sPrima };
    const lunghezza = L - sPrima - sDopo;
    if (lunghezza < 30) continue;
    const rotazione = ((Math.round((Math.atan2(-n.x, n.y) * 180) / Math.PI) % 360) + 360) % 360;
    const vietati: Lato["vietati"] = [];
    for (const ap of pianta.aperture) {
      if (!visibile(ap.stato, vista) || ap.stato === "da_demolire") continue;
      const m = muri.find((x) => x.id === ap.muroId);
      if (!m) continue;
      const lm = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) || 1;
      const c = { x: m.p1.x + ((m.p2.x - m.p1.x) / lm) * ap.posizione, y: m.p1.y + ((m.p2.y - m.p1.y) / lm) * ap.posizione };
      // l'apertura sta su questo lato se il suo centro è sulla linea del lato
      const fuori = Math.abs((c.x - p.x) * n.x + (c.y - p.y) * n.y);
      const t = (c.x - a.x) * u.x + (c.y - a.y) * u.y;
      if (fuori > 3 || t < -ap.larghezza / 2 || t > lunghezza + ap.larghezza / 2) continue;
      const porta = ap.tipo !== "finestra";
      const margine = porta ? 10 : 5;
      vietati.push({ da: t - ap.larghezza / 2 - margine, a: t + ap.larghezza / 2 + margine, ...(porta ? {} : { soloAlti: ap.davanzale }) });
      if (porta) {
        // il passaggio davanti alla porta resta libero anche per i mobili delle altre pareti
        const prof = Math.max(SPAZIO_PORTA, ap.larghezza);
        const c0 = { x: a.x + u.x * t, y: a.y + u.y * t };
        const pts = [-1, 1].flatMap((k) => [0, prof].map((h) => ({
          x: c0.x + u.x * k * (ap.larghezza / 2 + margine) + n.x * h,
          y: c0.y + u.y * k * (ap.larghezza / 2 + margine) + n.y * h,
        })));
        zoneLibere.push({ x0: Math.min(...pts.map((z) => z.x)), y0: Math.min(...pts.map((z) => z.y)), x1: Math.max(...pts.map((z) => z.x)), y1: Math.max(...pts.map((z) => z.y)) });
      }
    }
    lati.push({ a, u, n, lunghezza, rotazione, vietati });
  }
  return { lati, zoneLibere };
}

/** I tratti liberi di un lato per un mobile alto `altezza`, ordinati dal più lungo. */
function trattiLiberi(l: Lato, altezza: number, occupati: Array<{ da: number; a: number }>): Array<{ da: number; a: number }> {
  const blocchi = [...l.vietati.filter((v) => v.soloAlti == null || altezza > v.soloAlti), ...occupati].sort((x, y) => x.da - y.da);
  const liberi: Array<{ da: number; a: number }> = [];
  let da = 0;
  for (const b of blocchi) {
    if (b.da > da) liberi.push({ da, a: Math.min(b.da, l.lunghezza) });
    da = Math.max(da, b.a);
  }
  if (da < l.lunghezza) liberi.push({ da, a: l.lunghezza });
  return liberi.filter((t) => t.a - t.da > 1).sort((x, y) => (y.a - y.da) - (x.a - x.da));
}

const arrotonda = (v: number) => Math.round(v / PASSO) * PASSO;

export interface EsitoArreda {
  pianta: Pianta;
  aggiunti: string[];
  /** Nomi di ciò che non ci stava. */
  saltati: string[];
  /** Nomi di ciò che c'era già e non si è rimesso. */
  giaPresenti: string[];
}

/**
 * Arreda la stanza `localeId`. Ciò che c'è già (stesso tipo) non si duplica e fa da ostacolo.
 * Nel progetto i mobili aggiunti sono «nuovi»; com'è oggi, «esistenti».
 */
export function arredaStanza(pianta: Pianta, localeId: string, vista: Vista, destinazione?: Destinazione, opzioni: OpzioniArreda = {}): EsitoArreda {
  const locale = pianta.locali.find((l) => l.id === localeId);
  const vuoto: EsitoArreda = { pianta, aggiunti: [], saltati: [], giaPresenti: [] };
  if (!locale || locale.contorno.length < 3) return vuoto;
  const dest = destinazione ?? (vista === "progetto" ? pianta.nomiProgetto?.[localeId]?.destinazione : undefined) ?? locale.destinazione;
  const programma = opzioni.programma ?? PROGRAMMA[dest];
  if (!programma?.length) return vuoto;

  const contorno = locale.contorno;
  const { lati, zoneLibere } = latiDellaStanza(pianta, contorno, vista);
  const presenti = (pianta.elementi ?? []).filter((e) => visibile(e.stato, vista) && e.stato !== "da_demolire" && dentro(e.centro, contorno));
  const ostacoli: Rett[] = [...zoneLibere, ...presenti.map((e) => ingombro(e.centro, e.larghezza, e.profondita, e.rotazione))];
  const occupatiPerLato = lati.map(() => [] as Array<{ da: number; a: number }>);
  const esito: EsitoArreda = { pianta, aggiunti: [], saltati: [], giaPresenti: [] };

  const entra = (c: Punto, w: number, d: number, r: number) => {
    const box = ingombro(c, w, d, r);
    const angoli = [{ x: box.x0 + 1, y: box.y0 + 1 }, { x: box.x1 - 1, y: box.y0 + 1 }, { x: box.x0 + 1, y: box.y1 - 1 }, { x: box.x1 - 1, y: box.y1 - 1 }];
    return angoli.every((p) => dentro(p, contorno)) && !ostacoli.some((o) => sovrapposti(o, box)) ? box : null;
  };
  let etichettaCorrente: string | undefined;
  const posa = (voce: VoceCatalogo, centro: Punto, rotazione: number, larghezza = voce.larghezza) => {
    const r = aggiungiElemento(esito.pianta, { ...voce, larghezza, ...(etichettaCorrente ? { etichetta: etichettaCorrente } : {}) }, centro, { stato: statoNuovo(vista), rotazione });
    esito.pianta = r.pianta;
    esito.aggiunti.push(r.id);
    ostacoli.push(ingombro(centro, larghezza, voce.profondita, rotazione));
  };

  /** Prova ad appoggiare a una parete; ritorna dove l'ha messo. */
  const aParete = (voce: VoceCatalogo, req: Richiesta): { lato: number; t: number; larghezza: number } | null => {
    const ordine = lati.map((l, i) => ({ l, i })).sort((x, y) => y.l.lunghezza - x.l.lunghezza);
    for (const { l, i } of ordine) {
      for (const tratto of trattiLiberi(l, voce.altezza, occupatiPerLato[i])) {
        const spazio = tratto.a - tratto.da;
        // la cucina lineare si accorcia fino a starci (a moduli di 60), gli altri no
        const larghezza = req.larghezzaMinima && spazio < voce.larghezza
          ? Math.floor(spazio / 60) * 60
          : voce.larghezza;
        if (larghezza < (req.larghezzaMinima ?? voce.larghezza) || larghezza > spazio) continue;
        const candidati = req.angolo
          ? [tratto.da + larghezza / 2, tratto.a - larghezza / 2]
          : [(tratto.da + tratto.a) / 2, tratto.da + larghezza / 2, tratto.a - larghezza / 2];
        for (const t0 of candidati) {
          const t = Math.min(Math.max(arrotonda(t0), tratto.da + larghezza / 2), tratto.a - larghezza / 2);
          const prof = voce.profondita / 2 + STACCO;
          const c = { x: arrotonda(l.a.x + l.u.x * t + l.n.x * prof), y: arrotonda(l.a.y + l.u.y * t + l.n.y * prof) };
          if (!entra(c, larghezza, voce.profondita, l.rotazione)) continue;
          posa(voce, c, l.rotazione, larghezza);
          occupatiPerLato[i].push({ da: t - larghezza / 2, a: t + larghezza / 2 });
          return { lato: i, t, larghezza };
        }
      }
    }
    return null;
  };

  const voce = (tipo: string) => CATALOGO.find((v) => v.tipo === tipo)!;
  const xs = contorno.map((p) => p.x), ys = contorno.map((p) => p.y);
  const centroStanza = { x: arrotonda((Math.min(...xs) + Math.max(...xs)) / 2), y: arrotonda((Math.min(...ys) + Math.max(...ys)) / 2) };

  // Con perNumero: quanti ce ne sono già, per tipo; ognuno «consuma» una richiesta.
  const giaContati = new Map<string, number>();
  for (const e of presenti) giaContati.set(e.tipo, (giaContati.get(e.tipo) ?? 0) + 1);
  // punti luce in mezzo: uno al centro, due sull'asse lungo
  const luci = programma.filter((r) => r.tipo === "punto_luce").length;
  let luceN = 0;

  for (const req of programma) {
    const v = voce(req.tipo);
    etichettaCorrente = req.etichetta;
    if (opzioni.perNumero) {
      const n = giaContati.get(req.tipo) ?? 0;
      if (n > 0) { giaContati.set(req.tipo, n - 1); esito.giaPresenti.push(v.nome); continue; }
    } else if (presenti.some((e) => e.tipo === req.tipo || (req.tipo.startsWith("letto") && e.tipo.startsWith("letto")))) {
      esito.giaPresenti.push(v.nome);
      continue;
    }
    if (req.tipo === "punto_luce") {
      const largo = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
      const passo = luci > 1 ? ((largo ? Math.max(...xs) - Math.min(...xs) : Math.max(...ys) - Math.min(...ys)) / luci) : 0;
      const k = luceN++ - (luci - 1) / 2;
      const c = { x: arrotonda(centroStanza.x + (largo ? k * passo : 0)), y: arrotonda(centroStanza.y + (largo ? 0 : k * passo)) };
      // a soffitto: non ingombra il pavimento, basta che stia dentro
      if (!dentro(c, contorno)) { esito.saltati.push(v.nome); continue; }
      const r = aggiungiElemento(esito.pianta, v, c, { stato: statoNuovo(vista) });
      esito.pianta = r.pianta;
      esito.aggiunti.push(r.id);
      continue;
    }
    if (req.tipo === "interruttore") {
      // accanto alla porta, dal lato della maniglia: subito dopo il vano
      let messo = false;
      for (let i = 0; i < lati.length && !messo; i++) {
        const l = lati[i];
        for (const vt of l.vietati.filter((x) => x.soloAlti == null)) {
          const t = Math.min(vt.a + v.larghezza / 2 + 2, l.lunghezza - v.larghezza / 2);
          if (occupatiPerLato[i].some((o) => t + v.larghezza / 2 > o.da && t - v.larghezza / 2 < o.a)) continue;
          const prof = v.profondita / 2 + STACCO;
          const c = { x: arrotonda(l.a.x + l.u.x * t + l.n.x * prof), y: arrotonda(l.a.y + l.u.y * t + l.n.y * prof) };
          if (!dentro(c, contorno)) continue;
          const r = aggiungiElemento(esito.pianta, v, c, { stato: statoNuovo(vista), rotazione: l.rotazione });
          esito.pianta = r.pianta;
          esito.aggiunti.push(r.id);
          occupatiPerLato[i].push({ da: t - v.larghezza / 2, a: t + v.larghezza / 2 });
          messo = true;
          break;
        }
      }
      if (messo) continue;
    }
    if (req.centro) {
      // il tavolo in mezzo alla stanza, ruotato secondo il lato lungo; poi le sedie
      const largo = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
      const r = largo ? 0 : 90;
      if (!entra(centroStanza, v.larghezza + 100, v.profondita + 100, r)) { esito.saltati.push(v.nome); continue; }
      posa(v, centroStanza, r);
      const sedia = voce("sedia");
      const lungo = { x: largo ? 1 : 0, y: largo ? 0 : 1 }, corto = { x: largo ? 0 : 1, y: largo ? 1 : 0 };
      for (const lato of [-1, 1]) for (const k of v.larghezza >= 140 ? [-0.25, 0.25] : [0]) {
        const off = v.profondita / 2 + sedia.profondita / 2 - 5;
        const c = { x: arrotonda(centroStanza.x + lungo.x * k * v.larghezza + corto.x * lato * off), y: arrotonda(centroStanza.y + lungo.y * k * v.larghezza + corto.y * lato * off) };
        // la sedia guarda il tavolo: lo schienale sta dalla parte opposta
        const rs = (r + (lato > 0 ? 180 : 0) + (largo ? 0 : 180)) % 360;
        if (entra(c, sedia.larghezza, sedia.profondita, rs)) posa(sedia, c, rs);
      }
      continue;
    }
    const messo = aParete(v, req);
    if (!messo) {
      // in una camera piccola il matrimoniale lascia il posto al singolo
      if (req.tipo === "letto_matrimoniale") {
        const singolo = aParete(voce("letto_singolo"), { tipo: "letto_singolo" });
        if (singolo) continue;
      }
      esito.saltati.push(v.nome);
      continue;
    }
    if (req.tipo === "letto_matrimoniale") {
      // i comodini ai lati della testata
      const l = lati[messo.lato], c = voce("comodino");
      for (const k of [-1, 1]) {
        const t = messo.t + k * (messo.larghezza / 2 + c.larghezza / 2 + 2);
        const vietato = trattiLiberi(l, c.altezza, []).every((tr) => t - c.larghezza / 2 < tr.da || t + c.larghezza / 2 > tr.a);
        if (vietato) continue;
        const prof = c.profondita / 2 + STACCO;
        const centro = { x: arrotonda(l.a.x + l.u.x * t + l.n.x * prof), y: arrotonda(l.a.y + l.u.y * t + l.n.y * prof) };
        if (entra(centro, c.larghezza, c.profondita, l.rotazione)) {
          posa(c, centro, l.rotazione);
          occupatiPerLato[messo.lato].push({ da: t - c.larghezza / 2, a: t + c.larghezza / 2 });
        }
      }
    }
  }
  return esito;
}

/**
 * Maglia di pilastri (capannoni, autorimesse, pilotis): una griglia a passo fisso dentro la
 * stanza, a partire dal centro così la maglia è simmetrica. I pilastri troppo vicini ai muri
 * (meno di mezzo passo) non si mettono: lì il carico lo portano i muri.
 */
export function magliaPilastri(pianta: Pianta, localeId: string, vista: Vista, passo = 600, lato = 30): { pianta: Pianta; aggiunti: string[] } {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale || locale.contorno.length < 3 || !(passo >= 200)) return { pianta, aggiunti: [] };
  const c = locale.contorno;
  const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const nx = Math.floor((x1 - x0) / 2 / passo), ny = Math.floor((y1 - y0) / 2 / passo);
  const dispariX = (x1 - x0) / passo % 2 >= 1, dispariY = (y1 - y0) / passo % 2 >= 1;
  const posizioni = (centro: number, n: number, mezzo: boolean) => {
    const out: number[] = [];
    for (let k = -n; k <= n; k++) out.push(centro + (mezzo ? (k + 0.5) * passo : k * passo));
    return out;
  };
  const distanzaDalBordo = (p: Punto) => {
    let d = Infinity;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
      d = Math.min(d, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
    }
    return d;
  };
  const voce = CATALOGO.find((v) => v.tipo === "pilastro")!;
  let p = pianta;
  const aggiunti: string[] = [];
  for (const x of posizioni(cx, nx, dispariX)) for (const y of posizioni(cy, ny, dispariY)) {
    const q = { x: Math.round(x), y: Math.round(y) };
    if (!dentro(q, c) || distanzaDalBordo(q) < passo / 2 - 1) continue;
    const r = aggiungiElemento(p, { ...voce, larghezza: lato, profondita: lato, altezza: locale.altezza }, q, { stato: statoNuovo(vista) });
    p = r.pianta;
    aggiunti.push(r.id);
  }
  return { pianta: p, aggiunti };
}


// ─── Impianto elettrico e clima con un clic ──────────────────────────────────

/**
 * Dotazione minima per locale dell'impianto elettrico, livello 1 della norma CEI 64-8
 * (cap. 37), arrotondata alla prassi: prese, punti luce e un interruttore per punto luce.
 * È il minimo di legge per le abitazioni nuove o rifatte; il livello 2 e 3 ne chiedono di più.
 */
export function dotazioneCei(dest: Destinazione, mq: number): { prese: number; luci: number } {
  switch (dest) {
    case "soggiorno": case "camera": case "studio":
      return mq <= 8 ? { prese: 2, luci: 1 } : mq <= 12 ? { prese: 3, luci: 1 } : mq <= 20 ? { prese: 4, luci: 2 } : { prese: 5, luci: 2 };
    case "cucina": return { prese: 5, luci: 2 };
    case "bagno": return { prese: 2, luci: 2 };
    case "lavanderia": return { prese: 3, luci: 1 };
    case "ingresso": case "disimpegno": case "corridoio": return { prese: 1, luci: mq > 6 ? 2 : 1 };
    case "ripostiglio": case "cantina": return { prese: 0, luci: 1 };
    case "garage": return { prese: 2, luci: 1 };
    case "balcone": case "terrazzo": return mq > 10 ? { prese: 1, luci: 1 } : { prese: 0, luci: 1 };
    default: return { prese: 1, luci: 1 };
  }
}

const mqDi = (c: Punto[]) => Math.abs(c.reduce((t, p, i) => { const q = c[(i + 1) % c.length]; return t + p.x * q.y - q.x * p.y; }, 0)) / 2 / 10_000;

/** Prese, punti luce e interruttori che mancano alla dotazione minima della stanza. */
export function impiantoElettrico(pianta: Pianta, localeId: string, vista: Vista, destinazione: Destinazione): EsitoArreda {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) return { pianta, aggiunti: [], saltati: [], giaPresenti: [] };
  const { prese, luci } = dotazioneCei(destinazione, mqDi(locale.contorno));
  const programma: Richiesta[] = [
    ...Array.from({ length: luci }, () => ({ tipo: "punto_luce" })),
    ...Array.from({ length: luci }, () => ({ tipo: "interruttore" })),
    ...Array.from({ length: prese }, () => ({ tipo: "presa" })),
  ];
  return arredaStanza(pianta, localeId, vista, destinazione, { programma, perNumero: true });
}

/** Uno split (o più, se la stanza è grande) con la taglia in BTU consigliata scritta sopra. */
export function climaStanza(pianta: Pianta, localeId: string, vista: Vista, destinazione: Destinazione, btu: { taglia: number; split: number }): EsitoArreda {
  const etichetta = `${btu.taglia.toLocaleString("it-IT")} BTU`;
  const programma: Richiesta[] = Array.from({ length: btu.split }, () => ({ tipo: "split", etichetta }));
  return arredaStanza(pianta, localeId, vista, destinazione, { programma, perNumero: true });
}
