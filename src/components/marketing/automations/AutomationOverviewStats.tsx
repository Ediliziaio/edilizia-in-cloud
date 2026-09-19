/**
 * I numeri del motore delle automazioni, in una riga sotto il titolo della
 * pagina: «2 iscrizioni in corso · 82 passaggi eseguiti nelle ultime 24 ore ·
 * 100% riusciti in 7 giorni · nessun errore nelle ultime 24 ore».
 *
 * 19/09/2026 — Erano sei riquadri in una fascia alta quanto tre righe
 * dell'elenco, e «Flussi» e «Attivi» ripetevano le pastiglie Tutti e Pubblicato.
 * Ora prendono il posto della descrizione sotto il titolo, che non diceva
 * niente; il rosso resta solo agli errori, quando ci sono.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  companyId: string;
}

const MS_DAY = 86400 * 1000;

export function AutomationOverviewStats({ companyId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["automation-overview-stats", companyId],
    queryFn: async () => {
      // Le finestre temporali si calcolano QUI: leggere l'orologio durante il
      // render e' impuro (e il lint di questo repo lo blocca).
      const day1Iso = new Date(Date.now() - MS_DAY).toISOString();
      const day7Iso = new Date(Date.now() - 7 * MS_DAY).toISOString();
      // Parallelizza tutte le count query — tutte head+count=exact per leggerezza.
      // I totali dei flussi non servono più: li danno le pastiglie dell'elenco.
      const [
        enrollmentsActive,
        logs24h,
        logs7d,
        logs7dSuccess,
        errors24h,
      ] = await Promise.all([
        supabase.from("automation_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso).eq("status", "success"),
        // Il motore scrive status 'error' (CHECK: ok|success|error|skipped):
        // con "failed" la card Errori 24h restava a 0 anche con errori reali.
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso).eq("status", "error"),
      ]);

      return {
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
    return <Skeleton className="mt-1.5 h-4 w-96 max-w-full" />;
  }

  const successRate = data.runs7d > 0
    ? Math.round((data.runs7dSuccess / data.runs7d) * 100)
    : null;
  const n = (v: number) => v.toLocaleString("it-IT");

  const voci: { testo: string; titolo?: string; allarme?: boolean }[] = [
    {
      testo: data.enrollmentsActive > 0
        ? `${n(data.enrollmentsActive)} iscrizion${data.enrollmentsActive === 1 ? "e" : "i"} in corso`
        : "nessuna iscrizione in corso",
    },
    {
      testo: data.runs24h > 0
        ? `${n(data.runs24h)} passagg${data.runs24h === 1 ? "io eseguito" : "i eseguiti"} nelle ultime 24 ore`
        : "nessun passaggio eseguito nelle ultime 24 ore",
      titolo: `${n(data.runs7d)} in 7 giorni`,
    },
    ...(successRate !== null
      ? [{ testo: `${successRate}% riusciti in 7 giorni`, titolo: `${n(data.runs7dSuccess)} su ${n(data.runs7d)}` }]
      : []),
    {
      testo: data.errors24h > 0
        ? `${n(data.errors24h)} error${data.errors24h === 1 ? "e" : "i"} nelle ultime 24 ore`
        : "nessun errore",
      allarme: data.errors24h > 0,
    },
  ];

  return (
    <p className="mt-0.5 text-sm text-muted-foreground">
      {voci.map((v, i) => (
        <span key={v.testo}>
          {i > 0 && " · "}
          <span title={v.titolo} className={v.allarme ? "font-medium text-destructive" : undefined}>{v.testo}</span>
        </span>
      ))}
    </p>
  );
}
