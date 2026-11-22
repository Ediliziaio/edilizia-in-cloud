/**
 * Impianti dalla pianta: linee stimate e potenza del clima.
 *
 * Dai simboli si stimano i percorsi iniziali. Il disegno può sostituire il
 * tratto orizzontale di ciascun collegamento prima di calcolarne i metri:
 * - elettrico: dal quadro a ogni presa, interruttore, punto luce e split. Il tratto
 *   orizzontale va lungo le pareti (distanza «a squadra», |dx| + |dy|), più le
 *   calate in verticale (quadro a 1,60 m, presa a 0,30 m, punto luce a soffitto).
 *   Il corrugato è il percorso; il cavo vale tre conduttori (fase, neutro, terra);
 * - acqua: dal collettore (o dalla caldaia) a ogni punto acqua e sanitario;
 *   due tubi, acqua fredda e calda;
 * - scarichi: da ogni sanitario, lavatrice e punto di scarico alla colonna più vicina;
 * - clima: da ogni split all'unità esterna più vicina, con linea frigorifera
 *   (due tubi di rame) e scarico condensa.
 * A ogni percorso si aggiunge lo sfrido (10%). Sono quantità STIMATE, da controllare.
 *
 * Coordinate e misure del modello: cm, y in su.
 */
import type { Elemento, LineaImpianto, Locale, Punto, StatoPianta, TracciatoImpianto } from "./modello.ts";
import { areaPoligono, distanza } from "./geometria.ts";
export type { LineaImpianto } from "./modello.ts";

export interface Percorso {
  linea: LineaImpianto;
  daId: string;
  aId: string;
  da: Punto;
  a: Punto;
  /** Presente quando il tratto orizzontale segue il disegno dell’utente. */
  vertici?: Punto[];
  /** Orizzontale + verticale, senza sfrido, in cm. */
  lunghezzaCm: number;
}

export const SFRIDO = 0.1;

/** Altezza da terra del punto di arrivo (cm), quando il simbolo non la dice. */
const QUOTA: Record<string, number> = {
  quadro_elettrico: 160, presa: 30, interruttore: 110, punto_luce: 270, split: 220, unita_esterna: 30,
  punto_acqua: 50, lavabo: 55, wc: 20, bidet: 20, doccia: 10, vasca: 10, lavatrice: 60, cucina: 60, caldaia: 150,
  scarico: 0, colonna_scarico: 0, collettore: 40, termosifone: 15, pompa_calore: 30, bollitore: 120,
};

const UTENZE_ELETTRICHE = new Set(["presa", "interruttore", "punto_luce", "split", "caldaia", "lavatrice", "frigorifero", "pompa_calore", "wallbox", "inverter", "vmc", "termostato"]);
const UTENZE_ACQUA = new Set(["punto_acqua", "lavabo", "wc", "bidet", "doccia", "vasca", "lavatrice", "cucina"]);
const UTENZE_SCARICO = new Set(["scarico", "lavabo", "wc", "bidet", "doccia", "vasca", "lavatrice", "cucina"]);
export const eElementoElettrico = (tipo: string) => tipo === "quadro_elettrico" || UTENZE_ELETTRICHE.has(tipo);
export const eElementoScarico = (tipo: string) => tipo === "colonna_scarico" || UTENZE_SCARICO.has(tipo);
const SORGENTI_ACQUA = ["collettore", "caldaia", "bollitore"];
const GENERATORI = ["caldaia", "pompa_calore"];

/** Quanto basta di un simbolo per stimare le linee (vale per il modello e per l'editor). */
export type ElementoImpianto = Pick<Elemento, "id" | "tipo" | "posizione" | "stato">;

const squadra = (a: Punto, b: Punto) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const quota = (e: ElementoImpianto) => QUOTA[e.tipo] ?? 0;
/** Altezza da terra (cm) a cui una linea arriva a un simbolo di questo tipo: serve anche al 3D per disegnare le calate. */
export const quotaPunto = (tipo: string) => QUOTA[tipo] ?? 0;

