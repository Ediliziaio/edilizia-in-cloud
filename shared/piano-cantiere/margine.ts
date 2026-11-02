/**
 * Il margine previsto (2/11/2026). Per ogni tipo di costo vale il più alto fra previsto e già
 * registrato, così un costo non si conta due volte. Se manca un costo non si dà una cifra che
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
  dati: { ricavi: number; registrati: CostiRegistrati; ditte: readonly { nome: string; costo: number | null }[] },
): MarginePrevisto {
  const mancano: string[] = [];
  const oreInterne = piano.fasi.filter((f) => !f.ditta).reduce((t, f) => t + f.ore, 0);
  const manodoperaResidua = oreInterne * ip.costoOrario;
  const materialiPrevisti = voci.reduce((t, v) => t + (Number(v.costo_materiali) || 0) * (Number(v.quantita) || 0), 0);
  if (materialiPrevisti <= 0 && dati.registrati.materiali <= 0) mancano.push("il costo dei materiali");
  if (piano.vociSenzaDato) mancano.push(`la manodopera di ${piano.vociSenzaDato} ${piano.vociSenzaDato === 1 ? "voce" : "voci"}`);
  const ditteSenzaCosto = dati.ditte.filter((d) => !(Number(d.costo) > 0));
  for (const d of ditteSenzaCosto) mancano.push(`il costo della ditta ${d.nome}`);
  const dittePreviste = dati.ditte.reduce((t, d) => t + (Number(d.costo) || 0), 0);
  // Le ore residue si aggiungono a quelle già pagate; gli altri costi sono totali di commessa.
  const costi = {
    manodopera: tondo(dati.registrati.manodopera + manodoperaResidua),
    materiali: tondo(Math.max(materialiPrevisti, dati.registrati.materiali)),
    ditte: tondo(Math.max(dittePreviste, dati.registrati.ditte)),
    altri: tondo(dati.registrati.altri),
  };
  const massimo = tondo(dati.ricavi - costi.manodopera - costi.materiali - costi.ditte - costi.altri);
  const completo = mancano.length === 0;
  return {
    ricavi: tondo(dati.ricavi), costi, margine: completo ? massimo : null, margineMassimo: massimo,
    percentuale: completo && dati.ricavi > 0 ? Math.round(massimo / dati.ricavi * 1000) / 10 : null,
    completo, mancano,
  };
}
