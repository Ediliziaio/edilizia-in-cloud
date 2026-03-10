import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = { bozza: "Bozza", inviata: "Inviata", accettata: "Accettata", rifiutata: "Rifiutata", scaduta: "Scaduta" };

export function ContactQuotesPanel({ contactId, companyId }: { contactId: string; companyId: string }) {
  const navigate = useNavigate();
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["contact_quotes", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, total, status, created_at")
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

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full text-[10px] h-7"
        onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?contact_id=${contactId}`)}
      >
        <Plus className="h-3 w-3 mr-1" /> Nuovo Preventivo
      </Button>
      {quotes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-6">Nessun preventivo</p>
      ) : (
        quotes.map((q: any) => (
          <div
            key={q.id}
            className="rounded bg-muted/50 p-2 space-y-0.5 cursor-pointer hover:bg-muted transition-colors"
            onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
          >
            <p className="text-[11px] font-medium">{q.quote_number}</p>
            {q.title && <p className="text-[10px] text-muted-foreground truncate">{q.title}</p>}
            <div className="flex items-center gap-1">
              <Badge variant={q.status === "accettata" ? "default" : q.status === "rifiutata" ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
                {statusLabels[q.status] || q.status}
              </Badge>
              {q.total > 0 && <span className="text-[10px] text-muted-foreground">{Number(q.total).toLocaleString("it-IT")} €</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
