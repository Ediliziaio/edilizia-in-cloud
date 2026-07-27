import type { AppRole } from "@/types/auth";

/**
 * Classifica dei ruoli: `effectiveRole` è il PRIMO della lista che l'utente
 * possiede. Un utente può avere più righe in `user_roles`, e questa lista
 * decide quale comanda l'interfaccia.
 *
 * ══ REGOLA ══
 * Chi AMMINISTRA viene prima di chi OPERA. Un titolare che vende in prima
 * persona ha sia `company_admin` sia `salesperson`: deve restare admin.
 *
 * Il caso reale che ha imposto questa regola: `salesperson` stava sopra
 * `company_admin`, quindi l'amministratrice di un'azienda cliente veniva
 * risolta come venditrice. Non avendo riga in `staff_permissions`, ogni
 * permesso staff risultava `false` e le sparivano sidebar e impostazioni.
 * Il database era innocente: `has_permission` e `has_permission_for_company`
 * concedono già tutto al `company_admin`. Il declassamento era solo qui.
 *
 * Il ruolo operativo NON viene rimosso da `user_roles`: continua a valere per
 * le liste di assegnazione (un titolare-venditore resta assegnatario di
 * opportunità e appuntamenti). Cambia solo quale ruolo guida la navigazione.
 *
 * Questa lista è l'UNICA fonte: prima era duplicata fra AuthContext e i test,
 * e le due copie erano già divergenti (nei test mancava `accountant`).
 * Chi aggiunge un ruolo a `AppRole` lo aggiunga anche qui: un ruolo assente
 * vince solo se è l'unico posseduto, altrimenti perde da qualunque altro.
 */
export const ROLE_PRIORITY: AppRole[] = [
  // Piattaforma
  "super_admin",
  "platform_manager",
  "platform_sales",
  "platform_support",
  "platform_marketing",
  "platform_implementation",
  "multi_company_user",

  // Amministrativi d'azienda — prima degli operativi, sempre
  "produttore_admin",
  "company_admin",

  // Professionali / esterni
  "accountant",
  "referrer",

  // Operativi
  "salesperson",
  "call_center",
  "employee",       // operaio: employee + company_staff → effective = employee
  "subcontractor",  // subappaltatore: subcontractor + company_staff → effective = subcontractor
  "company_staff",  // dipendente ufficio: solo company_staff → effective = company_staff

  "customer",
];

/**
 * Ruolo effettivo a partire dai ruoli grezzi del database.
 * Il fallback su `userRoles[0]` copre i ruoli non ancora inseriti in
 * ROLE_PRIORITY: meglio un ruolo che nessuno.
 */
export function computeEffectiveRole(userRoles: AppRole[]): AppRole | null {
  return ROLE_PRIORITY.find((r) => userRoles.includes(r)) || userRoles[0] || null;
}
