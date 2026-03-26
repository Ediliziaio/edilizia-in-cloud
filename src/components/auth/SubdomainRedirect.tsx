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

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";

// Lazy-load Home so it doesn't bloat the initial bundle for non-www subdomains
const Home = lazy(() => import("@/pages/Home"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function SubdomainRedirect() {
  const { subdomain } = useSubdomainRoute();

  // www.ediliziaincloud.com or bare ediliziaincloud.com → landing page
  if (subdomain === "www") {
    return (
      <Suspense fallback={<PageLoader />}>
        <Home />
      </Suspense>
    );
  }

  // admin, clienti, app, other — role-based routing handles it
  return <RoleBasedRedirect />;
}