function piuVicino(da: ElementoImpianto, fra: ElementoImpianto[]): ElementoImpianto | null {
  let migliore: ElementoImpianto | null = null;
  for (const f of fra) if (!migliore || squadra(da.posizione, f.posizione) < squadra(da.posizione, migliore.posizione)) migliore = f;
  return migliore;
}


/**
 * I percorsi stimati di uno stato della pianta. Senza quadro (o collettore, colonna,
 * unità esterna) quella linea non si stima: lo dice `mancano`.
 */
export function percorsiImpianti(stato: StatoPianta) {
  return percorsiDaElementi(stato.elementi, stato.locali, stato.tracciatiImpianti);
}

export function chiaveTratto({ linea, daId, aId }: Pick<TracciatoImpianto, "linea" | "daId" | "aId">) {
  return `${linea}:${daId}:${aId}`;
}

export function puntiPercorso(p: Percorso): Punto[] {
  return [p.da, ...(p.vertici ?? [{ x: p.a.x, y: p.da.y }]), p.a];
}

export function percorsoConVertici(p: Percorso, vertici: Punto[]): Percorso {
  const sviluppo = (punti: Punto[]) => punti.slice(1).reduce((cm, punto, i) => cm + distanza(punti[i], punto), 0);
  return {
    ...p, vertici,
    lunghezzaCm: sviluppo([p.da, ...vertici, p.a]) + Math.max(0, p.lunghezzaCm - sviluppo(puntiPercorso(p))),
  };
}

export interface AttraversamentoImpianto {
  punto: Punto;
  muroId: string;
  tipoMuro: StatoPianta["muri"][number]["tipo"];
  aperturaId?: string;
}

/** Incroci in proiezione. La quota di posa va riscontrata sul progetto. */
export function attraversamentiImpianto(p: Percorso, stato: Pick<StatoPianta, "muri" | "aperture">): AttraversamentoImpianto[] {
  if (!p.vertici) return [];
  const punti = puntiPercorso(p);
  const esiti: AttraversamentoImpianto[] = [];
  for (const muro of stato.muri) {
    if (muro.stato === "da_demolire") continue;
    const aperture = stato.aperture.filter(a => a.muroId === muro.id && a.stato !== "da_demolire");
    const mx = muro.p2.x - muro.p1.x, my = muro.p2.y - muro.p1.y;
    const lunghezza = Math.hypot(mx, my);
    for (let i = 1; i < punti.length; i++) {
      const a = punti[i - 1], b = punti[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const det = dx * my - dy * mx;
      if (Math.abs(det) < 1e-6) continue;
      const x = muro.p1.x - a.x, y = muro.p1.y - a.y;
      const t = (x * my - y * mx) / det;
      const u = (x * dy - y * dx) / det;
      if (t <= 0 || t > 1 || (t === 1 && i === punti.length - 1) || u < 0 || u > 1) continue;
      const offset = u * lunghezza;
      const apertura = aperture.find(v => offset >= v.offset && offset <= v.offset + v.larghezza);
      esiti.push({ punto: { x: a.x + t * dx, y: a.y + t * dy }, muroId: muro.id, tipoMuro: muro.tipo, aperturaId: apertura?.id });
    }
  }
  return esiti;
}

function dentroPoligono(p: Punto, poly: readonly Punto[]): boolean {
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) s = !s;
  }
  return s;
}

export type PartenzaMancante = "quadro_elettrico" | "collettore" | "colonna_scarico" | "unita_esterna" | "generatore";

/**
 * `stanze`: i contorni dei locali. Con le stanze l'elettrico si stima come si posa: dal quadro
 * una dorsale al punto più vicino di ogni stanza, poi di punto in punto dentro la stanza.
 * Senza, ogni punto ha la sua linea dal quadro (stima per eccesso).
 */
type StanzaImpianti = readonly Punto[] | Pick<Locale, "contorno" | "unita">;

