import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { logger } from "@/utils/logger";

interface RequireSuperAdminProps {
  children: React.ReactNode;
}

/**
 * Gate *chirurgico* per route che devono essere accessibili SOLO al super_admin
 * vero (ruolo `super_admin` + email in allowlist), escludendo i ruoli
 * `platform_*` che normalmente passano il `ProtectedRoute` di /admin.
 *
 * Da usare SOLO sulle route ad alto rischio:
 *   - Gestione super admin (`/admin/impostazioni/super-admin`)
 *   - Sicurezza piattaforma, IP allowlist, webhooks, banking, integrazioni
 *   - Audit log, GDPR, dunning, feature flags, piani commerciali
 *
 * NON usare sulle route operative condivise con platform_manager / support /
 * sales / marketing / implementation: quelle restano sotto `ADMIN_PLATFORM_ROLES`.
 */
export function RequireSuperAdmin({ children }: RequireSuperAdminProps) {
  const { user, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
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

  const isSuperAdmin =
    role === "super_admin" && isSuperAdminEmailAllowed(user.email);

  if (!isSuperAdmin) {
    logger.warn("[security] RequireSuperAdmin: accesso negato", {
      email: user.email ?? null,
      role: role ?? null,
      path: location.pathname,
    });

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-semibold">Accesso riservato</h1>
          <p className="text-muted-foreground">
            Questa sezione è riservata al Super Admin della piattaforma. Il tuo
            ruolo attuale non dispone dei permessi necessari.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
