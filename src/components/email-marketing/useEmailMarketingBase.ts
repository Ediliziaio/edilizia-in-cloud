import { useLocation } from "react-router-dom";

/**
 * Base path context-aware per l'email marketing.
 *
 * La stessa pagina/componenti vengono montati sia su /azienda/marketing/email
 * sia su /admin/marketing/email (via PlatformCompanyProvider). I navigate
 * hardcodati su /azienda/... buttavano il super_admin fuori dal contesto admin
 * (route editor/builder admin dedicate ignorate, layout e permessi sbagliati).
 */
export function useEmailMarketingBase(): string {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin") ? "/admin/marketing/email" : "/azienda/marketing/email";
}
