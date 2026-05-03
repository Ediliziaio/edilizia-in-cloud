import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { useStatoPatrimoniale } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { SPColumns } from "@/components/controllo-gestione/ui/SPColumns";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { formatCurrency } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";

interface TabStatoPatrimonialeProps {
  anno: number;
}

export function TabStatoPatrimoniale({ anno }: TabStatoPatrimonialeProps) {
  const sp = useStatoPatrimoniale(anno);
  const navigate = useNavigate();

  if (sp.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[500px] rounded-2xl" />
        <Skeleton className="h-[500px] rounded-2xl" />
      </div>
    );
  }
  if (sp.isError) return <ErrorBlock onRetry={() => sp.refetch()} />;
  if (!sp.data) return null;

  const { attivo, passivo, quadratura } = sp.data;

  if (attivo.totale === 0 && passivo.totale === 0) {
    return (
      <EmptyState
        title="Stato patrimoniale vuoto"
        description={`Non ho dati patrimoniali per il ${anno}. Compila il bilancio iniziale tramite il wizard.`}
        ctaLabel="Apri wizard bilancio"
        onCta={() => navigate("/azienda/controllo-gestione/wizard-bilancio")}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!quadratura.quadrato && (
        <Alert className="rounded-2xl border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900">Bilancio non quadrato</AlertTitle>
          <AlertDescription className="space-y-3 text-amber-800">
            <p>
              Differenza Attivo − Passivo: {formatCurrency(quadratura.differenza)}.
              Apri il wizard per riconciliare le voci.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-400 bg-white"
              onClick={() => navigate("/azienda/controllo-gestione/wizard-bilancio")}
            >
              Apri wizard bilancio
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <SPColumns attivo={attivo} passivo={passivo} />
    </div>
  );
}
