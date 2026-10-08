import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SilvioActionProposals } from "./SilvioActionProposals";

/** Remains reachable after the last pending action completes. */
export function SilvioActionsBar() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["silvio-proposals-count", companyId, userId],
    enabled: !!companyId && !!userId,
    queryFn: async () => {
      const { count, error } = await supabase.from("ai_action_proposals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!).eq("user_id", userId!).eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000, refetchInterval: 30_000, retry: false,
  });
  if (!companyId || !userId) return null;
  return <div className="mb-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex min-h-9 w-full items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
      <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="font-medium">Azioni e risultati{!query.isError && query.data ? ` · ${query.data} da verificare` : ""}</span>
      <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto"><SilvioActionProposals compact /></div>}
  </div>;
}
