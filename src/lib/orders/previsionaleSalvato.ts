import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { AmbitoLavoro } from "./previsionaleLavoro";
import { plannedLaborCost } from "./laborEconomics";
import type { GiornoLavorativo } from "./sottofasi";

export type TipoAmbitoPrevisto = "fase" | "sottofase" | "voce";
export interface DestinazionePrevisto {
  tipo: TipoAmbitoPrevisto;
  id: string;
  faseId: string;
}
export const chiavePrevisto = ({ tipo, id }: DestinazionePrevisto) => `${tipo}:${id}`;

export function destinazionePrevisto(ambito: AmbitoLavoro): DestinazionePrevisto | null {
  if (!ambito.faseId) return null;
  if (ambito.sottofaseId) return { tipo: "sottofase", id: ambito.sottofaseId, faseId: ambito.faseId };
  if (ambito.voceId) return { tipo: "voce", id: ambito.voceId, faseId: ambito.faseId };
  return { tipo: "fase", id: ambito.faseId, faseId: ambito.faseId };
}

export interface OperaioPrevisto { id: string; nome: string; tariffa: number | null }
export interface SquadraPrevista { id: string; nome: string; componenti: string[] }
export interface BozzaPrevisto {
  ambiti: DestinazionePrevisto[];
  persone: string[];
  squadre: string[];
  dal: string;
  al: string;
  oreGiorno: number;
  microOrePerAmbito?: number[];
  sabato: boolean;
}
export interface PianoPrevisto {
  ambito: DestinazionePrevisto;
  persone: string[];
  squadre: SquadraPrevista[];
  operai: OperaioPrevisto[];
  dal: string;
  al: string;
  giorni: string[];
  oreGiorno: number;
  microOreGiorno: number;
  sabato: boolean;
}
export interface ArchivioPrevisto { versione: number; piani: PianoPrevisto[] }

export function dateLavorative(dal: string, al: string, lavorativo: GiornoLavorativo) {
  return eachDayOfInterval({ start: parseISO(dal), end: parseISO(al) })
    .map((giorno) => format(giorno, "yyyy-MM-dd")).filter(lavorativo);
}

export interface TotalePrevistoSalvato { ore: number; costo: number; incompleto: boolean }

interface QuotaGiorno {
  chiave: string;
  dipendente: OperaioPrevisto;
  ore: number;
}

/**
 * Una previsione di fase include quella delle sue voci per persona e giorno.
 * Le ore delle voci sono attribuite alle voci stesse, e alla fase resta
 * soltanto l'eventuale differenza. Membro di più squadre: una sola persona.
 */
export function riepilogaPrevisioni(piani: readonly PianoPrevisto[]) {
  const fasi = new Map<string, TotalePrevistoSalvato & { orePerPersona: Map<string, number> }>();
  const ambiti = new Map<string, TotalePrevistoSalvato>();
  const gruppi = new Map<string, { faseId: string; fase?: QuotaGiorno; voci: QuotaGiorno[] }>();
  for (const p of piani) {
    const chiave = chiavePrevisto(p.ambito);
    for (const dipendente of p.operai) {
      for (const giorno of p.giorni) {
        const id = `${p.ambito.faseId}/${dipendente.id}/${giorno}`;
        const gruppo = gruppi.get(id) ?? { faseId: p.ambito.faseId, voci: [] };
        const quota = { chiave, dipendente, ore: p.microOreGiorno };
        if (p.ambito.tipo === "fase") gruppo.fase = quota;
        else gruppo.voci.push(quota);
        gruppi.set(id, gruppo);
      }
    }
  }
  // Accumula ore per persona prima di arrotondare al centesimo.
  const quote = new Map<string, QuotaGiorno & { faseId: string }>();
  for (const { faseId, fase, voci } of gruppi.values()) {
    const vociTotali = voci.reduce((totale, voce) => totale + voce.ore, 0);
    for (const riga of [...voci, ...(fase ? [{ ...fase, ore: Math.max(0, fase.ore - vociTotali) }] : [])]) {
      if (!riga.ore) continue;
      const id = `${riga.chiave}/${riga.dipendente.id}`;
      const precedente = quote.get(id);
      quote.set(id, { ...riga, faseId, ore: (precedente?.ore ?? 0) + riga.ore });
    }
  }
  for (const { chiave, faseId, dipendente, ore } of quote.values()) {
    const costo = plannedLaborCost(ore / 1e6, dipendente.tariffa);
    const totaleFase = fasi.get(faseId) ?? { ore: 0, costo: 0, incompleto: false, orePerPersona: new Map<string, number>() };
    const totaleAmbito = ambiti.get(chiave) ?? { ore: 0, costo: 0, incompleto: false };
    for (const totale of [totaleFase, totaleAmbito]) {
      totale.ore += ore;
      totale.costo += Math.round((costo ?? 0) * 100);
      totale.incompleto ||= costo == null;
    }
    totaleFase.orePerPersona.set(dipendente.id, (totaleFase.orePerPersona.get(dipendente.id) ?? 0) + ore / 1e6);
    fasi.set(faseId, totaleFase);
    ambiti.set(chiave, totaleAmbito);
  }
  for (const totale of [...fasi.values(), ...ambiti.values()]) {
    totale.ore /= 1e6;
    totale.costo /= 100;
  }
  return { fasi, ambiti };
}

export function ripartisciMicroOre(ore: number, destinazioni: number): number[] {
  const totale = Math.round(ore * 1e6);
  return Array.from({ length: destinazioni }, (_, i) => Math.floor(totale / destinazioni) + Number(i < totale % destinazioni));
}

export function validaRipartizione(microOre: number[], oreGiorno: number, destinazioni: number): boolean {
  return microOre.length === destinazioni && microOre.every((n) => Number.isSafeInteger(n) && n > 0)
    && microOre.reduce((totale, n) => totale + n, 0) === Math.round(oreGiorno * 1e6);
}
