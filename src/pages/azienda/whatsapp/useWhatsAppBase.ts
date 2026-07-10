import { useLocation } from "react-router-dom";

/**
 * Base path context-aware per il Centro WhatsApp.
 *
 * Le stesse pagine sono montate su /azienda/whatsapp e su
 * /admin/marketing/whatsapp (via PlatformCompanyProvider). I link hardcodati
 * su /azienda/... buttavano il super_admin fuori dal contesto admin — e le
 * sotto-route (broadcast/nuovo, broadcast/:id, numeri/:id) sotto /admin
 * nemmeno esistevano prima delle route annidate in AdminWhatsApp.
 *
 * isAdminContext pilota anche la variante "solo marketing" dell'hub
 * (niente Regia operativa cantieri / Notifiche ticket nell'area admin).
 */
export function useWhatsAppBase(): { base: string; isAdminContext: boolean } {
  const { pathname } = useLocation();
  const isAdminContext = pathname.startsWith("/admin");
  return {
    base: isAdminContext ? "/admin/marketing/whatsapp" : "/azienda/whatsapp",
    isAdminContext,
  };
}
