import { useLocation } from "react-router-dom";

/**
 * Returns the base route prefix for marketing pages.
 * "/admin/marketing" when inside admin, "/azienda/marketing" otherwise.
 * Use this for navigation links that need to work in both contexts.
 */
export function useMarketingRoutePrefix(): string {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin") ? "/admin/marketing" : "/azienda/marketing";
}

/**
 * Returns true if currently in the admin marketing context.
 */
export function useIsAdminMarketing(): boolean {
  const { pathname } = useLocation();
  return pathname.startsWith("/admin/marketing");
}
