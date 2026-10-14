import { useAuth } from "@/contexts/AuthContext";
import { useForecastLedger } from "@/hooks/useForecastLedger";
import { ForecastWorkspace } from "@/components/forecast/ForecastWorkspace";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function CashFlowForecast() {
  const { effectiveCompany } = useAuth();
  const query = useForecastLedger();
  if (!effectiveCompany?.id)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Seleziona un’azienda per consultare il previsionale.
      </p>
    );
  if (query.isPending)
    return (
      <div className="space-y-5" aria-label="Caricamento previsionale">
        <Skeleton className="h-14 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-destructive/30 p-6"
      >
        <h1 className="text-lg font-semibold">
          Il previsionale non è disponibile
        </h1>
        <p className="text-sm text-muted-foreground">
          Riprova a caricare i dati. Gli importi mancanti non vengono sostituiti
          con valori zero.
        </p>
        <Button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Riprova
        </Button>
      </div>
    );
  return (
    <ForecastWorkspace
      key={query.data.companyId}
      data={query.data}
      refreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
    />
  );
}
