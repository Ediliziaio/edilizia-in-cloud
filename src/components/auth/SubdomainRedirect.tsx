/**
 * SubdomainRedirect — enforces subdomain-based routing.
 *
 * Mounted at the root "/" route. Reads the subdomain and redirects
 * to the appropriate section instead of the generic RoleBasedRedirect.
 *
 * For "www" — always lands on the marketing home page.
 * For "admin" — goes to admin login or admin dashboard.
 * For "clienti" — goes to customer portal.
 * For "app" / default — falls through to RoleBasedRedirect as usual.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";

export function SubdomainRedirect() {
  const { subdomain, defaultPath } = useSubdomainRoute();
  const navigate = useNavigate();

  useEffect(() => {
    if (subdomain === "www") {
      // Always show landing page on www.
      navigate("/home", { replace: true });
    }
    // admin, clienti, app/other — let RoleBasedRedirect handle it
    // (it already routes based on the authenticated user's role)
  }, [subdomain, navigate, defaultPath]);

  // For www we navigate away immediately; for all others use the existing
  // role-based redirect logic which works fine for admin, clienti etc.
  if (subdomain === "www") {
    return null;
  }

  return <RoleBasedRedirect />;
}
