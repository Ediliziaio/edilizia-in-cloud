import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const STATUSES = [
  ["active", "In esecuzione"], ["waiting", "In attesa"], ["paused", "In pausa"],
  ["completed", "Completate"], ["failed", "Fallite"], ["removed", "Rimosse"], ["canceled", "Fermate"],
] as const;

export function WorkflowStatsPanel({ flowId, companyId }: { flowId?: string; companyId?: string }) {
  const query = useQuery({
    queryKey: ["flow-stats-counts", companyId, flowId],
    enabled: !!flowId && !!companyId,
    queryFn: async () => Promise.all(STATUSES.map(async ([status, label]) => {
      const { count, error } = await supabase.from("automation_enrollments")
        .select("id", { count: "exact", head: true }).eq("company_id", companyId!).eq("flow_id", flowId!).eq("status", status);
      if (error) throw error;
      return { label, count: count ?? 0 };
    })),
    staleTime: 30_000,
  });
  if (!flowId || !companyId) return <p className="p-4 text-xs text-muted-foreground">Salva il flusso per consultarne le esecuzioni.</p>;
  return <div className="space-y-4 p-4 overflow-y-auto" aria-live="polite">
    <p className="text-xs text-muted-foreground">Iscrizioni reali del flusso, suddivise per stato attuale.</p>
    {query.isLoading ? <p className="text-sm">Caricamento statistiche…</p> : query.isError ? <p role="alert" className="text-xs text-destructive">Statistiche non disponibili. Riprova.</p> :
      <dl className="space-y-2">{query.data?.map(item => <div key={item.label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2"><dt className="text-xs">{item.label}</dt><dd className="text-lg font-semibold tabular-nums">{item.count}</dd></div>)}</dl>}
    {query.data?.every(item => item.count === 0) && <p className="text-xs text-muted-foreground">Nessuna iscrizione registrata. Le prove di configurazione non generano esecuzioni.</p>}
    <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Aggiorna statistiche</Button>
    <p className="text-xs text-muted-foreground">Dettagli dei singoli passi nel Registro esecuzione.</p>
  </div>;
}
