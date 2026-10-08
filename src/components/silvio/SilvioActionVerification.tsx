import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { silvioActionDestination } from "@/lib/silvio/actionDestination";

/** Read-only reconciliation. Never resets a claim or dispatches the action again. */
export function SilvioActionVerification({ companyId, userId, proposalId, summary, warning, onCheck }: {
  companyId: string;
  userId: string;
  proposalId: string;
  summary: string;
  warning: string;
  onCheck: () => void;
}) {
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("ai_action_proposals")
        .select("id, company_id, user_id, status, action_type, applied_result")
        .eq("id", proposalId).eq("company_id", companyId).eq("user_id", userId)
        .abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
      if (error) throw new Error("Verifica non disponibile. Controlla la connessione e riprova la verifica, non l’azione.");
      if (!data || data.id !== proposalId || data.company_id !== companyId || data.user_id !== userId)
        throw new Error("Azione non trovata o non accessibile. Nessuna operazione è stata reinviata.");
      switch (data.status) {
        case "applied": return { resolved: true, message: "Esito registrato: azione applicata. Non occorre ripeterla.", destination: silvioActionDestination(data.action_type, data.status, data.applied_result) };
        case "failed": return { resolved: true, message: "Tentativo registrato come fallito. Controlla eventuali effetti parziali nella sezione interessata prima di creare una nuova richiesta." };
        case "rejected":
        case "expired":
        case "undone": return { resolved: true, message: "Proposta chiusa. Nessuna nuova esecuzione avviata: controlla lo storico nella sezione interessata." };
        case "confirmed": return { resolved: false, message: "Azione presa in carico, esito finale non ancora registrato. Attendi e verifica di nuovo; non ripetere l’azione." };
        default: return { resolved: false, message: "Nessun esito finale verificabile. Controlla il risultato nell’app: questa verifica non autorizza un nuovo invio." };
      }
    },
    retry: false,
  });
  const message = check.error?.message ?? check.data?.message ?? warning;
  return (
    <div role={check.data?.resolved && !check.error ? "status" : "alert"} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <p className="font-medium break-words">{summary}</p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {!check.error && check.data?.destination && <a href={check.data.destination.href} className="mt-2 inline-flex min-h-9 items-center rounded-md border bg-white px-2 font-medium text-blue-800 underline">{check.data.destination.label}</a>}
      <Button type="button" size="sm" variant="outline" className="mt-2 gap-1.5" disabled={check.isPending}
        onClick={() => { onCheck(); check.mutate(); }}>
        {check.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {check.isPending ? "Verifico…" : "Verifica esito"}
      </Button>
      <p className="mt-1 text-[11px]">Controlla solo lo stato salvato. Non ripete l’operazione.</p>
    </div>
  );
}
