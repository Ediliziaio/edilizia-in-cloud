import type { ReactNode } from "react";
import { ArrowLeft, Loader2, ShieldX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type NonPermissionKeys = "isLoading" | "isAdmin" | "onlyAssigned" | "visibleAreas";
export type CompanyPermissionKey = Exclude<keyof Permissions, NonPermissionKeys>;

interface RequireCompanyPermissionProps {
  permission: CompanyPermissionKey;
  children: ReactNode;
}

export function RequireCompanyPermission({ permission, children }: RequireCompanyPermissionProps) {
  const permissions = usePermissions();
  const navigate = useNavigate();

  if (permissions.isLoading) {
    return (
      <div className="min-h-[320px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p>Verifica permessi...</p>
        </div>
      </div>
    );
  }

  if (!permissions[permission]) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <ShieldX className="mb-4 h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">Accesso negato</h2>
            <p className="mt-2 text-muted-foreground">
              Non hai i permessi per accedere a questa sezione.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => navigate("/azienda")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
