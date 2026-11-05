/**
 * Il margine previsto (2/11/2026). Per ogni costo vale il più alto fra previsto e già registrato
 * (per la manodopera fase per fase), così un costo non si conta due volte. Se manca un costo non si dà una cifra che
 * sembra certa: si dice «al massimo» e cosa manca.
 */
import type { Ipotesi, PianoCantiere, VoceCantiere } from "./calcolo.ts";

export interface CostiRegistrati { manodopera: number; materiali: number; ditte: number; altri: number }

export interface MarginePrevisto {
  ricavi: number;
  costi: { manodopera: number; materiali: number; ditte: number; altri: number };
  /** Null se mancano dei costi: allora vale `margineMassimo`. */
  margine: number | null;
  margineMassimo: number;
  percentuale: number | null;
  completo: boolean;
  mancano: string[];
}

const tondo = (n: number) => Math.round(n * 100) / 100;

export function marginePrevisto(
  piano: PianoCantiere, voci: readonly VoceCantiere[], ip: Ipotesi,
  dati: {
    ricavi: number; registrati: CostiRegistrati; ditte: readonly { nome: string; costo: number | null }[];
    /** Il costo di manodopera già registrato su ogni fase, per nome. */
    manodoperaPerFase?: ReadonlyMap<string, number>;
    /** Le righe materiali della commessa: se ci sono, valgono più delle voci del preventivo. */
    materialiCommessa?: { costo: number; righe: number; senza_costo: number } | null;
  },
): MarginePrevisto {
  const mancano: string[] = [];
  const perFase = dati.manodoperaPerFase ?? new Map<string, number>();
  const fuoriFase = Math.max(0, dati.registrati.manodopera - [...perFase.values()].reduce((t, c) => t + c, 0));
  // Fase per fase: quanto è fatto vale il più alto fra registrato e previsto. A 0% la percentuale
  // può solo non essere scritta: costo registrato e ore intere sarebbero lo stesso lavoro.
  const costoFasi = (ore: (f: PianoCantiere["fasi"][number]) => number) => piano.fasi.reduce((t, f) => {
    const registrato = perFase.get(f.nome) ?? 0;
    if (f.ditta) return t + registrato;
    const intero = ore(f) * ip.costoOrario;
    if (!f.percentuale) return t + Math.max(intero, registrato);
    return t + Math.max(intero * f.percentuale / 100, registrato) + intero * (1 - f.percentuale / 100);
  }, 0);
  const rapporto = (f: PianoCantiere["fasi"][number], k: number) => (f.ore ? f.oreIntere * k / f.ore : f.oreIntere);
  const manodopera = fuoriFase + costoFasi((f) => f.oreIntere);
  const manodoperaMinima = fuoriFase + costoFasi((f) => rapporto(f, f.oreMin));

  const righe = dati.materialiCommessa;
  const materialiDalleVoci = voci.reduce((t, v) => t + (Number(v.costo_materiali) || 0) * (Number(v.quantita) || 0), 0);
  const materialiPrevisti = Math.max(materialiDalleVoci, Number(righe?.costo) || 0);
  if (righe && righe.righe > 0) {
    if (righe.senza_costo) mancano.push(`il costo di ${righe.senza_costo} ${righe.senza_costo === 1 ? "articolo" : "articoli"} della commessa`);
  } else {
    // Una voce con importo, senza costo dei materiali e senza manodopera scritta: non si sa quanto costa.
    const senzaMateriali = voci.filter((v) => Number(v.importo) > 0 && !(Number(v.costo_materiali) > 0) && !(Number(v.costo_manodopera) > 0)).length;
    if (senzaMateriali) mancano.push(`il costo dei materiali di ${senzaMateriali} ${senzaMateriali === 1 ? "voce" : "voci"}`);
    else if (materialiPrevisti <= 0 && dati.registrati.materiali <= 0) mancano.push("il costo dei materiali");
  }
  if (piano.vociSenzaDato) mancano.push(`la manodopera di ${piano.vociSenzaDato} ${piano.vociSenzaDato === 1 ? "voce" : "voci"}`);
  for (const d of dati.ditte.filter((x) => !(Number(x.costo) > 0))) mancano.push(`il costo della ditta ${d.nome}`);
  const dittePreviste = dati.ditte.reduce((t, d) => t + (Number(d.costo) || 0), 0);
  const costi = {
    manodopera: tondo(manodopera),
    materiali: tondo(Math.max(materialiPrevisti, dati.registrati.materiali)),
    ditte: tondo(Math.max(dittePreviste, dati.registrati.ditte)),
    altri: tondo(dati.registrati.altri),
  };
  const altriCosti = costi.materiali + costi.ditte + costi.altri;
  const previsto = tondo(dati.ricavi - costi.manodopera - altriCosti);
  const completo = mancano.length === 0;
  return {
    ricavi: tondo(dati.ricavi), costi, margine: completo ? previsto : null,
    // «Al massimo» è un tetto vero: con le ore più basse dell'intervallo.
    margineMassimo: tondo(dati.ricavi - manodoperaMinima - altriCosti),
    percentuale: completo && dati.ricavi > 0 ? Math.round(previsto / dati.ricavi * 1000) / 10 : null,
    completo, mancano,
  };
}
