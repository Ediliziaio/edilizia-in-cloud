/**
 * Dalla pianta alla scena 3D: muri estrusi con i vani, pavimenti e soffitti dei
 * locali, sanitari e arredi. Funzione pura: nessuna dipendenza da three.js, così
 * la stessa scena serve al visore, alle esportazioni (GLB, OBJ) e ai test.
 */
import { CostruttoreMesh } from "./costruttore";
import { costruisciElemento, modelloElemento } from "./elementi";
import { poligonoConBuchi, pulisciPoligono, puntoNelPoligono, v2 } from "./geometria2d";
import { latoEsterno } from "../../../../shared/planimetrie/serramenti.ts";
import { quotaTerreno, type PuntoQuotato } from "../../../../shared/planimetrie/terreno.ts";
import { baseTetto, facceTetto, finituraDi, fotovoltaicoSulTetto, quotaFalde, rettangoloTetto, SUBSTRATO_VERDE_CM, type Faccia, type P3 } from "../../../../shared/planimetrie/tetto.ts";
import { meshImpianti } from "./impianti3d";
import { MATERIALE_AREA, MATERIALI, materialeMuro, materialePavimento } from "./materiali";
import { calcolaIncroci, costruisciAnteOscuranti, costruisciZanzariera, costruisciCassonetto, costruisciMuro, costruisciTelaio, costruisciTamponamento, costruisciVetro, preparaMuro, sistemaVani, type MuroCalc, type VanoMuro } from "./muri";
import type { AperturaPer3D, Mesh3D, OpzioniScena, PiantaPer3D, Scena3D, StatoOggetto, V3, Vista3D } from "./tipi";

const CM = 0.01;

/** Il muro c'è in questa vista? */
export function muroPresente(stato: StatoOggetto, vista: Vista3D): boolean {
  if (vista === "confronto") return true;
  if (vista === "fatto") return stato !== "nuovo";
  return stato !== "demolire";
}

/** Come si presenta un'apertura nella vista: aperta, chiusa (muro pieno) o tamponata in rosso. */
export function comeApertura(stato: StatoOggetto, vista: Vista3D): "aperta" | "chiusa" | "tamponata" {
  if (vista === "fatto") return stato === "nuovo" ? "chiusa" : "aperta";
  if (vista === "progetto") return stato === "demolire" ? "chiusa" : "aperta";
  return stato === "demolire" ? "tamponata" : "aperta";
}

const NOMI_APERTURA: Record<AperturaPer3D["tipo"], string> = { porta: "Porta", finestra: "Finestra", portafinestra: "Portafinestra", varco: "Varco" };

export function nomeApertura(a: AperturaPer3D): string {
  return `${NOMI_APERTURA[a.tipo] ?? "Apertura"} ${a.id}`;
}

/** Altezza di un parapetto di balconi e terrazzi, in cm. */
export const ALTEZZA_PARAPETTO = 110;

/**
 * I muri che sono parapetti: da un lato un balcone, un terrazzo o una loggia, dall'altro
 * nessuna stanza (o un altro spazio aperto), e senza porte o finestre. Nel 3D sono alti 1,10 m.
 */
export function parapetti(pianta: PiantaPer3D): Set<string> {
  const aperti = pianta.locali.filter((l) => /balcon|terrazz|loggia/i.test(l.destinazione));
  const out = new Set<string>();
  if (!aperti.length) return out;
  const conAperture = new Set(pianta.aperture.map((a) => a.muroId));
  for (const m of pianta.muri) {
    if (conAperture.has(m.id)) continue;
    const l = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
    if (l < 1) continue;
    const n = { x: -(m.b.y - m.a.y) / l, y: (m.b.x - m.a.x) / l };
    const c = { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 };
    const d = m.spessore / 2 + 15;
    const lati = [1, -1].map((k) => pianta.locali.find((x) => x.contorno.length >= 3 && puntoNelPoligono({ x: c.x + n.x * d * k, y: c.y + n.y * d * k }, x.contorno)) ?? null);
    const aperto = (x: (typeof lati)[number]) => !!x && aperti.includes(x);
    if (lati.some(aperto) && lati.every((x) => x === null || aperto(x))) out.add(m.id);
  }
  return out;
}

export function muriCalcolati(pianta: PiantaPer3D, vista: Vista3D): MuroCalc[] {
  const bassi = parapetti(pianta);
  return pianta.muri
    .filter((m) => muroPresente(m.stato, vista))
    .map((m) => preparaMuro({ id: m.id, a: v2(m.a.x * CM, m.a.y * CM), b: v2(m.b.x * CM, m.b.y * CM), spessore: m.spessore * CM, altezza: (bassi.has(m.id) ? Math.min(m.altezza, ALTEZZA_PARAPETTO) : m.altezza) * CM, stato: m.stato }))
    .filter((m): m is MuroCalc => m !== null);
}

