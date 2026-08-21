import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";

export function OpportunitiesPanel({ contactId, companyId }: { contactId: string; companyId: string }) {
  const navigate = useNavigate();
  const { data: opps = [], isLoading } = useQuery({
    queryKey: queryKeys.opportunities.byContact(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("id, name, value, status, pipeline_id, marketing_pipeline_stages(name), marketing_pipelines(name)")
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

  // Il "+" porta alla pagina Opportunità col dialog già aperto e questo
  // contatto pre-selezionato: prima da qui non si poteva creare niente.
  const nuovaOpportunita = () =>
    navigate(`/azienda/marketing/opportunita?nuova_contatto=${contactId}`);

  if (isLoading) return <p className="text-[11px] text-muted-foreground text-center py-4">Caricamento...</p>;

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" className="w-full h-7 text-[11px]" onClick={nuovaOpportunita}>
        <Plus className="h-3 w-3 mr-1" /> Nuova opportunità
      </Button>
      {opps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-6">Nessuna opportunità collegata</p>
      ) : (
        opps.map((opp: any) => (
          <div
            key={opp.id}
            className="rounded bg-muted/50 p-2 space-y-0.5 cursor-pointer hover:bg-muted transition-colors"
            onClick={() => navigate(`/azienda/marketing/opportunita?pipeline=${opp.pipeline_id}&apri=${opp.id}`)}
          >
            <p className="text-[11px] font-medium">{opp.name}</p>
            <div className="flex items-center gap-1">
              <Badge variant={opp.status === "won" ? "default" : opp.status === "lost" ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
                {opp.status === "open" ? "Aperta" : opp.status === "won" ? "Vinta" : opp.status === "abandoned" ? "Abbandonata" : "Persa"}
              </Badge>
              {opp.value > 0 && <span className="text-[10px] text-muted-foreground">{Number(opp.value).toLocaleString("it-IT")} €</span>}
            </div>
            {opp.marketing_pipelines?.name && (
              <p className="text-[10px] text-muted-foreground">{opp.marketing_pipelines.name} → {opp.marketing_pipeline_stages?.name}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
