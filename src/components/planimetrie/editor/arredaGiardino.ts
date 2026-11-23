/**
 * Il verde del giardino in un comando: siepe lungo il confine del prato, alberi negli angoli lontani dalla casa,
 * recinzione. Tutto calcolato dal codice: lunghezze, posizioni, distanze dai muri e dagli oggetti già presenti
 * (piscina, auto, pergola). Sono elementi normali della pianta: si spostano, si tolgono, si annullano.
 *
 * Coordinate della pianta di lavoro: cm, y verso il basso.
 */
import type { AreaLavoro, Pianta, Punto } from "./adattatore";
import { CATALOGO } from "./catalogo";
import { aggiungiElemento, modificaArea, statoNuovo, visibile, type Vista } from "./comandi";

export interface RichiestaGiardino { siepe?: boolean; alberi?: boolean; recinzione?: boolean }
export interface EsitoGiardino { pianta: Pianta; aggiunti: string[]; siepeM: number; alberi: number; recintate: number; aree: string[] }

const DISTANZA_DALLA_CASA = 120; // un lato del prato più vicino di così a un muro è «contro casa»: resta libero
const PEZZO_SIEPE = 300;

interface Rett { x0: number; y0: number; x1: number; y1: number }
const sovrapposti = (a: Rett, b: Rett) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
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
const area2 = (c: Punto[]) => c.reduce((t, p, i) => { const q = c[(i + 1) % c.length]; return t + p.x * q.y - q.x * p.y; }, 0);

/** I prati visibili su cui lavorare. */
export function pratiDelGiardino(pianta: Pianta, vista: Vista): AreaLavoro[] {
  return (pianta.aree ?? []).filter((a) => a.tipo === "prato" && a.contorno.length >= 3 && visibile(a.stato, vista) && a.stato !== "da_demolire");
}

export function arredaGiardino(pianta: Pianta, vista: Vista, richiesta: RichiestaGiardino = { siepe: true, alberi: true }): EsitoGiardino {
  const esito: EsitoGiardino = { pianta, aggiunti: [], siepeM: 0, alberi: 0, recintate: 0, aree: [] };
  const muri = pianta.muri.filter((m) => visibile(m.stato, vista) && m.stato !== "da_demolire");
  const distanzaDaiMuri = (p: Punto) => Math.min(Infinity, ...muri.map((m) => {
    const dx = m.p2.x - m.p1.x, dy = m.p2.y - m.p1.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - m.p1.x) * dx + (p.y - m.p1.y) * dy) / l2));
    return Math.hypot(p.x - (m.p1.x + dx * t), p.y - (m.p1.y + dy * t)) - m.spessore / 2;
  }));
  const voce = (tipo: string) => CATALOGO.find((v) => v.tipo === tipo)!;
  const siepe = voce("siepe"), albero = voce("albero");

  for (const prato of pratiDelGiardino(pianta, vista)) {
    const c = prato.contorno;
    const verso = area2(c) > 0 ? 1 : -1;
    const occupati: Rett[] = (esito.pianta.elementi ?? [])
      .filter((e) => visibile(e.stato, vista) && e.stato !== "da_demolire" && dentro(e.centro, c))
      .map((e) => ingombro(e.centro, e.larghezza, e.profondita, e.rotazione));
    const giaSiepe = (esito.pianta.elementi ?? []).some((e) => e.tipo === "siepe" && visibile(e.stato, vista) && e.stato !== "da_demolire" && dentro(e.centro, c));
    const giaAlberi = (esito.pianta.elementi ?? []).some((e) => e.tipo === "albero" && visibile(e.stato, vista) && e.stato !== "da_demolire" && dentro(e.centro, c));
    const prima = esito.aggiunti.length;
    const posa = (v: typeof siepe, centro: Punto, rotazione: number, larghezza = v.larghezza) => {
      const r = aggiungiElemento(esito.pianta, { ...v, larghezza }, centro, { stato: statoNuovo(vista), rotazione });
      esito.pianta = r.pianta;
      esito.aggiunti.push(r.id);
      occupati.push(ingombro(centro, larghezza, v.profondita, rotazione));
    };
    const lati = c.map((p, i) => {
      const q = c[(i + 1) % c.length];
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
      const n = verso > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
      const medio = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      return { p, q, L, u, n, controCasa: distanzaDaiMuri(medio) < DISTANZA_DALLA_CASA };
    });

    if (richiesta.siepe && !giaSiepe) {
      for (const lato of lati) {
        if (lato.controCasa || lato.L < 120) continue;
        // agli angoli la siepe si ferma prima, per non incrociare quella del lato accanto
        const utile = lato.L - siepe.profondita - 10;
        const pezzi = Math.max(1, Math.ceil(utile / PEZZO_SIEPE)), lungo = Math.round(utile / pezzi);
        const rotazione = ((Math.round((Math.atan2(lato.u.y, lato.u.x) * 180) / Math.PI) % 180) + 180) % 180;
        for (let k = 0; k < pezzi; k++) {
          const t = siepe.profondita / 2 + 5 + lungo * (k + .5);
          const centro = { x: Math.round(lato.p.x + lato.u.x * t + lato.n.x * (siepe.profondita / 2 + 5)), y: Math.round(lato.p.y + lato.u.y * t + lato.n.y * (siepe.profondita / 2 + 5)) };
          const box = ingombro(centro, lungo, siepe.profondita, rotazione);
          if (!dentro(centro, c) || distanzaDaiMuri(centro) < 60 || occupati.some((o) => sovrapposti(o, box))) continue;
          posa(siepe, centro, rotazione, lungo);
          esito.siepeM += lungo / 100;
        }
      }
    }
    if (richiesta.alberi && !giaAlberi) {
      // negli angoli fra due lati liberi, verso l'interno; al massimo tre, i più lontani dalla casa
      const rientro = albero.larghezza / 2 + siepe.profondita + 40;
      const candidati = lati.map((lato, i) => {
        const prec = lati[(i - 1 + lati.length) % lati.length];
        const centro = { x: Math.round(lato.p.x + (lato.u.x - prec.u.x) * rientro), y: Math.round(lato.p.y + (lato.u.y - prec.u.y) * rientro) };
        return { centro, libero: !lato.controCasa && !prec.controCasa, lontano: distanzaDaiMuri(centro) };
      }).filter((k) => k.libero && dentro(k.centro, c) && k.lontano > albero.larghezza / 2 + 150).sort((a, b) => b.lontano - a.lontano);
      for (const k of candidati) {
        if (esito.alberi >= 3) break;
        // conta l'ingombro del tronco e di un po' di chioma: sotto la chioma si può stare, dentro la piscina no
        const box = ingombro(k.centro, albero.larghezza * .7, albero.profondita * .7, 0);
        if (occupati.some((o) => sovrapposti(o, box))) continue;
        posa(albero, k.centro, 0);
        esito.alberi++;
      }
    }
    if (richiesta.recinzione && prato.recinzione !== true) {
      esito.pianta = modificaArea(esito.pianta, prato.id, { recinzione: true });
      esito.recintate++;
    }
    if (esito.aggiunti.length > prima || richiesta.recinzione) esito.aree.push(prato.id);
  }
  return esito;
}
