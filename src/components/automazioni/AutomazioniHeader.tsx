import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Zap, CheckCircle2, AlertCircle } from "lucide-react";

export function AutomazioniHeader() {
  const companyId = useEffectiveCompanyId();

  const { data: counts } = useQuery({
    queryKey: ["automation-counts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_automation_counts", { p_company_id: companyId! });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ totale: number; attive: number }>;
      const totale = rows.reduce((a, r) => a + Number(r.totale), 0);
      const attive = rows.reduce((a, r) => a + Number(r.attive), 0);
      return { totale, attive };
    },
    enabled: !!companyId,
  });

  const { data: logRecenti } = useQuery({
    queryKey: ["automation-log-recent", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .rpc("get_automation_log_recent", { p_company_id: companyId!, p_limit: 5 });
      return (data ?? []) as Array<{ esito: string }>;
    },
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const erroriRecenti = (logRecenti ?? []).filter(l => l.esito === "errore").length;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {counts?.attive ?? 0} attive
      </div>
      <div className="flex items-center gap-2 bg-muted text-muted-foreground px-3 py-1.5 rounded-full text-sm font-medium">
        <Zap className="w-3.5 h-3.5" />
        {counts?.totale ?? 0} totali
      </div>
      {erroriRecenti > 0 && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1.5 rounded-full text-sm font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          {erroriRecenti} errori recenti
        </div>
      )}
    </div>
  );
}