export function percorsiDaElementi(elementi: readonly ElementoImpianto[], stanze: readonly StanzaImpianti[] = [], tracciati: readonly TracciatoImpianto[] = []) {
  // quelli da togliere non contano
  const el = elementi.filter((e) => e.stato !== "da_demolire");
  const percorsi: Percorso[] = [];
  const mancano: PartenzaMancante[] = [];
  const mancanoPerUnita = new Map<string, { partenza: PartenzaMancante; unita: string }>();
  const puntiSenzaUnita = new Set<string>();
  const tipo = (t: string) => el.filter((e) => e.tipo === t);
  const contorni = stanze.map(s => "contorno" in s ? { punti: s.contorno, unita: s.unita?.trim() ?? "" } : { punti: s, unita: "" });
  const haUnita = contorni.some(c => c.unita);
  const locali = new Map(el.map(e => [e.id, contorni.findIndex(c => c.punti.length >= 3 && dentroPoligono(e.posizione, c.punti))]));
  const unita = (e: ElementoImpianto) => contorni[locali.get(e.id) ?? -1]?.unita ?? "";
  const sorgentiCompatibili = (u: ElementoImpianto, sorgenti: ElementoImpianto[], ammetteColonnaComune = false) => {
    if (!haUnita) return sorgenti;
    const sigla = unita(u).toLowerCase();
    if (!sigla) return [];
    return sorgenti.filter(s => unita(s).toLowerCase() === sigla || (ammetteColonnaComune && /comun|condominial|androne/i.test(unita(s))));
  };
  const manca = (partenza: PartenzaMancante, utenza: ElementoImpianto) => {
    mancano.push(partenza);
    const sigla = unita(utenza) || (haUnita ? "Punti senza unità" : "");
    if (sigla) mancanoPerUnita.set(partenza + "/" + sigla, { partenza, unita: sigla });
    if (haUnita && !unita(utenza)) puntiSenzaUnita.add(utenza.id);
  };

  const collega = (linea: LineaImpianto, utenze: ElementoImpianto[], sorgenti: ElementoImpianto[],
    verticale: (u: ElementoImpianto, s: ElementoImpianto) => number, partenza?: PartenzaMancante) => {
    for (const u of utenze) {
      const s = piuVicino(u, partenza ? sorgentiCompatibili(u, sorgenti, linea === "scarico") : sorgenti);
      if (!s && partenza) manca(partenza, u);
      if (!s || s.id === u.id) continue;
      percorsi.push({ linea, daId: s.id, aId: u.id, da: s.posizione, a: u.posizione, lunghezzaCm: squadra(u.posizione, s.posizione) + verticale(u, s) });
    }
  };

  // Elettrico: le linee corrono a pavimento; dal quadro si scende, al punto si risale.
  const quadri = tipo("quadro_elettrico");
  const utenzeEl = el.filter((e) => UTENZE_ELETTRICHE.has(e.tipo));
  if (stanze.length) {
    const gruppi = new Map<number, ElementoImpianto[]>();
    const soli: ElementoImpianto[] = [];
    for (const u of utenzeEl) {
      const i = locali.get(u.id) ?? -1;
      if (i < 0) soli.push(u); else gruppi.set(i, [...(gruppi.get(i) ?? []), u]);
    }
    collega("elettrica", soli, quadri, (u, s) => quota(s) + quota(u), "quadro_elettrico");
    for (const gruppo of gruppi.values()) {
      const compatibili = sorgentiCompatibili(gruppo[0], quadri);
      if (!compatibili.length) { gruppo.forEach(u => manca("quadro_elettrico", u)); continue; }
      // dorsale: dal quadro al punto più vicino; poi il più vicino fra quelli da collegare
      const restanti = [...gruppo];
      let ultimo: ElementoImpianto | null = null;
      while (restanti.length) {
        let migliore = 0, da: ElementoImpianto | null = null, d = Infinity;
        restanti.forEach((u, i) => {
          const s = ultimo ?? piuVicino(u, compatibili)!;
          const dist = squadra(u.posizione, s.posizione);
          if (dist < d) { d = dist; migliore = i; da = s; }
        });
        const u = restanti.splice(migliore, 1)[0];
        const s = da!;
        // si scende al pavimento e si risale a ogni punto
        percorsi.push({ linea: "elettrica", daId: s.id, aId: u.id, da: s.posizione, a: u.posizione, lunghezzaCm: d + quota(s) + quota(u) });
        ultimo = u;
      }
    }
  } else {
    collega("elettrica", utenzeEl, quadri, (u, s) => quota(s) + quota(u), "quadro_elettrico");
  }

  // Acqua: dal collettore o dalla caldaia.
  const sorgentiAcqua = el.filter((e) => SORGENTI_ACQUA.includes(e.tipo));
  const utenzeAcqua = el.filter((e) => UTENZE_ACQUA.has(e.tipo));
  collega("acqua", utenzeAcqua, sorgentiAcqua, (u, s) => quota(s) + quota(u), "collettore");

  // Scarichi: alla colonna più vicina, a pavimento.
  const colonne = tipo("colonna_scarico");
  const utenzeScarico = el.filter((e) => UTENZE_SCARICO.has(e.tipo));
  collega("scarico", utenzeScarico, colonne, (u) => quota(u), "colonna_scarico");

  // Riscaldamento: dal generatore (caldaia o pompa di calore) a ogni termosifone, mandata e ritorno.
  const generatori = el.filter((e) => GENERATORI.includes(e.tipo));
  const radiatori = tipo("termosifone");
  if (radiatori.length && !generatori.length) mancano.push("generatore");
  collega("riscaldamento", radiatori, generatori, (u, s) => quota(s) + quota(u));

  // Clima: linea frigorifera e condensa dallo split all'unità esterna.
  const esterne = tipo("unita_esterna");
  const split = tipo("split");
  if (split.length && !esterne.length) mancano.push("unita_esterna");
  collega("frigorifera", split, esterne, (u, s) => Math.abs(quota(u) - quota(s)));
  collega("condensa", split, esterne, (u) => quota(u));

  const daApplicare = new Map(tracciati.map(t => [chiaveTratto(t), t]));
  const linee = percorsi.map(p => {
    const chiave = chiaveTratto(p);
    const tracciato = daApplicare.get(chiave);
    if (!tracciato) return p;
    daApplicare.delete(chiave);
    return percorsoConVertici(p, tracciato.vertici);
  });
  return { percorsi: linee, mancano: [...new Set(mancano)], mancanoPerUnita: [...mancanoPerUnita.values()],
    puntiSenzaUnita: [...puntiSenzaUnita], tracciatiDaRicollegare: [...daApplicare.values()] };
}

