/**
 * Le assistenze aperte su questa commessa. Prima i ticket erano collegati alla
 * commessa nel database (tickets.order_id) ma la pagina della commessa non li
 * mostrava: chi apriva il cantiere non sapeva che c'erano interventi in corso.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, Plus, Euro, Package, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TICKET_STATI, TICKET_STATI_CHIUSI, ticketStatoLabel } from "@/types/tickets";
import { EmptyRow } from "./EmptyRow";

const TONO: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700", indigo: "bg-indigo-100 text-indigo-700",
  orange: "bg-orange-100 text-orange-700", green: "bg-green-100 text-green-700",
  slate: "bg-slate-100 text-slate-700",
};

interface TicketRiga {
  id: string; subject: string; status: string; priority: string; tipo: string | null;
  created_at: string; data_intervento_prevista: string | null;
  a_pagamento: boolean | null; pagato: boolean | null;
  importo_finale: number | null; importo_preventivato: number | null;
  merce_richiesta: boolean | null;
}

export function OrderAssistenzaTab({ orderId }: { orderId: string }) {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["order-tickets", orderId],
    queryFn: async (): Promise<TicketRiga[]> => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, subject, status, priority, tipo, created_at, data_intervento_prevista, a_pagamento, pagato, importo_finale, importo_preventivato, merce_richiesta")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketRiga[];
    },
  });

  const aperti = tickets.filter(t => !TICKET_STATI_CHIUSI.includes(t.status as never));
  const daIncassare = tickets
    .filter(t => t.a_pagamento && !t.pagato)
    .reduce((s, t) => s + Number(t.importo_finale ?? t.importo_preventivato ?? 0), 0);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Assistenze su questa commessa</h3>
          {aperti.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700">{aperti.length} aperte</Badge>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/azienda/assistenza/nuovo?order=${orderId}&tipo=intervento`}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nuova assistenza
          </Link>
        </Button>
      </div>

      {daIncassare > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Euro className="h-3.5 w-3.5 shrink-0" />
          <span>
            Da incassare su queste assistenze:{" "}
            <strong>{daIncassare.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true })}</strong>
          </span>
        </div>
      )}

      {tickets.length === 0 ? (
        // Riga compatta: la card con icona centrata occupava 126px per una frase.
        <EmptyRow icon={LifeBuoy}>Nessuna assistenza aperta su questa commessa</EmptyRow>
      ) : (
        <div className="space-y-2">
          {tickets.map(t => {
            const stato = TICKET_STATI.find(s => s.value === t.status);
            return (
              <Link key={t.id} to={`/azienda/assistenza/${t.id}`}
                    className="block rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.subject}</span>
                  <Badge className={`shrink-0 text-[10px] ${TONO[stato?.tone ?? "slate"]}`}>
                    {ticketStatoLabel(t.status)}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Aperta il {format(new Date(t.created_at), "d MMM yyyy", { locale: it })}</span>
                  {t.data_intervento_prevista && (
                    <span>· Intervento {format(new Date(t.data_intervento_prevista), "d MMM", { locale: it })}</span>
                  )}
                  {t.merce_richiesta && (
                    <span className="inline-flex items-center gap-1 text-purple-700">
                      <Package className="h-3 w-3" /> merce ordinata
                    </span>
                  )}
                  {t.a_pagamento ? (
                    <span className={t.pagato ? "text-green-700" : "text-amber-700"}>
                      · {t.pagato ? "incassata" : "da incassare"}
                      {t.importo_finale || t.importo_preventivato
                        ? ` ${Number(t.importo_finale ?? t.importo_preventivato).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true })}`
                        : ""}
                    </span>
                  ) : (
                    <span>· in garanzia</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
