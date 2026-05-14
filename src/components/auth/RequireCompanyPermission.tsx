import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, RefreshCw, ShieldX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingTimeoutFallback } from "@/components/auth/LoadingTimeoutFallback";
import { logger } from "@/utils/logger";
import { captureVelocityError } from "@/lib/velocity/sentry";

type NonPermissionKeys = "isLoading" | "isAdmin" | "onlyAssigned" | "visibleAreas" | "loadError";
export type CompanyPermissionKey = Exclude<keyof Permissions, NonPermissionKeys>;

interface RequireCompanyPermissionProps {
  permission: CompanyPermissionKey;
  children: ReactNode;
}

export function RequireCompanyPermission({ permission, children }: RequireCompanyPermissionProps) {
  const permissions = usePermissions();
  const { refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!permissions.isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoadingTimedOut(true);
      logger.warn("[permissions] verifica permessi oltre soglia", { permission });
      captureVelocityError("permissions.route_loading_timeout", new Error("Permission loading timeout"), {
        permission,
        timeoutMs: 15_000,
      });
    }, 15_000);

    return () => window.clearTimeout(timeoutId);
  }, [permission, permissions.isLoading]);

  if (permissions.loadError) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <ShieldX className="mb-4 h-12 w-12 text-amber-600" />
            <h2 className="text-xl font-bold">Permessi non verificati</h2>
            <p className="mt-2 text-muted-foreground">
              Non ho ricevuto una risposta affidabile sui permessi di questa sezione. Riprova la sessione invece di restare bloccato.
            </p>
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {permissions.loadError}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => { void refreshAuth().finally(() => window.location.reload()); }}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Ricarica sessione
              </Button>
              <Button variant="outline" onClick={() => navigate("/azienda")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (permissions.isLoading) {
    if (loadingTimedOut) {
      return (
        <LoadingTimeoutFallback
          title="Verifica permessi lenta"
          description="La piattaforma non ha ricevuto i permessi in tempo. Prima questo caso poteva lasciare la pagina con la rotellina infinita; ora puoi riprovare subito."
          detail={`Permesso richiesto: ${permission}`}
          onRetry={() => { void refreshAuth().finally(() => window.location.reload()); }}
          retryLabel="Ricarica sessione"
        />
      );
    }

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
