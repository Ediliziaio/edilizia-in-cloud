import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import type { AppRole } from "@/types/auth";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import { logger } from "@/utils/logger";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
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

  // 🛡️  Defense-in-depth (third layer): anche se AuthContext non avesse scartato
  // super_admin (cache rotto, bug, race condition), la route guard rifiuta l'accesso
  // alla rotta se il ruolo risolto è super_admin ma l'email NON è nell'allowlist.
  // Redirect a /azienda (default del company_admin, che è il livello legittimo più
  // probabile per queste email residue in user_roles).
  if (role === "super_admin" && !isSuperAdminEmailAllowed(user.email)) {
    logger.warn("[security] ProtectedRoute: super_admin bloccato, email non in allowlist", {
      email: user.email ?? null,
      path: location.pathname,
    });
    return <Navigate to="/azienda" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect to the appropriate dashboard based on role
    const roleRedirects: Record<string, string> = {
      super_admin: "/admin",
      company_admin: "/azienda",
      company_staff: "/azienda",
      call_center: "/azienda",
      customer: "/cliente",
      employee: "/dipendente",
      salesperson: "/venditore",
      platform_manager: "/admin",
      platform_sales: "/admin",
      platform_support: "/admin",
      platform_marketing: "/admin",
      platform_implementation: "/admin",
      multi_company_user: "/azienda",
    };
    const redirectPath = roleRedirects[role] || "/login";
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
