import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function RenderCreditsWidget() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["render-credits", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("render_credits")
        .select("balance, total_used, unlimited")
        .eq("company_id", companyId)
        .maybeSingle();
      // Cast via unknown: `unlimited` e' stato aggiunto alla tabella ma non e'
      // ancora nei tipi generati di Supabase, quindi il cast diretto non passa.
      return data as unknown as { balance: number; total_used: number; unlimited?: boolean } | null;
    },
    enabled: !!companyId,
    // P5 FIX: evita refetch continui che fanno "flickerare" il badge
    // durante navigation. I crediti non cambiano così spesso: 15s di cache.
    staleTime: 15_000,
  });

  if (isLoading) return <Skeleton className="h-6 w-24" />;

  const balance = data?.balance ?? 0;
  // Aziende a render illimitati: il saldo non viene consumato, mostrarlo come
  // numero (spesso 0) faceva apparire "esauriti" un account che genera senza
  // limiti.
  const unlimited = data?.unlimited === true;

  return (
    <div className="flex items-center gap-1.5">
      <Zap className="h-4 w-4 text-amber-500" />
      <Badge variant={unlimited || balance > 0 ? "secondary" : "destructive"} className="font-mono">
        {unlimited ? "illimitati" : `${balance} render`}
      </Badge>
    </div>
  );
}
