/**
 * Il verde del giardino in un comando: siepe lungo il confine del prato, alberi negli angoli lontani dalla casa,
 * recinzione. Tutto calcolato dal codice: lunghezze, posizioni, distanze dai muri e dagli oggetti già presenti
 * (piscina, auto, pergola). Sono elementi normali della pianta: si spostano, si tolgono, si annullano.
 *
 * Coordinate della pianta di lavoro: cm, y verso il basso.
 */
import type { AreaLavoro, Pianta, Punto } from "./adattatore";
import { CATALOGO } from "./catalogo";
import { aggiungiArea, aggiungiElemento, eliminaElemento, modificaArea, statoNuovo, visibile, type Vista } from "./comandi";

/** `ingresso`: vialetto dalla casa al confine, cancello pedonale in fondo, aiuole all'inizio e lampioni lungo il percorso. */
export interface RichiestaGiardino { siepe?: boolean; alberi?: boolean; recinzione?: boolean; ingresso?: boolean }
export interface EsitoGiardino { pianta: Pianta; aggiunti: string[]; siepeM: number; alberi: number; recintate: number; aree: string[]; vialettoM: number; cancelli: number; aiuole: number; lampioni: number }

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
  const esito: EsitoGiardino = { pianta, aggiunti: [], siepeM: 0, alberi: 0, recintate: 0, aree: [], vialettoM: 0, cancelli: 0, aiuole: 0, lampioni: 0 };
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
    const presenti = (esito.pianta.elementi ?? []).filter((e) => visibile(e.stato, vista) && e.stato !== "da_demolire" && dentro(e.centro, c));
    const occupati: Rett[] = presenti.map((e) => ingombro(e.centro, e.larghezza, e.profondita, e.rotazione));
    // una siepe già piantata non ferma il vialetto: dove passa il cancello quel pezzo si toglie
    const siepiPresenti = presenti.filter((e) => e.tipo === "siepe").map((e) => ({ id: e.id, box: ingombro(e.centro, e.larghezza, e.profondita, e.rotazione) }));
    // per il vialetto di un albero conta il tronco: sotto la chioma si cammina
    const ostacoliPercorso: Rett[] = presenti.filter((e) => e.tipo !== "siepe")
      .map((e) => e.tipo === "albero" ? ingombro(e.centro, 80, 80, 0) : ingombro(e.centro, e.larghezza, e.profondita, e.rotazione));
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

    const giaVialetto = (esito.pianta.aree ?? []).some((a) => a.tipo === "vialetto" && visibile(a.stato, vista) && a.stato !== "da_demolire" && a.contorno.some((p) => dentro(p, c)));
    if (richiesta.ingresso && !giaVialetto) {
      // Il vialetto parte dal tratto di prato appoggiato alla casa e va dritto al confine opposto.
      const LARGO = 120, PASSO = 20;
      let scelta: { da: Punto; n: Punto; u: Punto; lungo: number } | undefined;
      for (const lato of lati) {
        const contatto: number[] = [];
        for (let t = LARGO; t <= lato.L - LARGO; t += PASSO) {
          const punto = { x: lato.p.x + lato.u.x * t, y: lato.p.y + lato.u.y * t };
          if (distanzaDaiMuri(punto) < DISTANZA_DALLA_CASA) contatto.push(t);
        }
        if (!contatto.length) continue;
        // si prova dal centro del contatto, poi verso i due estremi, finché il percorso è libero
        const centro = contatto[Math.floor(contatto.length / 2)];
        for (const t of [...contatto].sort((x, y) => Math.abs(x - centro) - Math.abs(y - centro))) {
          const da = { x: lato.p.x + lato.u.x * t, y: lato.p.y + lato.u.y * t };
          let lungo = 0;
          while (lungo < 6000 && dentro({ x: da.x + lato.n.x * (lungo + PASSO), y: da.y + lato.n.y * (lungo + PASSO) }, c)) lungo += PASSO;
          if (lungo < 200) continue;
          const meta = { x: da.x + lato.n.x * lungo / 2, y: da.y + lato.n.y * lungo / 2 };
          const rot = Math.abs(lato.n.x) > Math.abs(lato.n.y) ? 0 : 90;
          const box = ingombro(meta, lungo, LARGO + 40, rot);
          if (ostacoliPercorso.some((o) => sovrapposti(o, box))) continue;
          if (!scelta || lungo < scelta.lungo) scelta = { da, n: lato.n, u: lato.u, lungo };
          break;
        }
      }
      if (scelta) {
        const { da, n, u, lungo } = scelta;
        const angolo = (k: number, h: number) => ({ x: Math.round(da.x + u.x * k * LARGO / 2 + n.x * h), y: Math.round(da.y + u.y * k * LARGO / 2 + n.y * h) });
        const r = aggiungiArea(esito.pianta, "vialetto", [angolo(-1, 0), angolo(1, 0), angolo(1, lungo), angolo(-1, lungo)], vista);
        esito.pianta = modificaArea(r.pianta, r.id, { nome: "Vialetto" });
        esito.vialettoM = lungo / 100;
        const rotLungo = Math.abs(n.x) > Math.abs(n.y) ? 0 : 90, rotTraverso = 90 - rotLungo;
        occupati.push(ingombro({ x: da.x + n.x * lungo / 2, y: da.y + n.y * lungo / 2 }, lungo, LARGO, rotLungo));
        const varco = ingombro({ x: da.x + n.x * (lungo - 40), y: da.y + n.y * (lungo - 40) }, 140, LARGO + 60, rotLungo);
        for (const sp of siepiPresenti) if (sovrapposti(sp.box, varco)) esito.pianta = eliminaElemento(esito.pianta, sp.id, vista);
        const cancello = voce("cancello_pedonale");
        posa(cancello, { x: Math.round(da.x + n.x * (lungo - 4)), y: Math.round(da.y + n.y * (lungo - 4)) }, rotTraverso);
        esito.cancelli++;
        const aiuola = voce("aiuola");
        for (const k of [-1, 1]) {
          const centro = { x: Math.round(da.x + u.x * k * (LARGO / 2 + 100) + n.x * 75), y: Math.round(da.y + u.y * k * (LARGO / 2 + 100) + n.y * 75) };
          const box = ingombro(centro, 160, 70, rotTraverso);
          if (!dentro(centro, c) || distanzaDaiMuri(centro) < 25 || occupati.some((o) => sovrapposti(o, box))) continue;
          posa({ ...aiuola, profondita: 70 }, centro, rotTraverso, 160);
          esito.aiuole++;
        }
        const lampione = voce("lampione");
        for (const [quota, k] of [[.3, -1], [.72, 1]] as const) {
          const centro = { x: Math.round(da.x + n.x * lungo * quota + u.x * k * (LARGO / 2 + 35)), y: Math.round(da.y + n.y * lungo * quota + u.y * k * (LARGO / 2 + 35)) };
          const box = ingombro(centro, lampione.larghezza, lampione.profondita, 0);
          if (!dentro(centro, c) || occupati.some((o) => sovrapposti(o, box))) continue;
          posa(lampione, centro, 0);
          esito.lampioni++;
        }
        // davanti al cancello resta un varco anche nella siepe
        occupati.push(ingombro({ x: da.x + n.x * (lungo - 40), y: da.y + n.y * (lungo - 40) }, 140, LARGO + 60, rotLungo));
      }
    }
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
    if (esito.aggiunti.length > prima || richiesta.recinzione || esito.vialettoM) esito.aree.push(prato.id);
  }
  return esito;
}
