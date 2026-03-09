import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  contactId: string | null;
  companyId: string | undefined;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  sent: { label: "Inviato", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  accepted: { label: "Accettato", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  rejected: { label: "Rifiutato", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  expired: { label: "Scaduto", className: "bg-muted text-muted-foreground" },
};

export function OpportunityQuotesTab({ contactId, companyId }: Props) {
  const navigate = useNavigate();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes_by_contact", contactId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, title, status, total, created_at")
        .eq("company_id", companyId!)
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
  });

  if (!contactId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nessun contatto collegato a questa opportunità.<br />
          Collega un contatto per creare preventivi.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Preventivi</h3>
        <Button
          size="sm"
          onClick={() => navigate(`/azienda/marketing/preventivi/nuovo?contact_id=${contactId}`)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuovo Preventivo
        </Button>
      </div>

      {quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nessun preventivo per questo contatto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q: any) => {
            const st = STATUS_LABELS[q.status] || STATUS_LABELS.draft;
            return (
              <button
                key={q.id}
                onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)}
                className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{q.quote_number || "—"}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${st.className} border-0`}>
                      {st.label}
                    </Badge>
                  </div>
                  {q.title && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{q.title}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    {q.total != null ? `€ ${Number(q.total).toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(q.created_at), "dd MMM yyyy", { locale: it })}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
