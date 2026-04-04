/**
 * SubdomainRedirect — enforces subdomain-based routing.
 *
 * Mounted at the root "/" route. Reads the subdomain and renders
 * the appropriate section without a client-side redirect (avoids
 * blank-screen flash on www.ediliziaincloud.com).
 *
 * For "www" / bare domain — renders the Home (landing) page directly.
 * For "admin"             — goes to admin login or admin dashboard.
 * For "clienti"           — goes to customer portal.
 * For "app" / default     — falls through to RoleBasedRedirect.
 */

import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
// Eager import — Home is the first thing www users see; lazy-loading it
// created a second dynamic import reference that caused infinite retry loops
// when the chunk failed to load (React Suspense without ErrorBoundary).
import Home from "@/pages/Home";

export function SubdomainRedirect() {
  const { subdomain } = useSubdomainRoute();

  // www.ediliziaincloud.com or bare ediliziaincloud.com → landing page
  if (subdomain === "www") {
    return <Home />;
  }

  // admin, clienti, app, other — role-based routing handles it
  return <RoleBasedRedirect />;
}
