import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface FeatureRouteProps {
  children: React.ReactNode;
  /** Chiave della feature (colonna `key` di `platform_feature_flags`). */
  featureKey: string;
  /** Path di redirect se la feature non è disponibile. Default "/azienda/upgrade". */
  fallbackPath?: string;
}

/**
 * Route guard basato su feature flag risolta lato DB.
 *
 * A differenza di `FeatureGate` (che nasconde un frammento di UI),
 * `FeatureRoute` intercetta l'accesso URL-diretto: se l'utente digita
 * l'indirizzo di una feature che non ha, viene rediretto al flow di upgrade
 * invece che a una pagina con metà elementi nascosti.
 *
 * Da usare in `<Route element={<FeatureRoute featureKey="xyz">...</FeatureRoute>}>`
 * sopra la dichiarazione delle rotte protette.
 */
export function FeatureRoute({
  children,
  featureKey,
  fallbackPath = "/azienda/upgrade",
}: FeatureRouteProps) {
  const location = useLocation();
  const { isEnabled, isLoading } = useFeatureAccess(featureKey);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifica accesso…</p>
        </div>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <Navigate
        to={fallbackPath}
        state={{ from: location, deniedFeature: featureKey }}
        replace
      />
    );
  }

  return <>{children}</>;
}
