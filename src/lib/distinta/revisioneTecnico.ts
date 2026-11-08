/**
 * La revisione del tecnico: prima di validare i materiali di una fase, cosa
 * conviene guardare.
 *
 * Fino al 07/11/2026 il tecnico apriva le fasi in verifica una per una e
 * scorreva tutte le righe: niente gli diceva quali erano state toccate a mano.
 * Qui, per ogni fase in verifica, le righe che non vengono dritte dal calcolo:
 *
 * - quantità cambiata a mano: diversa da quella calcolata dal computo o dalle
 *   tavole (quantita_calcolata) di più dell'1%;
 * - aggiunta a mano: origine «manuale» (le righe senza origine vengono dal
 *   preventivo o sono di prima del 07/11: non si segnalano, sarebbero migliaia);
 * - senza quantità: non si può ordinare. Una fase con righe così non si valida
 *   in blocco: il tecnico la apre e corregge.
 *
 * Le altre righe sono quelle calcolate: si possono validare insieme.
 */
import type { StatoMaterialiFase } from "./statiFase";

export type MotivoRevisione = "quantita_a_mano" | "aggiunta_a_mano" | "senza_quantita";

export const ETICHETTA_MOTIVO: Record<MotivoRevisione, string> = {
  quantita_a_mano: "quantità cambiata a mano",
  aggiunta_a_mano: "aggiunta a mano",
  senza_quantita: "senza quantità",
};

export interface RigaPerRevisione {
  id: string;
  name: string;
  quantity: number;
  unita_misura: string | null;
  quantita_calcolata: number | null;
  origine_materiale: "computo" | "planimetria" | "manuale" | null;
  origini: unknown[] | null;
}

export interface FasePerRevisione {
  id: string | null;
  nome: string;
  validazione: { stato: StatoMaterialiFase } | null;
  materiali: RigaPerRevisione[];
}

export interface DaGuardare {
  riga: RigaPerRevisione;
  motivo: MotivoRevisione;
}

export interface RevisioneFase {
  phaseId: string;
  nome: string;
  totale: number;
  daGuardare: DaGuardare[];
  /** Si valida in blocco solo se tutte le righe hanno una quantità. */
  validabileInBlocco: boolean;
}

/** Perché una riga va guardata, o null se viene dritta dal calcolo. */
export function motivoRevisione(r: RigaPerRevisione): MotivoRevisione | null {
  if (!(Number(r.quantity) > 0)) return "senza_quantita";
  const calcolata = r.quantita_calcolata == null ? null : Number(r.quantita_calcolata);
  if (calcolata != null && calcolata > 0 && Math.abs(Number(r.quantity) - calcolata) / calcolata > 0.01) return "quantita_a_mano";
  if (r.origine_materiale === "manuale" && !(r.origini?.length)) return "aggiunta_a_mano";
  return null;
}

/** Le fasi in verifica, con le righe da guardare per prime. `materiali` sono già solo i materiali. */
export function revisioneTecnico(fasi: FasePerRevisione[]): RevisioneFase[] {
  return fasi
    .filter((f): f is FasePerRevisione & { id: string } => !!f.id && f.validazione?.stato === "da_validare")
    .map((f) => {
      const daGuardare = f.materiali.flatMap((riga) => {
        const motivo = motivoRevisione(riga);
        return motivo ? [{ riga, motivo }] : [];
      });
      return {
        phaseId: f.id,
        nome: f.nome,
        totale: f.materiali.length,
        daGuardare,
        validabileInBlocco: f.materiali.length > 0 && !daGuardare.some((d) => d.motivo === "senza_quantita"),
      };
    });
}

/** «12,5 m² invece di 11,8» per la quantità cambiata a mano. */
export function dettaglioRevisione(d: DaGuardare): string {
  const n = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const u = d.riga.unita_misura?.trim() || "pz";
  if (d.motivo === "quantita_a_mano" && d.riga.quantita_calcolata != null) {
    return `${n(Number(d.riga.quantity))} ${u} invece di ${n(Number(d.riga.quantita_calcolata))} calcolati`;
  }
  if (d.motivo === "senza_quantita") return "manca la quantità";
  return `${n(Number(d.riga.quantity))} ${u}, non dal computo né dalle tavole`;
}
