import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions, Permissions } from "@/hooks/usePermissions";
import { Loader2, ShieldX } from "lucide-react";

type PermissionKey = Exclude<keyof Permissions, "isAdmin" | "isLoading">;

interface PermissionGuardProps {
  permission: PermissionKey;
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <ShieldX className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Accesso Negato</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Non hai i permessi necessari per accedere a questa sezione. 
        Contatta l'amministratore della tua azienda.
      </p>
    </div>
  );
}

export function PermissionGuard({
  permission,
  children,
  fallback,
  redirectTo,
}: PermissionGuardProps) {
  const permissions = usePermissions();

  if (permissions.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!permissions[permission]) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    return <>{fallback || <AccessDenied />}</>;
  }

  return <>{children}</>;
}

// Hook to check permission in components
export function useCanAccess(permission: PermissionKey): boolean {
  const permissions = usePermissions();
  return permissions[permission];
}
