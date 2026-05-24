import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import type { AppRole } from "@/types/auth";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { logger } from "@/utils/logger";
import { useEffect, useState } from "react";
import { LoadingTimeoutFallback } from "@/components/auth/LoadingTimeoutFallback";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { resolveRouteAccessRole } from "@/lib/auth/multiCompany";
import { COMPANY_APP_HOME, getRoleHomePath } from "@/lib/auth/appHome";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, isLoading, multiCompanyAccesses, selectedMultiCompanyId } = useAuth();
  const location = useLocation();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const routeRole = resolveRouteAccessRole({
    globalRole: role,
    accesses: multiCompanyAccesses,
    selectedCompanyId: selectedMultiCompanyId,
  });

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    // Coerenza con i timeout di AuthContext:
    //   AbortController fetchUserData = 20s
    //   Promise.race fetchUserData    = 22s
    // Se mostrassimo il fallback PRIMA di 22s avremmo un falso positivo:
    // l'utente vede "Accesso ancora in verifica" mentre Supabase sta ancora
    // rispondendo (cold-start free tier 10-30s) — ricarica → magari intanto
    // si è svegliato → "torna come prima". Margine di 3s per evitare race.
    const timeoutId = window.setTimeout(() => {
      setLoadingTimedOut(true);
      logger.warn("[auth] ProtectedRoute: auth loading oltre soglia", {
        path: location.pathname,
      });
      captureVelocityError("auth.route_loading_timeout", new Error("Auth loading timeout"), {
        path: location.pathname,
        timeoutMs: 25_000,
      });
    }, 25_000);

    return () => window.clearTimeout(timeoutId);
  }, [isLoading, location.pathname]);

  if (isLoading) {
    if (loadingTimedOut) {
      return (
        <LoadingTimeoutFallback
          title="Accesso ancora in verifica"
          description="La sessione non ha completato il caricamento. Può succedere con rete instabile o database lento: riprova senza restare bloccato sulla rotellina."
          detail={`Verifica sessione oltre 25 secondi: ${location.pathname}`}
          homePath="/login"
        />
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 🛡️  Defense-in-depth (third layer): anche se AuthContext non avesse scartato
  // super_admin (cache rotto, bug, race condition), la route guard rifiuta l'accesso
  // alla rotta se il ruolo risolto è super_admin ma l'email NON è nell'allowlist.
  // Redirect all'home app aziendale, che è il livello legittimo più
  // probabile per queste email residue in user_roles).
  if (role === "super_admin" && !isSuperAdminEmailAllowed(user.email)) {
    logger.warn("[security] ProtectedRoute: super_admin bloccato, email non in allowlist", {
      email: user.email ?? null,
      path: location.pathname,
    });
    return <Navigate to={COMPANY_APP_HOME} replace />;
  }

  if (allowedRoles && routeRole && !allowedRoles.includes(routeRole)) {
    return <Navigate to={getRoleHomePath(routeRole)} replace />;
  }

  return <>{children}</>;
}