/** Metri con lo sfrido, arrotondati al decimetro. */
export const metriConSfrido = (cm: number) => Math.round((cm / 100) * (1 + SFRIDO) * 10) / 10;

// ─── Clima: potenza consigliata ──────────────────────────────────────────────

/** Taglie commerciali degli split (BTU/h). */
export const TAGLIE_BTU = [7000, 9000, 12000, 18000, 24000] as const;

/**
 * BTU/h consigliati per un locale: circa 340 BTU/h al mq con soffitto a 2,70 m,
 * in proporzione all'altezza; si sale alla taglia commerciale successiva.
 * Indicazione di massima (esposizione, vetrate e isolamento contano): oltre 24.000
 * conviene più di uno split.
 */
export function btuConsigliati(locale: Pick<Locale, "contorno" | "altezza">): { btu: number; taglia: number; split: number } {
  const mq = areaPoligono(locale.contorno) / 10_000;
  const btu = Math.round(mq * 340 * Math.max(locale.altezza, 240) / 270);
  const massima = TAGLIE_BTU[TAGLIE_BTU.length - 1];
  const split = Math.max(1, Math.ceil(btu / massima));
  const perSplit = btu / split;
  const taglia = TAGLIE_BTU.find((t) => t >= perSplit) ?? massima;
  return { btu, taglia, split };
}

/** Destinazioni dove di solito si mette uno split. */
export const DESTINAZIONI_CLIMA = new Set(["soggiorno", "camera", "studio", "cucina"]);
