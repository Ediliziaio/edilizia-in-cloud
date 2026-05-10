/**
 * SubdomainRedirect — enforces subdomain-based routing.
 *
 * Mounted at the root "/" route. Reads the subdomain e:
 *  - se utente loggato → SEMPRE RoleBasedRedirect (manda a /azienda, /admin, ...)
 *    Senza questo, sui domain "www"/bare/localhost l'utente loggato vedeva
 *    la landing per ~500ms prima del redirect (FOUC), bug UX.
 *  - se utente NON loggato + bare/www/localhost → landing
 *  - altri subdomain (admin, clienti, app) → RoleBasedRedirect (gestisce login)
 *
 * Auth-aware: aspetta che AuthContext.isLoading=false prima di renderizzare,
 * così evitiamo entrambi i flash:
 *   (a) loggato che vede landing per ms
 *   (b) anonymous che vede spinner per ms quando potrebbe vedere landing subito
 */

import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { useAuth } from "@/contexts/AuthContext";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";

const Home = lazy(() => import("@/pages/Home"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Sync check: c'è un Supabase session token persisted in localStorage?
 * Usato per decidere se vale la pena attendere il check auth (mostrando spinner)
 * o se possiamo skippare al rendering immediato (visitor anonimo).
 *
 * Non valida il token (potrebbe essere scaduto/revocato): è solo un'euristica
 * per evitare:
 *   - flash della landing su utente loggato (bug fix principale)
 *   - spinner inutile su visitor anonimo che vuole vedere la landing subito
 */
function hasPersistedSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("sb-") && k.includes("auth-token")) {
        const v = localStorage.getItem(k);
        if (v && v.length > 50) return true;
      }
    }
  } catch {
    // localStorage bloccato (private mode, quota): assumiamo no session
  }
  return false;
}

export function SubdomainRedirect() {
  const { subdomain } = useSubdomainRoute();
  const { user, isLoading } = useAuth();

  // 🆕 BUG FIX (2026-05-10): aspetta il check auth SOLO se c'è davvero una
  // sessione persisted. Senza questa guard, sui domini bare/www/localhost
  // mostravamo Home prima ancora di sapere se l'utente era loggato → flash
  // della landing per ~500ms post-login, percepito come "refresh strano".
  // Se NON c'è sessione persisted (visitor anonimo), salto lo spinner e
  // mostro subito la landing senza penalizzare la perceived performance.
  if (isLoading && hasPersistedSupabaseSession()) {
    return <PageLoader />;
  }

  // 🆕 Se utente loggato: sempre RoleBasedRedirect (manda alla sezione
  // corretta in base al ruolo: /azienda, /admin, /campo, /cliente, ecc.)
  // Vale ANCHE su www/bare/localhost per evitare flash della landing.
  if (user) {
    return <RoleBasedRedirect />;
  }

  // www.ediliziaincloud.com, bare domain, localhost senza auth → mostra landing
  if (subdomain === "www" || subdomain === "" || subdomain === "localhost") {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Home />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // admin, clienti, app, other — role-based routing handles login redirect
  return <RoleBasedRedirect />;
}
