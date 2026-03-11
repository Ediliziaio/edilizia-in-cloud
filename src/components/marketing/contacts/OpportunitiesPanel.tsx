import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/queryKeys";

export function OpportunitiesPanel({ contactId, companyId }: { contactId: string; companyId: string }) {
  const { data: opps = [], isLoading } = useQuery({
    queryKey: queryKeys.opportunities.byContact(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, name, value, status, marketing_pipeline_stages(name), marketing_pipelines(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 8 * 60 * 1000,
  });

  if (isLoading) return <p className="text-[11px] text-muted-foreground text-center py-4">Caricamento...</p>;
  if (opps.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-8">Nessuna opportunità collegata</p>;

  return (
    <div className="space-y-2">
      {opps.map((opp: any) => (
        <div key={opp.id} className="rounded bg-muted/50 p-2 space-y-0.5">
          <p className="text-[11px] font-medium">{opp.name}</p>
          <div className="flex items-center gap-1">
            <Badge variant={opp.status === "won" ? "default" : opp.status === "lost" ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
              {opp.status === "open" ? "Aperta" : opp.status === "won" ? "Vinta" : "Persa"}
            </Badge>
            {opp.value > 0 && <span className="text-[10px] text-muted-foreground">{Number(opp.value).toLocaleString("it-IT")} €</span>}
          </div>
          {opp.marketing_pipelines?.name && (
            <p className="text-[10px] text-muted-foreground">{opp.marketing_pipelines.name} → {opp.marketing_pipeline_stages?.name}</p>
          )}
        </div>
      ))}
    </div>
  );
}
