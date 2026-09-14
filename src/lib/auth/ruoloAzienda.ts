/**
 * Chi è l'utente dentro l'azienda, detto in due regole.
 *
 * 1. Quale ruolo mostrare. In fondo alla barra laterale c'era scritto «Admin»
 *    per chiunque: una call center di BeMade si leggeva amministratrice.
 *    Un utente ha spesso più ruoli (company_staff + call_center): si mostra il
 *    più significativo, non il primo che capita.
 *
 * 2. Chi sceglie il settore dell'azienda. È una decisione del titolare o
 *    dell'amministratore: il 14/09 l'app ha mandato una call center di BeMade
 *    sulla pagina «Quale è il tuo settore?» al suo primo accesso, e lei l'ha
 *    salvato.
 */
import type { AppRole } from "@/types/auth";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";

/** Dal più al meno significativo: il primo presente è quello che si mostra. */
const PRIORITA_RUOLI: AppRole[] = [
  "company_admin",
  "salesperson",
  "call_center",
  "employee",
  "subcontractor",
  "company_staff",
];

function ruoliDi(ruolo: AppRole | null | undefined, ruoli: readonly AppRole[] | null | undefined): Set<AppRole> {
  const tutti = new Set<AppRole>(ruoli ?? []);
  if (ruolo) tutti.add(ruolo);
  return tutti;
}

/** Il ruolo da mostrare accanto al nome. */
export function ruoloPrincipale(
  ruolo: AppRole | null | undefined,
  ruoli: readonly AppRole[] | null | undefined,
): AppRole | null {
  const tutti = ruoliDi(ruolo, ruoli);
  return PRIORITA_RUOLI.find((r) => tutti.has(r)) ?? ruolo ?? null;
}

/** L'etichetta in fondo alla barra laterale. */
export function etichettaRuoloAzienda(
  ruolo: AppRole | null | undefined,
  ruoli: readonly AppRole[] | null | undefined,
  opzioni: { isImpersonating?: boolean } = {},
): string {
  if (opzioni.isImpersonating) return "Super Admin";
  const principale = ruoloPrincipale(ruolo, ruoli);
  return principale ? getCompanyAccessRoleLabel(principale) : "Accesso";
}

/**
 * Può scegliere il settore dell'azienda? Solo l'amministratore (il titolare è
 * sempre amministratore). Il super admin che entra in un'azienda non subisce
 * l'onboarding del cliente: quel caso lo esclude già il layout.
 */
export function puoScegliereSettore(
  ruolo: AppRole | null | undefined,
  ruoli: readonly AppRole[] | null | undefined,
): boolean {
  return ruoliDi(ruolo, ruoli).has("company_admin");
}
