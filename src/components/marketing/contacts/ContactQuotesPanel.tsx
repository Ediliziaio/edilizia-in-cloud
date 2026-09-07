import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { linkPreventivo, etichettaTipoPreventivo } from "@/lib/preventivi/linkPreventivo";

const statusLabels: Record<string, string> = { bozza: "Bozza", inviata: "Inviata", accettata: "Accettata", rifiutata: "Rifiutata", scaduta: "Scaduta" };

export function ContactQuotesPanel({ contactId, companyId }: { contactId: string; companyId: string }) {
  const navigate = useNavigate();
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["contact_quotes", contactId],
    queryFn: async () => {
      // Leggeva solo `quotes`: i preventivi dei verticali non comparivano, e il
      // pannello diceva "nessun preventivo" a contatti che ne avevano.
      const { data, error } = await supabase
        .from("v_preventivi_unificati")
        .select("id, tipo, numero, totale, stato_unificato, data, created_at")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        tipo: (r.tipo as string | null) ?? null,
        quote_number: (r.numero as string | null) ?? null,
        total: r.totale == null ? null : Number(r.totale),
        status: (r.stato_unificato as string | null) ?? null,
        created_at: (r.data as string | null) ?? (r.created_at as string),
      }));
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
        quotes.map((q) => {
          // Ogni tipo ha la sua pagina. Se il tipo non è fra quelli noti la riga
          // resta visibile ma non cliccabile: un preventivo che si vede e non si
          // apre è meglio di un clic che porta a una pagina vuota.
          const href = linkPreventivo(q.tipo, q.id);
          return (
            <div
              key={q.id}
              className={`rounded bg-muted/50 p-2 space-y-0.5 transition-colors ${href ? "cursor-pointer hover:bg-muted" : ""}`}
              onClick={href ? () => navigate(href) : undefined}
            >
              <p className="text-[11px] font-medium">{q.quote_number}</p>
              {q.tipo && <p className="text-[10px] text-muted-foreground truncate">{etichettaTipoPreventivo(q.tipo)}</p>}
              <div className="flex items-center gap-1">
                <Badge variant={q.status === "accettata" ? "default" : q.status === "rifiutata" ? "destructive" : "secondary"} className="text-[9px] h-4 px-1">
                  {(q.status && statusLabels[q.status]) || q.status}
                </Badge>
                {q.total != null && q.total > 0 && <span className="text-[10px] text-muted-foreground">{Number(q.total).toLocaleString("it-IT")} €</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
