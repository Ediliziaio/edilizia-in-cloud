/**
 * permessi.ts — MP-SILVIO-01 · logica pura di autorizzazione dell'agente
 *
 * Specchio TS della funzione DB silvio_puo_eseguire: la risoluzione autorevole
 * sta nel DB (SECURITY DEFINER), qui la rispecchiamo per i test e per la UI.
 * Regola ferrea: denaro/esterno/irreversibile ⇒ MAI autonoma. L'override può
 * SOLO restringere. Nessun I/O.
 */

export type Autorizzazione = "autonoma" | "conferma" | "vietata";
export type Reversibilita = "reversibile" | "difficile" | "irreversibile";
export type CategoriaRischio = "interno" | "esterno" | "denaro";

const RANK: Record<Autorizzazione, number> = { autonoma: 0, conferma: 1, vietata: 2 };
const BY_RANK: Autorizzazione[] = ["autonoma", "conferma", "vietata"];

export interface AzioneDef {
  autorizzazione: Autorizzazione; // default del catalogo
  categoriaRischio: CategoriaRischio;
  reversibilita: Reversibilita;
  ruoliConsentiti: string[];
  attiva: boolean;
}

export interface ContestoUtente {
  override?: { autorizzazione?: Autorizzazione | null; attiva?: boolean | null; ruoliConsentiti?: string[] | null } | null;
  ruoliUtente: string[]; // app_role che l'utente possiede per l'azienda
  isSuper?: boolean;
}

/** True se denaro/esterno/irreversibile: non può mai essere autonoma. */
export function richiedeSempreConferma(a: Pick<AzioneDef, "categoriaRischio" | "reversibilita">): boolean {
  return a.categoriaRischio === "denaro" || a.categoriaRischio === "esterno" || a.reversibilita === "irreversibile";
}

/** Un override è valido solo se NON allarga (più restrittivo o uguale al default). */
export function overrideValido(defaultAut: Autorizzazione, nuovoAut: Autorizzazione): boolean {
  return RANK[nuovoAut] >= RANK[defaultAut];
}

/** Autorizzazione effettiva combinando default + override + ruolo + regola ferrea. */
export function risolviAutorizzazione(a: AzioneDef, ctx: ContestoUtente): Autorizzazione {
  if (!a.attiva) return "vietata";
  if (ctx.override?.attiva === false) return "vietata";

  const ruoli = ctx.override?.ruoliConsentiti ?? a.ruoliConsentiti;

  let rank = RANK[a.autorizzazione];
  if (ctx.override?.autorizzazione) rank = Math.max(rank, RANK[ctx.override.autorizzazione]); // override solo restringe

  if (richiedeSempreConferma(a)) rank = Math.max(rank, RANK.conferma); // regola ferrea

  if (!ctx.isSuper) {
    const ok = (ruoli ?? []).some((r) => ctx.ruoliUtente.includes(r));
    if (!ok) return "vietata";
  }

  return BY_RANK[rank];
}

export function etichettaAutorizzazione(a: string | null | undefined): string {
  switch (a) {
    case "autonoma": return "Da solo";
    case "conferma": return "Con conferma";
    case "vietata": return "Non consentito";
    default: return "—";
  }
}

export function etichettaRischio(r: string | null | undefined): string {
  switch (r) {
    case "interno": return "Interno";
    case "esterno": return "Verso l'esterno";
    case "denaro": return "Denaro";
    default: return r ?? "—";
  }
}