/**
 * Il tetto sopra il piano (shared/planimetrie/tetto.ts): falde in tegole, timpani in muratura,
 * vetrate degli shed, e i pannelli fotovoltaici se ci sono. Parte dalla cima dei muri.
 */
function meshTetto(pianta: PiantaPer3D, muri: MuroCalc[]): Mesh3D[] {
  const t = pianta.tetto;
  if (!t || !muri.length) return [];
  const r = rettangoloTetto(pianta.muri, t.sporto);
  if (!r) return [];
  const h = baseTetto(t, Math.max(...muri.map((m) => m.altezza)) / CM);
  const facce0 = facceTetto(r, h, t);
  const finitura = finituraDi(t);
  const verde = finitura === "verde" || finitura === "verde_intensivo";
  const sub = verde ? SUBSTRATO_VERDE_CM[finitura] : 0;
  // sotto il verde c'è il substrato: la superficie si alza dello spessore (le falde, non i timpani)
  const facce = sub ? facce0.map((f) => (f.genere === "falda" ? { ...f, vertici: f.vertici.map((q) => ({ ...q, z: q.z + sub })) } : f)) : facce0;
  const v3 = (p: P3): V3 => [p.x * CM, p.z * CM, p.y * CM];
  const normale = (a: V3, b: V3, c: V3): V3 => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // ogni faccia due volte (sopra e sotto), così si vede anche da dentro
  const faccia = (c: CostruttoreMesh, pts: P3[]) => {
    const p = pts.map(v3);
    const n = normale(p[0], p[1], p[2]);
    c.poligono(p, n);
    c.poligono([...p].reverse(), [-n[0], -n[1], -n[2]]);
  };
  const falde = new CostruttoreMesh(), timpani = new CostruttoreMesh(), vetrate = new CostruttoreMesh(), pannelli = new CostruttoreMesh();
  for (const f of facce) faccia(f.genere === "falda" ? falde : f.genere === "vetrata" ? vetrate : timpani, f.vertici);
  if (t.fotovoltaico) for (const p of fotovoltaicoSulTetto(facce, t.fotovoltaico).pannelli) faccia(pannelli, p);
  const out: Mesh3D[] = [];
  const piano = t.tipo === "piano";
  // senza una copertura scelta restano il tetto piano in cemento e le tegole di sempre
  const materialeTetto = t.finitura === undefined ? (piano ? "muro" : "tegole") : finitura === "verde" ? "tetto_verde" : finitura === "verde_intensivo" ? "tetto_verde_intensivo" : finitura;
  const nomeTetto = verde ? (finitura === "verde" ? "Tetto verde" : "Giardino pensile") : piano ? "Tetto piano" : "Tetto";
  if (!falde.vuoto()) out.push(falde.mesh({ id: "tetto", nome: nomeTetto, genere: "soffitto", materiale: materialeTetto, riferimento: "tetto" }));
  // tetto piano con verde o ghiaia: il cordolo (parapetto) tutto intorno trattiene substrato e zavorra
  if (piano && (verde || finitura === "ghiaia")) {
    const cordolo = new CostruttoreMesh();
    const base = (h + 25) * CM, alto = (sub + 12) * CM, sp = 0.2;
    const { x0, x1, y0, y1 } = r;
    const lungoX = (x1 - x0) * CM, lungoY = (y1 - y0) * CM;
    cordolo.scatola(((x0 + x1) / 2) * CM, y0 * CM + sp / 2, base - 0.25, lungoX, sp, alto + 0.25, 0);
    cordolo.scatola(((x0 + x1) / 2) * CM, y1 * CM - sp / 2, base - 0.25, lungoX, sp, alto + 0.25, 0);
    cordolo.scatola(x0 * CM + sp / 2, ((y0 + y1) / 2) * CM, base - 0.25, sp, lungoY - 2 * sp, alto + 0.25, 0);
    cordolo.scatola(x1 * CM - sp / 2, ((y0 + y1) / 2) * CM, base - 0.25, sp, lungoY - 2 * sp, alto + 0.25, 0);
    out.push(cordolo.mesh({ id: "tetto:parapetto", nome: "Cordolo del tetto", genere: "muro", materiale: "muro", riferimento: "tetto" }));
  }
  // giardino pensile: cespugli e arbusti sparsi (sempre gli stessi: dipendono solo dalla misura)
  if (piano && finitura === "verde_intensivo") {
    const veg = new CostruttoreMesh();
    const larg = (r.x1 - r.x0) * CM - 1, prof = (r.y1 - r.y0) * CM - 1;
    const n = Math.max(4, Math.min(40, Math.round((larg * prof) / 3)));
    let seme = Math.round(larg * 1000 + prof * 7) % 2147483647 || 1;
    const rnd = () => (seme = (seme * 48271) % 2147483647) / 2147483647;
    const quota = (h + 25 + sub) * CM;
    for (let i = 0; i < n; i++) {
      const raggio = 0.22 + rnd() * 0.3;
      veg.sfera(r.x0 * CM + 0.5 + rnd() * larg, quota + raggio * 0.7, r.y0 * CM + 0.5 + rnd() * prof, raggio, 3);
    }
    out.push(veg.mesh({ id: "tetto:vegetazione", nome: "Arbusti del giardino pensile", genere: "elemento", materiale: "fogliame", riferimento: "tetto" }));
  }
  if (!timpani.vuoto()) out.push(timpani.mesh({ id: "tetto:timpani", nome: "Timpani", genere: "muro", materiale: "muro", riferimento: "tetto" }));
  if (!vetrate.vuoto()) out.push(vetrate.mesh({ id: "tetto:vetrate", nome: "Vetrate degli shed", genere: "vetro", materiale: "vetro", riferimento: "tetto" }));
  if (!pannelli.vuoto()) out.push(pannelli.mesh({ id: "tetto:fotovoltaico", nome: "Pannelli fotovoltaici", genere: "elemento", materiale: "pannello_fv", riferimento: "tetto" }));
  return out;
}

