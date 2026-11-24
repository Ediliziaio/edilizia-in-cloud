/**
 * Una regola sola per «chi può fare il sopralluogo», in tutte le liste dove si sceglie il tecnico
 * (appuntamento di sopralluogo, «Pianifica», «Assegna sopralluogo»).
 *
 * Prima ogni lista aveva la sua: tutto lo staff, solo gli operai, o tutte le persone dell'azienda
 * compresi i clienti. Ora: in cima chi ha l'area «Tecnico» in Utenti e permessi, poi operai e
 * subappaltatori, poi il resto dello staff. I clienti non ci sono mai: le persone arrivano da
 * `useCompanyStaffUsers`, che li esclude.
 */
export type GruppoTecnico = "tecnici" | "operai" | "altri";

export const ETICHETTA_GRUPPO: Record<GruppoTecnico, string> = {
  tecnici: "Tecnici",
  operai: "Operai e subappaltatori",
  altri: "Altro personale",
};

export interface PersonaStaff {
  id: string;
  roles?: readonly string[] | null;
}

const OPERAI = new Set(["employee", "worker", "subcontractor"]);

export function gruppoTecnico(p: PersonaStaff, tecnici: ReadonlySet<string>): GruppoTecnico {
  if (tecnici.has(p.id)) return "tecnici";
  if (p.roles?.some((r) => OPERAI.has(r))) return "operai";
  return "altri";
}

/** Nell'ordine dei gruppi; dentro il gruppo l'ordine di partenza (alfabetico dallo staff). */
export function gruppiTecnici<T extends PersonaStaff>(persone: T[], tecnici: ReadonlySet<string>): Array<{ gruppo: GruppoTecnico; persone: T[] }> {
  const ordine: GruppoTecnico[] = ["tecnici", "operai", "altri"];
  return ordine
    .map((gruppo) => ({ gruppo, persone: persone.filter((p) => gruppoTecnico(p, tecnici) === gruppo) }))
    .filter((g) => g.persone.length > 0);
}

export const ordinaPerTecnico = <T extends PersonaStaff>(persone: T[], tecnici: ReadonlySet<string>): T[] =>
  gruppiTecnici(persone, tecnici).flatMap((g) => g.persone);
