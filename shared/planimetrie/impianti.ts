/**
 * Impianti dalla pianta: linee stimate e potenza del clima.
 *
 * Nessuno disegna i cavi a mano. Dai simboli posati nella pianta si stimano i
 * percorsi, che finiscono nel computo in metri:
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
import type { Elemento, Locale, Punto, StatoPianta } from "./modello.ts";
import { areaPoligono } from "./geometria.ts";

export type LineaImpianto = "elettrica" | "acqua" | "scarico" | "frigorifera" | "condensa" | "riscaldamento";

export interface Percorso {
  linea: LineaImpianto;
  daId: string;
  aId: string;
  da: Punto;
  a: Punto;
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
  return percorsiDaElementi(stato.elementi, stato.locali.map((l) => l.contorno));
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
export function percorsiDaElementi(elementi: readonly ElementoImpianto[], stanze: readonly (readonly Punto[])[] = []): { percorsi: Percorso[]; mancano: PartenzaMancante[] } {
  // quelli da togliere non contano
  const el = elementi.filter((e) => e.stato !== "da_demolire");
  const percorsi: Percorso[] = [];
  const mancano: PartenzaMancante[] = [];
  const tipo = (t: string) => el.filter((e) => e.tipo === t);

  const collega = (linea: LineaImpianto, utenze: ElementoImpianto[], sorgenti: ElementoImpianto[], verticale: (u: ElementoImpianto, s: ElementoImpianto) => number) => {
    for (const u of utenze) {
      const s = piuVicino(u, sorgenti);
      if (!s || s.id === u.id) continue;
      percorsi.push({ linea, daId: s.id, aId: u.id, da: s.posizione, a: u.posizione, lunghezzaCm: squadra(u.posizione, s.posizione) + verticale(u, s) });
    }
  };

  // Elettrico: le linee corrono a pavimento; dal quadro si scende, al punto si risale.
  const quadri = tipo("quadro_elettrico");
  const utenzeEl = el.filter((e) => UTENZE_ELETTRICHE.has(e.tipo));
  if (utenzeEl.length && !quadri.length) mancano.push("quadro_elettrico");
  if (quadri.length && stanze.length) {
    const gruppi = new Map<number, ElementoImpianto[]>();
    const soli: ElementoImpianto[] = [];
    for (const u of utenzeEl) {
      const i = stanze.findIndex((c) => c.length >= 3 && dentroPoligono(u.posizione, c));
      if (i < 0) soli.push(u); else gruppi.set(i, [...(gruppi.get(i) ?? []), u]);
    }
    collega("elettrica", soli, quadri, (u, s) => quota(s) + quota(u));
    for (const gruppo of gruppi.values()) {
      // dorsale: dal quadro al punto più vicino; poi il più vicino fra quelli da collegare
      const restanti = [...gruppo];
      let ultimo: ElementoImpianto | null = null;
      while (restanti.length) {
        let migliore = 0, da: ElementoImpianto | null = null, d = Infinity;
        restanti.forEach((u, i) => {
          const s = ultimo ?? piuVicino(u, quadri)!;
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
    collega("elettrica", utenzeEl, quadri, (u, s) => quota(s) + quota(u));
  }

  // Acqua: dal collettore o dalla caldaia.
  const sorgentiAcqua = el.filter((e) => SORGENTI_ACQUA.includes(e.tipo));
  const utenzeAcqua = el.filter((e) => UTENZE_ACQUA.has(e.tipo));
  if (utenzeAcqua.length && !sorgentiAcqua.length) mancano.push("collettore");
  collega("acqua", utenzeAcqua, sorgentiAcqua, (u, s) => quota(s) + quota(u));

  // Scarichi: alla colonna più vicina, a pavimento.
  const colonne = tipo("colonna_scarico");
  const utenzeScarico = el.filter((e) => UTENZE_SCARICO.has(e.tipo));
  if (utenzeScarico.length && !colonne.length) mancano.push("colonna_scarico");
  collega("scarico", utenzeScarico, colonne, (u) => quota(u));

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

  return { percorsi, mancano };
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
