/**
 * Il ruolo con cui Silvio tratta un utente.
 *
 * I ruoli sono un INSIEME (user_roles): «impiegato + anche venditore» ha due
 * righe. Silvio ne usa uno solo, il più alto in questa scala, e da quello
 * dipendono gli strumenti che può usare (allowedRoles nel registry) e il
 * perimetro scritto nel prompt. La chat e il brief del mattino leggono la
 * stessa scala: se divergessero, il brief mostrerebbe ciò che la chat nega.
 *
 * Allineata alla matrice del preambolo costituzionale v3. accountant mancava:
 * un commercialista cadeva nel fallback "Accesso limitato". Ci sono anche i
 * ruoli esterni, per coerenza.
 */
export const PRIORITA_RUOLI_SILVIO = [
  "super_admin",
  "company_admin",
  "accountant",
  "salesperson",
  "call_center",
  "company_staff",
  "employee",
  "subcontractor",
  "worker",
  "customer",
  "referrer",
  "produttore_admin",
];

/**
 * Il ruolo più alto dell'utente. Un ruolo fuori scala vale per quello che è;
 * senza ruoli la chat ha sempre ripiegato su company_staff (chi chiama il
 * brief tratta a parte l'utente senza ruoli).
 */
export function ruoloPrincipaleSilvio(ruoli: readonly string[]): string {
  return PRIORITA_RUOLI_SILVIO.find((r) => ruoli.includes(r)) ?? ruoli[0] ?? "company_staff";
}

/**
 * I ruoli a cui l'app dà i permessi della riga staff_permissions (usePermissions):
 * per loro Silvio applica gli stessi permessi, per area e sulle righe. Prima li
 * applicava solo a company_staff, e il venditore (che nella scala sta sopra)
 * leggeva da Silvio tutte le commesse anche senza il permesso (25/09/2026).
 */
export const RUOLI_CON_PERMESSI_STAFF: readonly string[] = [
  "company_staff",
  "salesperson",
  "call_center",
  "employee",
  "subcontractor",
];

export function usaPermessiStaff(ruolo: string): boolean {
  return RUOLI_CON_PERMESSI_STAFF.includes(ruolo);
}
