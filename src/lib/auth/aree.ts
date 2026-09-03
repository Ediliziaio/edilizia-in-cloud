// ============================================================================
// aree — gestionale e campo sullo stesso account
// ============================================================================
// La stessa persona può portare due cappelli: al mattino scarica il camion e
// compila il rapportino (area CAMPO), al pomeriggio gestisce magazzino e
// commesse dall'ufficio (area GESTIONALE). In `user_roles` i due ruoli
// convivono già, ma l'app li schiacciava in UNO solo — e siccome `employee`
// sta sopra `company_staff` nella classifica, quella persona restava chiusa
// nel portale lavoratori senza poter entrare nel gestionale.
//
// Qui l'area diventa esplicita e si deduce dall'URL: sotto /campo si è operai,
// altrove si è ufficio. Il ruolo effettivo viene calcolato SOLO fra i ruoli di
// quell'area, così nel gestionale i permessi da staff valgono davvero.
//
// Chi ha un'area sola non si accorge di niente: la lista dei suoi ruoli per
// quell'area coincide con tutti i suoi ruoli.
//
// Modulo puro: nessun React, nessun router, nessun Supabase.
// ============================================================================
import type { AppRole } from "@/types/auth";
import { computeEffectiveRole } from "@/lib/roleHierarchy";

export type AppArea = "gestionale" | "campo";

/** Ruoli che vivono nel portale lavoratori. */
export const RUOLI_CAMPO: AppRole[] = ["employee", "subcontractor"];

/**
 * Ruoli che aprono il gestionale d'azienda. Non ci sono i ruoli di
 * piattaforma/portali terzi (admin, cliente, commercialista, partner): quelli
 * hanno casa loro e non c'entrano con lo switch.
 */
export const RUOLI_GESTIONALE: AppRole[] = [
  "company_admin",
  "company_staff",
  "salesperson",
  "call_center",
  "multi_company_user",
];

/** L'area a cui appartiene un percorso dell'app. */
export function areaDaPercorso(pathname: string | null | undefined): AppArea {
  const p = pathname ?? "";
  return p === "/campo" || p.startsWith("/campo/") ? "campo" : "gestionale";
}

/** Le aree in cui l'utente può davvero entrare, in base ai ruoli che ha. */
export function areeDisponibili(userRoles: AppRole[] | null | undefined): AppArea[] {
  const roles = userRoles ?? [];
  const aree: AppArea[] = [];
  if (roles.some((r) => RUOLI_GESTIONALE.includes(r))) aree.push("gestionale");
  if (roles.some((r) => RUOLI_CAMPO.includes(r))) aree.push("campo");
  return aree;
}

/** Vero se la persona porta entrambi i cappelli: solo a lei serve lo switch. */
export function haEntrambeLeAree(userRoles: AppRole[] | null | undefined): boolean {
  return areeDisponibili(userRoles).length === 2;
}

/**
 * I ruoli dell'utente ristretti a un'area. Se in quell'area non ne ha nessuno
 * si restituiscono TUTTI i suoi ruoli: meglio farlo risolvere col suo ruolo
 * vero (e lasciare che il guard lo rimandi a casa sua) che con `null`, che
 * lo butterebbe fuori come se non fosse autenticato.
 */
export function ruoliDellArea(userRoles: AppRole[] | null | undefined, area: AppArea): AppRole[] {
  const roles = userRoles ?? [];
  const ammessi = area === "campo" ? RUOLI_CAMPO : RUOLI_GESTIONALE;
  const filtrati = roles.filter((r) => ammessi.includes(r));
  return filtrati.length > 0 ? filtrati : roles;
}

/**
 * Il ruolo che comanda l'interfaccia, calcolato dentro l'area corrente.
 * È questo che permette a un magazziniere-operaio di avere i permessi da staff
 * quando sta in ufficio e quelli da operaio quando sta in cantiere.
 */
export function ruoloEffettivoPerArea(
  userRoles: AppRole[] | null | undefined,
  area: AppArea,
): AppRole | null {
  return computeEffectiveRole(ruoliDellArea(userRoles, area));
}

/**
 * Dove atterra chi ha entrambe le aree: nel GESTIONALE (scelta dell'utente,
 * 2026-09-03). Chi ha una sola area atterra nella sua.
 */
export function areaIniziale(userRoles: AppRole[] | null | undefined): AppArea {
  const aree = areeDisponibili(userRoles);
  if (aree.includes("gestionale")) return "gestionale";
  if (aree.includes("campo")) return "campo";
  return "gestionale";
}
