import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { silvioActionDestination } from "@/lib/silvio/actionDestination";

export interface CompletedSilvioAction {
  id: string; company_id: string; user_id: string; status: string;
  action_type: string; summary: string; applied_result: unknown;
}

export function SilvioCompletedActionCard({ action }: { action: CompletedSilvioAction }) {
  if (action.status !== "applied") return null;
  const destination = silvioActionDestination(action.action_type, action.status, action.applied_result);
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
    <p className="flex items-center gap-1.5 font-medium text-emerald-800"><CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />Esito registrato</p>
    <p className="mt-1 break-words text-slate-700">{action.summary}</p>
    {destination && <a href={destination.href} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border bg-white px-2 font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
      {destination.label}<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
    </a>}
  </div>;
}

/** Separate from pending proposals, so completed rows cannot hide work awaiting approval. */
export function SilvioCompletedActions({ companyId, userId }: { companyId?: string; userId?: string }) {
  const query = useQuery({
    queryKey: ["silvio_completed_actions", companyId, userId],
    enabled: !!companyId && !!userId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("ai_action_proposals")
        .select("id, company_id, user_id, status, action_type, summary, applied_result")
        .eq("company_id", companyId!).eq("user_id", userId!).eq("status", "applied")
        .order("applied_at", { ascending: false }).abortSignal(signal).limit(3);
      if (error) throw error;
      return (data ?? []).filter(row => row.company_id === companyId && row.user_id === userId && row.status === "applied");
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
  if (!companyId || !userId) return null;
  if (query.isError) return <p role="status" className="text-xs text-slate-500">Storico delle azioni non disponibile. <button type="button" className="min-h-9 underline" onClick={() => void query.refetch()}>Ricarica lo storico</button></p>;
  if (query.isPending) return <p role="status" className="text-xs text-slate-500">Carico gli esiti salvati…</p>;
  if (!query.data?.length) return <p className="text-xs text-slate-500">Nessuna azione completata nello storico.</p>;
  return <section aria-label="Ultime azioni completate" className="space-y-2">
    <h3 className="text-xs font-medium text-slate-600">Ultime azioni completate</h3>
    {query.data.map(action => <SilvioCompletedActionCard key={action.id} action={action} />)}
  </section>;
}