/** Le falde di una mansarda in cm, y verso il basso come la pianta 3D; null se non è una mansarda. */
function faldeMansarda(pianta: PiantaPer3D): Faccia[] | null {
  const t = pianta.tetto;
  if (!t?.mansarda || t.tipo === "piano" || !pianta.muri.length) return null;
  const r = rettangoloTetto(pianta.muri, t.sporto);
  if (!r) return null;
  return facceTetto(r, baseTetto(t, Math.max(...pianta.muri.map((m) => m.altezza))), t);
}

const quotaIn = (falde: Faccia[], x: number, y: number) => (quotaFalde(falde, x / CM, y / CM) ?? 0) * CM;
const PASSI_MURO = 24;

/** La quota più bassa del tetto lungo l'asse del muro (m): fin lì il muro è un parallelepipedo. */
function quotaMinimaLungo(falde: Faccia[], m: MuroCalc): number {
  let z = Infinity;
  for (let i = 0; i <= PASSI_MURO; i++) {
    const t = i / PASSI_MURO;
    z = Math.min(z, quotaIn(falde, m.a.x + (m.b.x - m.a.x) * t, m.a.y + (m.b.y - m.a.y) * t));
  }
  return Number.isFinite(z) && z > 0.3 ? z : m.altezza;
}

/** Sopra il parallelepipedo, il pezzo di muro che segue la falda (i due lati), fino al tetto. */
function sottoFalde(falde: Faccia[], m: MuroCalc, c: CostruttoreMesh) {
  const quote = Array.from({ length: PASSI_MURO + 1 }, (_, i) => {
    const t = i / PASSI_MURO;
    return { t, z: quotaIn(falde, m.a.x + (m.b.x - m.a.x) * t, m.a.y + (m.b.y - m.a.y) * t) };
  });
  if (Math.max(...quote.map((q) => q.z)) - m.altezza < 0.01) return;
  for (const lato of [1, -1]) {
    const o = { x: m.n.x * lato * m.spessore / 2, y: m.n.y * lato * m.spessore / 2 };
    const punto = (t: number, z: number): V3 => [m.a.x + (m.b.x - m.a.x) * t + o.x, z, m.a.y + (m.b.y - m.a.y) * t + o.y];
    const sopra = quote.map((q) => punto(q.t, Math.max(q.z, m.altezza)));
    const poligono = [punto(1, m.altezza), punto(0, m.altezza), ...sopra];
    const normale: V3 = [m.n.x * lato, 0, m.n.y * lato];
    c.poligono(lato > 0 ? poligono : [...poligono].reverse(), normale);
  }
}

