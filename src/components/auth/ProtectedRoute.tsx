import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import type { AppRole } from "@/types/auth";

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
    };
    const redirectPath = roleRedirects[role] || "/login";
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
