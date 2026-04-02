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
        .from("render_credits" as never)
        .select("balance, total_used")
        .eq("company_id" as never, companyId as never)
        .maybeSingle();
      return data as { balance: number; total_used: number } | null;
    },
    enabled: !!companyId,
  });

  if (isLoading) return <Skeleton className="h-6 w-24" />;

  const balance = data?.balance ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      <Zap className="h-4 w-4 text-amber-500" />
      <Badge variant={balance > 0 ? "secondary" : "destructive"} className="font-mono">
        {balance} render
      </Badge>
    </div>
  );
}
