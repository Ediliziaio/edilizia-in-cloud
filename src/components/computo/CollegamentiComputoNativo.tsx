import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { PlanimetrieAssociate } from "@/components/planimetrie/PlanimetrieAssociate";

export function CollegamentiComputoNativo({ companyId, draftId }: { companyId: string; draftId: string }) {
  const permessi = usePermissions();
  const quote = useQuery({
    queryKey: ["planimetrie", "preventivo-computo-nativo", companyId, draftId],
    enabled: permessi.canViewPreventivi,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("id,quote_number")
        .eq("company_id", companyId).eq("source", `modulo:computo:${draftId}`).is("deleted_at", null).maybeSingle();
      if (error) throw new Error("Collegamento al preventivo non disponibile.");
      return data;
    },
  });
  if (!permessi.canViewPreventivi) return null;
  if (quote.error) return <p role="alert" className="text-sm text-muted-foreground">Non riesco a leggere i collegamenti del preventivo.</p>;
  if (!quote.data) return null;
  return <div className="space-y-2"><Link className="text-sm text-primary hover:underline" to={`/azienda/marketing/preventivi/${quote.data.id}`}>Apri preventivo {quote.data.quote_number}</Link><PlanimetrieAssociate companyId={companyId} tipo="preventivo" schedaId={quote.data.id} /></div>;
}
