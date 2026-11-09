// Una persona su più cantieri: le sue giornate del mese e il controllo della giornata.
import { contaNeiNumeri, nomeCantiere, personeDi, statoDi, type RapportinoRiga } from "@/lib/orders/rapportiniMese";
import type { StatoRapportino } from "@/lib/campo/rapportinoStato";

export interface CantiereDelGiorno { orderId: string; nome: string; ore: number; rapportinoId: string; stato: StatoRapportino }
export interface GiornoPersona { giorno: string; cantieri: CantiereDelGiorno[]; totale: number }

const tondo = (n: number): number => Math.round(n * 100) / 100;
const oreIt = (n: number): string => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;

/** Giorno per giorno, dal più recente: su quali cantieri è stata la persona e quante ore. */
export function giornatePersona(righe: readonly RapportinoRiga[], chiave: string): GiornoPersona[] {
  const giorni = new Map<string, Map<string, CantiereDelGiorno>>();
  for (const r of righe.filter(contaNeiNumeri)) {
    const presente = personeDi(r).filter((p) => p.chiave === chiave);
    if (presente.length === 0) continue;
    const cantieri = giorni.get(r.data_lavoro) ?? new Map<string, CantiereDelGiorno>();
    const voce = cantieri.get(r.order_id) ?? { orderId: r.order_id, nome: nomeCantiere(r), ore: 0, rapportinoId: r.id, stato: statoDi(r) };
    voce.ore = tondo(voce.ore + presente.reduce((t, p) => t + p.ore, 0));
    cantieri.set(r.order_id, voce);
    giorni.set(r.data_lavoro, cantieri);
  }
  return [...giorni.entries()]
    .map(([giorno, cantieri]) => {
      const lista = [...cantieri.values()].sort((a, b) => b.ore - a.ore || a.nome.localeCompare(b.nome, "it"));
      return { giorno, cantieri: lista, totale: tondo(lista.reduce((t, c) => t + c.ore, 0)) };
    })
    .sort((a, b) => b.giorno.localeCompare(a.giorno));
}

/** Le ore scritte a mano: maggiori di zero, fino a 24, al massimo due decimali. Altrimenti null. */
export function oreScritte(testo: string): number | null {
  const pulito = testo.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(pulito)) return null;
  const n = Number(pulito);
  return n > 0 && n <= 24 ? n : null;
}

/** Le ore di una giornata normale: dalle ore settimanali su cinque giorni, 8 se non si sa. */
export function orarioNormale(oreSettimana: number | null | undefined): number {
  return oreSettimana && oreSettimana > 0 ? tondo(oreSettimana / 5) : 8;
}

/** Avvisi sulla giornata: non fermano il salvataggio, salvo oltre le 24 ore. */
export function controlloGiornata(input: { totale: number; normale: number; timbrate: number | null }): { oltre24: boolean; avvisi: string[] } {
  const { totale, normale, timbrate } = input;
  const avvisi: string[] = [];
  const oltre24 = totale > 24;
  if (oltre24) avvisi.push("Una giornata non può superare le 24 ore, sommando tutti i cantieri.");
  else if (totale > normale) avvisi.push(`${oreIt(tondo(totale - normale))} oltre la giornata normale di ${oreIt(normale)}.`);
  if (timbrate != null && Math.abs(totale - timbrate) >= 0.5) avvisi.push(`Ha timbrato ${oreIt(timbrate)}, qui sono ${oreIt(tondo(totale))}.`);
  return { oltre24, avvisi };
}
