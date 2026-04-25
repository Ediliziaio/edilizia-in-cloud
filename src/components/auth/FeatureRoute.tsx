import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";

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
  const { isEnabled, isLoading, isError, errorMessage, refetch, isFetching } = useFeatureAccess(featureKey);

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

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">Non riesco a verificare l'accesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Il controllo permessi per questa sezione non ha risposto in tempo. Riprova senza perdere la pagina corrente.
          </p>
          {errorMessage && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {errorMessage}
            </p>
          )}
          <Button className="mt-5" onClick={refetch} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Riprova verifica
          </Button>
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
