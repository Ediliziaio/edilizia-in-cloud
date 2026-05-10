/**
 * SubdomainRedirect — enforces subdomain-based routing.
 *
 * Mounted at the root "/" route. Decides what to render based on:
 *  1. is auth still bootstrapping?  → FullScreenSpinner (z-50, copre tutto)
 *  2. utente loggato?               → RoleBasedRedirect (manda alla sezione corretta)
 *  3. subdomain è www/bare/localhost? → landing pubblica (Home)
 *  4. qualsiasi altro subdomain (app, admin, clienti, lavori, ecc.) → RoleBasedRedirect
 *
 * 🛠️ BUG FIX v3 (2026-05-10): "vedo la home page del sito prima dell'app"
 *
 *   Cause storiche:
 *   (a) Quando AuthContext segnala isLoading=false ma l'utente è ancora null
 *       (race window post-INITIAL_SESSION), il vecchio guard skippava lo spinner
 *       e il branch "user ? RoleBasedRedirect : Home" mostrava Home per ~100-300ms
 *       prima che l'auth context ricaricasse user dal token persisted.
 *   (b) Lo spinner usava `min-h-screen` ma era dentro un Suspense con fallback
 *       `min-h-[200px]` → sull'app.* il browser vedeva il fallback piccolo +
 *       eventuale Home in fade-in, percepito come "flash della landing".
 *   (c) La condizione di rendering Home era "OR-list inclusiva" (`subdomain ===
 *       "www" || subdomain === "" || subdomain === "localhost"`). Se per qualche
 *       motivo la detection del subdomain ritornava un valore inatteso, default
 *       silente era… NON Home, ma rischio futuro: meglio invertire e rendere Home
 *       solo SE subdomain è esplicitamente www.
 *
 *   Fix v3:
 *   - `FullScreenSpinner` con `fixed inset-0 z-50 bg-background` → copre l'intera
 *     viewport indipendentemente dal fallback Suspense parent. Niente flash possibile.
 *   - `authBootstrapPending = isLoading || (hasSessionToken && !user)` → estende
 *     il guard alla race window: finché c'è un token persisted MA user è ancora
 *     null, mostriamo lo spinner anziché skippare.
 *   - Branch Home invertito: `if (subdomain !== "www") return <RoleBasedRedirect />`
 *     → default safer su tutti i subdomain non-www. Home si renderizza SOLO su
 *     www.ediliziaincloud.com / ediliziaincloud.com / localhost.
 */

import { lazy, Suspense, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useSubdomainRoute } from "@/hooks/useSubdomainRoute";
import { useAuth } from "@/contexts/AuthContext";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";

const Home = lazy(() => import("@/pages/Home"));

/**
 * 🆕 Spinner full-screen "definitivo" — `fixed inset-0 z-50` lo mette sopra
 * qualsiasi contenuto sottostante (incluso il fallback Suspense parent),
 * eliminando ogni flash di Home/landing durante il bootstrap auth.
 */
function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      </div>
    </div>
  );
}

/**
 * Sync check: c'è un Supabase session token persisted in localStorage?
 *
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

  // 🆕 v3: memoizzato per non riallocare scan localStorage su ogni render.
  // Va calcolato una sola volta al mount: una volta che decidiamo "c'era token
  // all'avvio", l'eventuale rimozione successiva (logout) si manifesta tramite
  // user=null + isLoading=false e ricadiamo nel ramo corretto.
  const hasSessionToken = useMemo(() => hasPersistedSupabaseSession(), []);

  // 🆕 v3: guard tighter — copre 2 casi:
  //   (1) AuthContext sta ancora caricando (isLoading=true)
  //   (2) AuthContext ha finito (isLoading=false) MA user è ancora null e
  //       sappiamo che esiste un token persisted → siamo nella race window
  //       post-INITIAL_SESSION dove user verrà popolato a momenti.
  // Il FullScreenSpinner copre qualsiasi flash di Home sottostante.
  const authBootstrapPending = isLoading || (hasSessionToken && !user);
  if (authBootstrapPending) {
    return <FullScreenSpinner />;
  }

  // 🆕 Se utente loggato: sempre RoleBasedRedirect (manda alla sezione
  // corretta in base al ruolo: /azienda, /admin, /campo, /cliente, ecc.)
  // Vale ANCHE su www/bare/localhost per evitare flash della landing.
  if (user) {
    return <RoleBasedRedirect />;
  }

  // 🆕 v3: branch invertito — Home renderizzata SOLO se subdomain è
  // esplicitamente "www" (che include anche bare domain e localhost via
  // useSubdomainRoute). Su qualsiasi altro subdomain (app, admin, clienti,
  // lavori, custom white-label, ecc.) deleghiamo a RoleBasedRedirect che
  // sa come gestire il login per il contesto corrente. Difesa robusta:
  // se la detection del subdomain dovesse mai degradarsi, il fallback
  // sicuro è "manda al login giusto" non "mostra la landing pubblica".
  if (subdomain !== "www") {
    return <RoleBasedRedirect />;
  }

  // www.ediliziaincloud.com (o equivalente) senza auth → landing pubblica
  return (
    <ErrorBoundary>
      <Suspense fallback={<FullScreenSpinner />}>
        <Home />
      </Suspense>
    </ErrorBoundary>
  );
}
