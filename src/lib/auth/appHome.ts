import { CAMPO_APP_ROLES, CAMPO_ROLES, type AppRole } from "@/types/auth";

export const COMPANY_APP_HOME = "/azienda/attivita";

const PLATFORM_HOME = "/admin";

const ROLE_HOME_PATHS: Record<AppRole, string> = {
  super_admin: PLATFORM_HOME,
  company_admin: COMPANY_APP_HOME,
  company_staff: COMPANY_APP_HOME,
  call_center: COMPANY_APP_HOME,
  multi_company_user: COMPANY_APP_HOME,
  produttore_admin: "/produttore",
  customer: "/cliente",
  employee: "/campo",
  subcontractor: "/campo",
  // 13/7/2026: portale /venditore eliminato — il venditore usa l'app azienda
  // normale con la sidebar filtrata dai suoi permessi (come ogni staff).
  salesperson: COMPANY_APP_HOME,
  referrer: "/partner",
  accountant: "/commercialista",
  platform_manager: PLATFORM_HOME,
  platform_sales: PLATFORM_HOME,
  platform_support: PLATFORM_HOME,
  platform_marketing: PLATFORM_HOME,
  platform_implementation: PLATFORM_HOME,
  // Atterra dove lavora: la dashboard con le statistiche non è per lui.
  platform_callcenter: "/admin/marketing/opportunita",
};

export function getRoleHomePath(role: AppRole | null | undefined): string {
  return role ? ROLE_HOME_PATHS[role] ?? "/login" : "/login";
}

/**
 * Dove mandare chi ha una sessione valida e arriva dall'app Lavori (23/11/2026).
 *
 * L'ingresso «nudo» su lavori.ediliziaincloud.com è degli operai e dei
 * subappaltatori: loro lì ci lavorano. Lo staff d'ufficio e il titolare devono
 * proseguire verso il gestionale come sempre — dal 22/11 finivano nell'area
 * campo trattati come tecnici (una sola voce «Cantieri», Esci al posto delle
 * impostazioni) e, non essendo capocantiere di nessuna commessa, su una pagina
 * vuota senza uscita.
 *
 * Con una meta esplicita (`/campo/...`, per esempio il link di una notifica o
 * la pagina chiesta prima del login) ci va anche il capocantiere: lì la scheda
 * del cantiere l'ha chiesta lui.
 *
 * `null` = non è roba dell'area campo, decide il dispatch normale.
 */
export function destinazioneAppLavori(
  { ruolo, meta, sottodominio }: { ruolo: AppRole | null | undefined; meta?: string; sottodominio: string },
): string | null {
  if (!ruolo) return null;
  if (meta) return CAMPO_APP_ROLES.includes(ruolo) ? meta : null;
  if (sottodominio !== "lavori") return null;
  return (CAMPO_ROLES as AppRole[]).includes(ruolo) ? "/campo" : null;
}
