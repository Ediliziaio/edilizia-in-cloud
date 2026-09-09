/**
 * KPI overview globali di tutti i flussi aziendali.
 * Mostrato sopra `AutomationFlowsList` / `AutomazioniUnified`.
 *
 * Metriche (ultimi 7 giorni salvo diversa indicazione):
 * - Totale flussi / Attivi
 * - Iscrizioni attive (in corso)
 * - Esecuzioni 24h / 7gg
 * - Success rate 7gg
 * - Errori ultime 24h (chiamata all'azione: clic → apri filtro errori)
 *
 * Design: una riga sola di numeri, cliccabili dove ha senso filtrare la lista.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string;
  onErrorClick?: () => void;
  onActiveClick?: () => void;
}

const MS_DAY = 86400 * 1000;

export function AutomationOverviewStats({ companyId, onErrorClick, onActiveClick }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["automation-overview-stats", companyId],
    queryFn: async () => {
      // Le finestre temporali si calcolano QUI: leggere l'orologio durante il
      // render e' impuro (e il lint di questo repo lo blocca).
      const day1Iso = new Date(Date.now() - MS_DAY).toISOString();
      const day7Iso = new Date(Date.now() - 7 * MS_DAY).toISOString();
      // Parallelizza tutte le count query — tutte head+count=exact per leggerezza.
      const [
        flowsTotal,
        flowsActive,
        enrollmentsActive,
        logs24h,
        logs7d,
        logs7dSuccess,
        errors24h,
      ] = await Promise.all([
        supabase.from("automation_flows").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("automation_flows").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "published"),
        supabase.from("automation_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso).eq("status", "success"),
        // Il motore scrive status 'error' (CHECK: ok|success|error|skipped):
        // con "failed" la card Errori 24h restava a 0 anche con errori reali.
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso).eq("status", "error"),
      ]);

      return {
        flowsTotal: flowsTotal.count ?? 0,
        flowsActive: flowsActive.count ?? 0,
        enrollmentsActive: enrollmentsActive.count ?? 0,
        runs24h: logs24h.count ?? 0,
        runs7d: logs7d.count ?? 0,
        runs7dSuccess: logs7dSuccess.count ?? 0,
        errors24h: errors24h.count ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-16 rounded-xl" />;
  }

  const successRate = data.runs7d > 0
    ? Math.round((data.runs7dSuccess / data.runs7d) * 100)
    : null;

  const voci: Array<{ label: string; value: string | number; nota?: string; onClick?: () => void; allarme?: boolean }> = [
    { label: "Flussi", value: data.flowsTotal },
    { label: "Attivi", value: data.flowsActive, onClick: onActiveClick },
    { label: "Iscrizioni", value: data.enrollmentsActive },
    { label: "Esecuzioni 24h", value: data.runs24h, nota: data.runs7d > 0 ? `${data.runs7d} in 7gg` : undefined },
    {
      label: "Riuscite 7gg",
      value: successRate !== null ? `${successRate}%` : "—",
      nota: successRate !== null ? `${data.runs7dSuccess}/${data.runs7d}` : undefined,
    },
    {
      label: "Errori 24h",
      value: data.errors24h,
      onClick: data.errors24h > 0 ? onErrorClick : undefined,
      allarme: data.errors24h > 0,
    },
  ];

  // 09/09/2026 — Erano sei card colorate alte quanto mezzo schermo, con sei
  // zeri dentro: gridavano senza dire niente. Ora sono una riga sola; l'unica
  // che si colora è quella degli errori, e solo quando ce ne sono davvero.
  return (
    <div className="grid grid-cols-3 divide-x divide-y rounded-xl border bg-card sm:grid-cols-6 sm:divide-y-0">
      {voci.map((v) => {
        const Elemento = v.onClick ? "button" : "div";
        return (
          <Elemento
            key={v.label}
            type={v.onClick ? "button" : undefined}
            onClick={v.onClick}
            className={cn(
              "px-3 py-2.5 text-left",
              v.onClick && "transition-colors hover:bg-muted/50",
            )}
          >
            <p className="truncate text-[11px] text-muted-foreground">{v.label}</p>
            <p className={cn(
              "text-lg font-semibold leading-tight tabular-nums",
              v.allarme && "text-destructive",
            )}>
              {v.value}
            </p>
            {v.nota && <p className="truncate text-[11px] text-muted-foreground">{v.nota}</p>}
          </Elemento>
        );
      })}
    </div>
  );
}