export function costruisciScena(pianta: PiantaPer3D, opzioni: OpzioniScena = {}): Scena3D {
  const vista = opzioni.vista ?? "progetto";
  const colori = vista === "confronto";
  const conSoffitto = opzioni.soffitto ?? true;
  const conElementi = opzioni.elementi ?? true;
  const mesh: Mesh3D[] = [];
  const avvisi: string[] = [];

  // Mansarda: le falde sono il soffitto; i muri salgono fin sotto il tetto (vedi sottoFalde)
  const falde = faldeMansarda(pianta);
  const muri = falde ? muriCalcolati(pianta, vista).map((m) => ({ ...m, altezza: quotaMinimaLungo(falde, m) })) : muriCalcolati(pianta, vista);
  const scartati = pianta.muri.filter((m) => muroPresente(m.stato, vista)).length - muri.length;
  if (scartati > 0) avvisi.push(`${scartati} muri senza lunghezza, spessore o altezza: non disegnati.`);
  const { estremi, nodi } = calcolaIncroci(muri);

  for (const m of muri) {
    const e = estremi.get(m.id)!;
    const richieste = pianta.aperture
      .filter((a) => a.muroId === m.id)
      .map((a) => ({ a, come: comeApertura(a.stato, vista) }))
      .filter((x) => x.come !== "chiusa");
    const { vani, avvisi: avvisiVani } = sistemaVani(
      m,
      e,
      richieste.map(({ a }) => {
        const c = a.posizione * CM;
        const l = a.larghezza * CM;
        return { id: a.id, nome: nomeApertura(a), s0: c - l / 2, s1: c + l / 2, z0: a.davanzale * CM, z1: (a.davanzale + a.altezza) * CM };
      }),
    );
    avvisi.push(...avvisiVani);
    const apertura = (v: VanoMuro) => richieste.find((r) => r.a.id === v.id)!;

    // Le spallette di un vano da aprire si colorano di giallo (si demolisce la muratura).
    const spallette = new Map<string, CostruttoreMesh>();
    const corpo = new CostruttoreMesh();
    costruisciMuro(m, e, vani, corpo, (v) => {
      const { a } = apertura(v);
      if (!(colori && a.stato === "nuovo" && m.stato === "esistente")) return corpo;
      if (!spallette.has(v.id)) spallette.set(v.id, new CostruttoreMesh());
      return spallette.get(v.id)!;
    });
    if (falde) sottoFalde(falde, m, corpo);
    mesh.push(corpo.mesh({ id: `muro:${m.id}`, nome: `Muro ${m.id}`, genere: "muro", materiale: materialeMuro(m.stato, colori), riferimento: m.id }));
    for (const [id, c] of spallette) {
      mesh.push(c.mesh({ id: `vano:${id}`, nome: `Vano da aprire ${id}`, genere: "vano", materiale: "muro_demolire", riferimento: id }));
    }

    for (const v of vani) {
      const { a, come } = apertura(v);
      if (come === "tamponata") {
        const c = new CostruttoreMesh();
        costruisciTamponamento(m, v, c);
        mesh.push(c.mesh({ id: `tamponamento:${a.id}`, nome: `Chiusura ${nomeApertura(a)}`, genere: "tamponamento", materiale: "muro_nuovo", riferimento: a.id }));
      } else if (a.tipo === "finestra" || a.tipo === "portafinestra") {
        const c = new CostruttoreMesh();
        costruisciVetro(m, v, c);
        mesh.push(c.mesh({ id: `vetro:${a.id}`, nome: `Vetro ${nomeApertura(a)}`, genere: "vetro", materiale: "vetro", riferimento: a.id }));
        if (a.ante !== undefined) {
          const t = new CostruttoreMesh();
          costruisciTelaio(m, v, t, a.ante, !!a.scorrevole);
          mesh.push(t.mesh({ id: `telaio:${a.id}`, nome: `Telaio ${nomeApertura(a)}`, genere: "elemento", materiale: "telaio", riferimento: a.id }));
        }
        if (a.zanzariera) {
          const mu = pianta.muri.find((x) => x.id === m.id);
          if (mu) {
            const lung = Math.hypot(mu.b.x - mu.a.x, mu.b.y - mu.a.y) || 1;
            const dx = (mu.b.x - mu.a.x) / lung, dy = (mu.b.y - mu.a.y) / lung;
            const centro = { x: mu.a.x + dx * a.posizione, y: mu.a.y + dy * a.posizione };
            const fuori = latoEsterno(centro, { x: -dy, y: dx }, mu.spessore, pianta.locali.map((l) => l.contorno)) || 1;
            const cz = new CostruttoreMesh();
            costruisciZanzariera(m, v, cz, a.zanzariera.tipo, a.zanzariera.altezzaPersa * CM, fuori);
            mesh.push(cz.mesh({ id: `zanzariera:${a.id}`, nome: `Zanzariera ${nomeApertura(a)}`, genere: "elemento", materiale: "zanzariera", riferimento: a.id }));
          }
        }
        if (a.oscurante) {
          // l'esterno è la parte del muro senza stanze; se non si capisce, quella della normale
          const mu = pianta.muri.find((x) => x.id === m.id);
          const o = a.oscurante;
          if (mu) {
            const lung = Math.hypot(mu.b.x - mu.a.x, mu.b.y - mu.a.y) || 1;
            const dx = (mu.b.x - mu.a.x) / lung, dy = (mu.b.y - mu.a.y) / lung;
            const centro = { x: mu.a.x + dx * a.posizione, y: mu.a.y + dy * a.posizione };
            const fuori = latoEsterno(centro, { x: -dy, y: dx }, mu.spessore, pianta.locali.map((l) => l.contorno)) || 1;
            const co = new CostruttoreMesh();
            const avvolgibile = o.tipo === "tapparella" || o.tipo === "veneziana";
            if (avvolgibile) {
              costruisciCassonetto(m, v, co, { tipo: o.tipo, ante: o.ante, ...(o.cassonetto ? { cassonetto: { tipo: o.cassonetto.tipo, altezza: o.cassonetto.altezza * CM, profondita: o.cassonetto.profondita * CM } } : {}) }, fuori);
            } else {
              costruisciAnteOscuranti(m, v, co, o.ante, fuori, o.tipo === "scuro");
            }
            const nomi = { tapparella: "Tapparella", veneziana: "Veneziana", persiana: "Persiane", scuro: "Scuri" }[o.tipo];
            mesh.push(co.mesh({ id: `oscurante:${a.id}`, nome: `${nomi} ${nomeApertura(a)}`, genere: "elemento", materiale: avvolgibile ? "oscurante" : "legno", riferimento: a.id }));
          }
        }
      }
    }

    // Dettagli da fuori: davanzali di pietra sotto le finestre e zoccolatura alla base dei muri esterni
    const mu = pianta.muri.find((x) => x.id === m.id);
    const fuori = mu ? latoEsterno({ x: ((m.a.x + m.b.x) / 2) / CM, y: ((m.a.y + m.b.y) / 2) / CM }, { x: m.n.x, y: m.n.y }, mu.spessore, pianta.locali.map((l) => l.contorno)) : 0;
    if (fuori && m.stato !== "demolire") {
      const rot = Math.atan2(m.d.y, m.d.x);
      const mezzoDi = (s: number) => ({ x: m.a.x + m.d.x * s, y: m.a.y + m.d.y * s });
      const h = m.spessore / 2;
      const davanzali = new CostruttoreMesh();
      for (const v of vani) {
        const { a, come } = apertura(v);
        if (come === "tamponata" || a.tipo !== "finestra" || v.z0 < 0.3) continue;
        const mz = mezzoDi((v.s0 + v.s1) / 2);
        const profondita = m.spessore / 2 + 0.06, centro = h - m.spessore / 4 + 0.03;
        davanzali.scatola(mz.x + m.n.x * fuori * centro, mz.y + m.n.y * fuori * centro, v.z0 - 0.035, v.s1 - v.s0 + 0.08, profondita, 0.035, rot);
      }
      if (!davanzali.vuoto()) mesh.push(davanzali.mesh({ id: `davanzali:${m.id}`, nome: `Davanzali ${m.id}`, genere: "elemento", materiale: "davanzale", riferimento: m.id }));
      if (opzioni.zoccolo !== false) {
        const da = fuori > 0 ? e.piu0 : e.meno0, a1 = fuori > 0 ? e.piu1 : e.meno1;
        // la zoccolatura si interrompe alle porte (i vani che arrivano a terra)
        const buchi = vani.filter((v) => v.z0 < 0.3).map((v) => [v.s0, v.s1] as [number, number]).sort((p, q) => p[0] - q[0]);
        const tratti: Array<[number, number]> = [];
        let cursore = da;
        for (const [b0, b1] of buchi) {
          if (b0 > cursore) tratti.push([cursore, Math.min(b0, a1)]);
          cursore = Math.max(cursore, b1);
        }
        if (cursore < a1) tratti.push([cursore, a1]);
        const zoc = new CostruttoreMesh();
        for (const [s0, s1] of tratti) {
          if (s1 - s0 < 0.05) continue;
          const mz = mezzoDi((s0 + s1) / 2);
          zoc.scatola(mz.x + m.n.x * fuori * (h + 0.012), mz.y + m.n.y * fuori * (h + 0.012), 0, s1 - s0, 0.03, 0.3, rot);
        }
        if (!zoc.vuoto()) mesh.push(zoc.mesh({ id: `zoccolo:${m.id}`, nome: `Zoccolatura ${m.id}`, genere: "elemento", materiale: "zoccolo", riferimento: m.id }));
      }
    }
  }

  // Marciapiede intorno all'edificio (solo se è più o meno un rettangolo e non c'è un lotto disegnato)
  if (opzioni.zoccolo !== false && !pianta.aree?.length && !pianta.terreno?.length && muri.length >= 4) {
    const xs = pianta.muri.flatMap((q) => [q.a.x, q.b.x]), ys = pianta.muri.flatMap((q) => [q.a.y, q.b.y]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const areaStanze = pianta.locali.reduce((t, l) => t + Math.abs(l.contorno.reduce((s, p, i) => { const q = l.contorno[(i + 1) % l.contorno.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2, 0);
    if (areaStanze > 0 && areaStanze / ((x1 - x0) * (y1 - y0)) >= 0.7) {
      const sp = Math.max(...pianta.muri.map((q) => q.spessore)) / 2;
      const [ax0, ax1, ay0, ay1] = [(x0 - sp - 90) * CM, (x1 + sp + 90) * CM, (y0 - sp - 90) * CM, (y1 + sp + 90) * CM];
      const [bx0, bx1, by0, by1] = [(x0 - sp) * CM, (x1 + sp) * CM, (y0 - sp) * CM, (y1 + sp) * CM];
      const mp = new CostruttoreMesh();
      mp.scatola((ax0 + ax1) / 2, (ay0 + by0) / 2, 0, ax1 - ax0, by0 - ay0, 0.03, 0);
      mp.scatola((ax0 + ax1) / 2, (by1 + ay1) / 2, 0, ax1 - ax0, ay1 - by1, 0.03, 0);
      mp.scatola((ax0 + bx0) / 2, (by0 + by1) / 2, 0, bx0 - ax0, by1 - by0, 0.03, 0);
      mp.scatola((bx1 + ax1) / 2, (by0 + by1) / 2, 0, ax1 - bx1, by1 - by0, 0.03, 0);
      mesh.push(mp.mesh({ id: "marciapiede", nome: "Marciapiede", genere: "pavimento", materiale: "marciapiede", riferimento: "edificio" }));
    }
  }

  nodi.forEach((nodo, i) => {
    const c = new CostruttoreMesh();
    const contorno = pulisciPoligono(nodo.contorno, 1e-6);
    c.poligono(contorno.map((p) => [p.x, nodo.altezza, p.y] as V3), [0, 1, 0]);
    c.poligono(contorno.map((p) => [p.x, 0, p.y] as V3), [0, -1, 0]);
    if (!c.vuoto()) mesh.push(c.mesh({ id: `nodo:${i + 1}`, nome: `Incrocio muri ${i + 1}`, genere: "nodo", materiale: "muro", riferimento: "" }));
  });

  for (const l of pianta.locali) {
    const contorno = pulisciPoligono(l.contorno.map((p) => v2(p.x * CM, p.y * CM)));
    if (contorno.length < 3) {
      avvisi.push(`${l.nome}: contorno non valido, pavimento non disegnato.`);
      continue;
    }
    // la scala e l'ascensore del piano sotto passano dal pavimento: lì c'è il buco (solo l'ingombro, non tutta la stanza)
    // il buco che sbordava dalla stanza (scala a tutta larghezza) si stringe verso il centro finché ci sta
    const bucoDi = (poligoni: Array<Array<{ x: number; y: number }>> | undefined) => (poligoni ?? []).flatMap((q) => {
      const pts = q.map((pt) => v2(pt.x * CM, pt.y * CM));
      const c = v2(pts.reduce((a, pt) => a + pt.x, 0) / pts.length, pts.reduce((a, pt) => a + pt.y, 0) / pts.length);
      if (!puntoNelPoligono(c, contorno)) return [];
      for (let k = 1; k >= 0.6; k -= 0.04) {
        const r = pts.map((pt) => v2(c.x + (pt.x - c.x) * k, c.y + (pt.y - c.y) * k));
        if (r.every((pt) => puntoNelPoligono(pt, contorno))) return [r];
      }
      return [];
    });
    const buchiPav = bucoDi(opzioni.buchiPavimento);
    // senza elementi sotto, un locale chiamato «scala/vano scala» resta senza pavimento come prima
    const foro = opzioni.foroScala && !opzioni.buchiPavimento?.length && /scal/i.test(l.nome);
    if (!foro) {
      const pav = new CostruttoreMesh();
      pav.orizzontale(buchiPav.length ? poligonoConBuchi(contorno, buchiPav) : contorno, 0, true);
      mesh.push(pav.mesh({ id: `pavimento:${l.id}`, nome: `Pavimento ${l.nome}`, genere: "pavimento", materiale: materialePavimento(l.destinazione), riferimento: l.id }));
    }
    // all'aperto non c'è soffitto
    if (conSoffitto && !falde && !/balcon|terrazz|giardino|cortile/.test(l.destinazione)) {
      const sof = new CostruttoreMesh();
      const buchiSof = bucoDi(opzioni.buchiSoffitto);
      sof.orizzontale(buchiSof.length ? poligonoConBuchi(contorno, buchiSof) : contorno, l.altezza * CM, false);
      mesh.push(sof.mesh({ id: `soffitto:${l.id}`, nome: `Soffitto ${l.nome}`, genere: "soffitto", materiale: "soffitto", riferimento: l.id }));
    }
  }

  if (conElementi) {
    for (const el of pianta.elementi) {
      const perMateriale = new Map<string, CostruttoreMesh>();
      costruisciElemento(
        el.tipo,
        { x: el.centro.x * CM, z: el.centro.y * CM },
        (el.rotazione * Math.PI) / 180,
        {
          l: el.larghezza !== undefined ? el.larghezza * CM : undefined,
          p: el.profondita !== undefined ? el.profondita * CM : undefined,
          // in mansarda il lucernario sta sulla falda sopra di lui
          senzaCabina: el.senzaCabina,
          interpiano: el.interpiano !== undefined ? el.interpiano * CM : undefined,
          h: el.tipo === "lucernario" && falde ? quotaIn(falde, el.centro.x * CM, el.centro.y * CM) + 0.02
            : el.tipo === "quota_terreno" ? (pianta.terreno?.length ? quotaTerreno(pianta.terreno, el.centro.x, el.centro.y) * CM : 0)
            : el.altezza !== undefined ? el.altezza * CM : undefined,
        },
        (materiale) => {
          if (!perMateriale.has(materiale)) perMateriale.set(materiale, new CostruttoreMesh());
          return perMateriale.get(materiale)!;
        },
      );
      const nome = `${modelloElemento(el.tipo).nome} ${el.id}`;
      for (const [materiale, c] of perMateriale) {
        mesh.push(c.mesh({ id: `elemento:${el.id}:${materiale}`, nome: perMateriale.size > 1 ? `${nome} (${MATERIALI[materiale]?.nome.toLowerCase() ?? materiale})` : nome, genere: "elemento", materiale, riferimento: el.id }));
      }
    }
  }

  if (conSoffitto) mesh.push(...meshTetto(pianta, muri));

  // Tubazioni e cavi stimati dai simboli degli impianti (su richiesta)
  let impianti: Scena3D["impianti"];
  if (opzioni.impianti) {
    const r = meshImpianti(pianta);
    mesh.push(...r.mesh);
    avvisi.push(...r.avvisi);
    impianti = r.impianti;
  }

  // Aree esterne: superfici appena sopra il terreno; il lotto recintato ha muretto e rete.
  for (const a of pianta.aree ?? []) {
    const contorno = pulisciPoligono(a.contorno.map((p) => v2(p.x * CM, p.y * CM)));
    if (contorno.length < 3) continue;
    if (a.tipo === "lotto") {
      if (a.recinzione === false) continue;
      const muretto = new CostruttoreMesh();
      const rete = new CostruttoreMesh();
      contorno.forEach((p, i) => {
        const q = contorno[(i + 1) % contorno.length];
        const l = Math.hypot(q.x - p.x, q.y - p.y);
        if (l < 0.05) return;
        const rot = Math.atan2(q.y - p.y, q.x - p.x);
        muretto.scatola((p.x + q.x) / 2, (p.y + q.y) / 2, 0, l, 0.2, 0.3, rot);
        rete.scatola((p.x + q.x) / 2, (p.y + q.y) / 2, 0.3, l, 0.03, 1.2, rot);
      });
      mesh.push(muretto.mesh({ id: `area:${a.id}:muretto`, nome: "Recinzione (muretto)", genere: "elemento", materiale: "pietra", riferimento: a.id }));
      mesh.push(rete.mesh({ id: `area:${a.id}:rete`, nome: "Recinzione (rete)", genere: "elemento", materiale: "recinzione", riferimento: a.id }));
      continue;
    }
    const c = new CostruttoreMesh();
    const q = (a.quota ?? 0) * CM;
    c.orizzontale(contorno, q + (a.tipo === "aiuola" ? 0.08 : 0.004), true);
    // un'area rialzata ha i fianchi (muretti del terrazzamento)
    if (Math.abs(q) > 0.05) {
      contorno.forEach((p, i) => {
        const r = contorno[(i + 1) % contorno.length];
        const [y0, y1] = q > 0 ? [0, q] : [q, 0];
        const l = Math.hypot(r.x - p.x, r.y - p.y) || 1;
        c.quad([p.x, y0, p.y], [r.x, y0, r.y], [r.x, y1, r.y], [p.x, y1, p.y], [(r.y - p.y) / l, 0, -(r.x - p.x) / l]);
      });
    }
    mesh.push(c.mesh({ id: `area:${a.id}`, nome: `Area esterna ${a.tipo}`, genere: "pavimento", materiale: MATERIALE_AREA[a.tipo] ?? "pavimento_esterno", riferimento: a.id }));
  }

  const limiti = limitiDi(mesh);
  // fondazioni: dopo i limiti, così la telecamera non si allontana per ciò che sta sottoterra
  if (opzioni.fondazioni) {
    const f = meshFondazioni(pianta);
    if (f) mesh.push(f);
  }
  if (opzioni.terreno && opzioni.terreno > 0 && mesh.length) mesh.push(meshTerreno(limiti, opzioni.terreno, pianta.terreno, limitiDi(mesh, (g) => g === "muro")));
  const usati = new Set(mesh.map((m) => m.materiale));
  const materiali = Object.fromEntries(Object.entries(MATERIALI).filter(([k]) => usati.has(k)));
  return { mesh: mesh.filter((m) => m.indici.length > 0), materiali, limiti, avvisi, ...(impianti ? { impianti } : {}) };
}

/**
 * Il prato intorno, `k` metri oltre i limiti, un centimetro sotto quota zero (non si sovrappone ai
 * pavimenti). Con due o più punti quotati il terreno segue la loro pendenza (shared/planimetrie/
 * terreno.ts), su una griglia; sotto l'edificio resta a quota zero (lo scavo o il riporto attorno
 * alla casa è il gradino che si vede).
 */
/** Cordoli sotto le pareti portanti (almeno 25 cm) e plinti sotto i pilastri: 50 cm di altezza sotto il pavimento. */
export const FONDAZIONE_ALTEZZA_CM = 50;
export function meshFondazioni(pianta: PiantaPer3D): Mesh3D | null {
  const c = new CostruttoreMesh();
  for (const m of pianta.muri) {
    if (m.stato === "demolire" || m.spessore < 25) continue;
    const dx = (m.b.x - m.a.x) * CM, dz = (m.b.y - m.a.y) * CM, len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const largo = Math.max(0.6, m.spessore * CM + 0.4);
    c.scatola(((m.a.x + m.b.x) / 2) * CM, ((m.a.y + m.b.y) / 2) * CM, -FONDAZIONE_ALTEZZA_CM * CM, len + largo / 2, largo, FONDAZIONE_ALTEZZA_CM * CM, Math.atan2(dz, dx));
  }
  for (const e of pianta.elementi) {
    if (e.tipo !== "pilastro") continue;
    const lato = Math.max(1.0, Math.max(e.larghezza ?? 30, e.profondita ?? 30) * CM + 0.7);
    c.scatola(e.centro.x * CM, e.centro.y * CM, -(FONDAZIONE_ALTEZZA_CM + 10) * CM, lato, lato, (FONDAZIONE_ALTEZZA_CM + 10) * CM, (e.rotazione * Math.PI) / 180);
  }
  return c.vuoto() ? null : c.mesh({ id: "fondazioni", nome: "Fondazioni", genere: "elemento", materiale: "calcestruzzo", riferimento: "fondazioni" });
}

export function meshTerreno(limiti: { min: V3; max: V3 }, k: number, punti?: PuntoQuotato[], edificio?: { min: V3; max: V3 }): Mesh3D {
  const t = new CostruttoreMesh();
  if (punti && punti.length >= 2) {
    const x0 = Math.min(limiti.min[0], ...punti.map((p) => p.x * CM)) - k, x1 = Math.max(limiti.max[0], ...punti.map((p) => p.x * CM)) + k;
    const z0 = Math.min(limiti.min[2], ...punti.map((p) => p.y * CM)) - k, z1 = Math.max(limiti.max[2], ...punti.map((p) => p.y * CM)) + k;
    const n = 48;
    const sotto = (x: number, z: number) => !!edificio && Number.isFinite(edificio.min[0]) && x >= edificio.min[0] - 0.05 && x <= edificio.max[0] + 0.05 && z >= edificio.min[2] - 0.05 && z <= edificio.max[2] + 0.05;
    const h = (i: number, j: number): V3 => {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * j) / n;
      return [x, sotto(x, z) ? -0.01 : quotaTerreno(punti, x / CM, z / CM) * CM - 0.01, z];
    };
    const tri = (a: V3, b: V3, c: V3) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nn: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (nn[1] < 0) nn = [-nn[0], -nn[1], -nn[2]];
      t.poligono([a, b, c], nn);
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = h(i, j), b = h(i + 1, j), c = h(i + 1, j + 1), d = h(i, j + 1);
      tri(a, b, c);
      tri(a, c, d);
    }
    return t.mesh({ id: "terreno", nome: "Terreno", genere: "pavimento", materiale: "prato", riferimento: "terreno" });
  }
  t.orizzontale([v2(limiti.min[0] - k, limiti.min[2] - k), v2(limiti.max[0] + k, limiti.min[2] - k), v2(limiti.max[0] + k, limiti.max[2] + k), v2(limiti.min[0] - k, limiti.max[2] + k)], -0.01, true);
  return t.mesh({ id: "terreno", nome: "Terreno", genere: "pavimento", materiale: "prato", riferimento: "terreno" });
}

export function limitiDi(mesh: Mesh3D[], genere?: (g: Mesh3D["genere"]) => boolean): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const m of mesh) {
    if (genere && !genere(m.genere)) continue;
    for (let i = 0; i < m.posizioni.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], m.posizioni[i + k]);
        max[k] = Math.max(max[k], m.posizioni[i + k]);
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}
