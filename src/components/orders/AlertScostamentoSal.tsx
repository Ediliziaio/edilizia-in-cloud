/**
 * Alert «scostamento SAL» di controllo di gestione: confronta l'avanzamento
 * fisico dichiarato con i costi già consumati (consuntivo / costo previsto).
 * La soglia la decide l'azienda in Impostazioni → Modelli di preventivo → Approvazioni
 * (sal_scostamento_enabled / sal_tolleranza_perc). Finora quella scelta non
 * era mostrata da nessuna parte: questo componente la rende viva sulla commessa.
 *
 * Non si mostra sotto il 15% di avanzamento (la stima è rumore) né senza costo
 * previsto. Si legge da solo azienda e soglie; serve il permesso costi a chi lo monta.
 */
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGovernanceThresholds } from "@/hooks/useGovernanceThresholds";
import { scostamentoSalCommessa } from "@/lib/governance/thresholds";
import { cn } from "@/lib/utils";

interface Props {
  avanzamentoPerc: number | null;
  costoPrevisto: number;
  costoConsuntivo: number;
  className?: string;
}

export function AlertScostamentoSal({ avanzamentoPerc, costoPrevisto, costoConsuntivo, className }: Props) {
  const { effectiveCompany } = useAuth();
  const { data: cfg } = useGovernanceThresholds(effectiveCompany?.id);
  if (!cfg) return null;
  const esito = scostamentoSalCommessa(cfg, { avanzamentoPerc, costoPrevisto, costoConsuntivo });
  if (!esito || !esito.alert) return null;
  const critico = esito.severita === "critico";
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm",
        critico ? "border-rose-300 bg-rose-50 text-rose-900" : "border-amber-300 bg-amber-50 text-amber-900",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{critico ? "Scostamento SAL critico" : "Scostamento SAL"}</p>
        <p>{esito.messaggio}</p>
      </div>
    </div>
  );
}
