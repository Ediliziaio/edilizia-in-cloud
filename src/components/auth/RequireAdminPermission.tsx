import { Loader2 } from "lucide-react";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { useSuperAdminPermissions, type SuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

type AdminPermissionKey = Exclude<keyof SuperAdminPermissions, "allowed_company_ids">;

interface RequireAdminPermissionProps {
  permission: AdminPermissionKey;
  children: React.ReactNode;
}

export function RequireAdminPermission({ permission, children }: RequireAdminPermissionProps) {
  const { permissions, isLoading } = useSuperAdminPermissions();

  if (isLoading) {
    return (
      <div className="min-h-[320px] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifica permessi...</p>
        </div>
      </div>
    );
  }

  if (!permissions[permission]) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
