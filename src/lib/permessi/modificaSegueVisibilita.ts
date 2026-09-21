import type { Permissions } from "@/hooks/usePermissions";

/**
 * «La modifica segue la visibilità»: la stessa regola delle 8 aree operative
 * (16/09/2026) e di email/automazioni (21/09/2026, migration 20280921153700),
 * estesa lo stesso giorno a costi, budget e tesoreria (migration
 * 20280921220000) — prima erano sola lettura per lo staff, decisione letta
 * nel codice esistente e non richiesta da Florin.
 *
 * Chi ha il permesso di VISTA su un'area, e non è in «Sola lettura», può
 * anche scriverci: non serve un permesso di modifica separato. Un posto
 * solo per la formula, così la pagina e il test statico non possono
 * divergere dalla regola scritta nel database.
 */

/** Costi, budget per categoria, categorie costi: segue `can_view_costs`. */
export function puoModificareCosti(p: Pick<Permissions, "isAdmin" | "canViewCosts" | "solaLettura">): boolean {
  return p.isAdmin || (p.canViewCosts && !p.solaLettura);
}

/** Tesoreria: segue `can_view_tesoreria`. */
export function puoModificareTesoreria(p: Pick<Permissions, "isAdmin" | "canViewTesoreria" | "solaLettura">): boolean {
  return p.isAdmin || (p.canViewTesoreria && !p.solaLettura);
}
