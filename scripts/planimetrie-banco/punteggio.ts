// Quanto la pianta generata si discosta dalla verità del campione.
// «Correzioni» = quante mosse servirebbero a un utente per sistemarla:
// stanza mancante o in più, stanza con superficie fuori tolleranza,
// porta o finestra mancante o in più, conferma della scala.
// Obiettivo del piano: 8 piante su 10 corrette con al massimo 5 correzioni.

import type { Planimetria } from "../../supabase/functions/planimetria-genera/modelloProvvisorio.ts";
import { area } from "../../supabase/functions/planimetria-genera/geometria.ts";

export interface LocaleVero {
  nome?: string;
  destinazione: string;
  area_mq: number | null;
}

export interface CampioneVerita {
  id: string;
  ingresso: "documento" | "schizzo" | "descrizione";
  locali: LocaleVero[];
  aperture: Array<{ tipo: string }> | null;
}

export interface Punteggio {
  id: string;
  generata: boolean;
  stanze_vere: number;
  stanze_trovate: number;
  stanze_in_piu: number;
  /** Scarto medio di superficie sulle stanze abbinate (0.05 = 5%). */
  scarto_area_medio: number | null;
  stanze_fuori_tolleranza: number;
  porte: { vere: number; trovate: number } | null;
  finestre: { vere: number; trovate: number } | null;
  scala_confermata_da_utente: boolean;
  correzioni: number;
  corretta: boolean;
  dettaglio: Array<{ vera: string; generata: string | null; area_vera: number | null; area_generata: number | null; scarto: number | null }>;
}

export const MASSIMO_CORREZIONI = 5;

export function tolleranzaArea(ingresso: CampioneVerita["ingresso"]): number {
  return ingresso === "descrizione" ? 0.2 : 0.1;
}

export function punteggio(v: CampioneVerita, p: Planimetria | null, scalaConfermata = false): Punteggio {
  const vuoto: Punteggio = {
    id: v.id, generata: false, stanze_vere: v.locali.length, stanze_trovate: 0, stanze_in_piu: 0,
    scarto_area_medio: null, stanze_fuori_tolleranza: 0, porte: null, finestre: null,
    scala_confermata_da_utente: false, correzioni: Infinity, corretta: false, dettaglio: [],
  };
  if (!p) return vuoto;
  const gen = p.livelli.flatMap((l) => l.locali).map((l) => ({ nome: l.nome, destinazione: l.destinazione as string, mq: area(l.contorno) / 10_000 }));
  const tol = tolleranzaArea(v.ingresso);

  // Abbinamento goloso: prima stessa destinazione e superficie vicina.
  const coppie: Array<{ i: number; j: number; costo: number }> = [];
  v.locali.forEach((lv, i) => gen.forEach((lg, j) => {
    const stessa = lv.destinazione === lg.destinazione;
    const rapporto = lv.area_mq ? Math.abs(Math.log(lg.mq / lv.area_mq)) : 0.3;
    if (!stessa && rapporto > 0.4) return;
    coppie.push({ i, j, costo: (stessa ? 0 : 1) + rapporto });
  }));
  coppie.sort((a, b) => a.costo - b.costo);
  const presaV = new Set<number>();
  const presaG = new Set<number>();
  const abbinate: Array<{ i: number; j: number }> = [];
  for (const c of coppie) {
    if (presaV.has(c.i) || presaG.has(c.j)) continue;
    presaV.add(c.i);
    presaG.add(c.j);
    abbinate.push(c);
  }
  const dettaglio = v.locali.map((lv, i) => {
    const ab = abbinate.find((a) => a.i === i);
    const lg = ab ? gen[ab.j] : null;
    const scarto = lg && lv.area_mq ? Math.abs(lg.mq - lv.area_mq) / lv.area_mq : null;
    return { vera: lv.nome ?? lv.destinazione, generata: lg?.nome ?? null, area_vera: lv.area_mq, area_generata: lg ? Math.round(lg.mq * 100) / 100 : null, scarto: scarto === null ? null : Math.round(scarto * 1000) / 1000 };
  });
  const scarti = dettaglio.map((d) => d.scarto).filter((s): s is number => s !== null);
  const fuori = scarti.filter((s) => s > tol).length;

  const conta = (tipi: string[], elenco: Array<{ tipo: string }>) => elenco.filter((a) => tipi.includes(a.tipo)).length;
  const apGen = p.livelli.flatMap((l) => l.aperture);
  const porte = v.aperture ? { vere: conta(["porta"], v.aperture), trovate: conta(["porta"], apGen) } : null;
  const finestre = v.aperture ? { vere: conta(["finestra", "portafinestra"], v.aperture), trovate: conta(["finestra", "portafinestra"], apGen) } : null;

  const mancanti = v.locali.length - abbinate.length;
  const inPiu = gen.length - abbinate.length;
  const correzioni = mancanti + inPiu + fuori
    + (porte ? Math.abs(porte.vere - porte.trovate) : 0)
    + (finestre ? Math.abs(finestre.vere - finestre.trovate) : 0)
    + (scalaConfermata ? 1 : 0);
  return {
    id: v.id,
    generata: true,
    stanze_vere: v.locali.length,
    stanze_trovate: abbinate.length,
    stanze_in_piu: inPiu,
    scarto_area_medio: scarti.length ? Math.round((scarti.reduce((a, b) => a + b, 0) / scarti.length) * 1000) / 1000 : null,
    stanze_fuori_tolleranza: fuori,
    porte,
    finestre,
    scala_confermata_da_utente: scalaConfermata,
    correzioni,
    corretta: correzioni <= MASSIMO_CORREZIONI,
    dettaglio,
  };
}
