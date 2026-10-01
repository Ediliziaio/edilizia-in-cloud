/**
 * Merce dell'assistenza: quali ordini fornitore sono partiti per questo
 * intervento e quando arriva la roba. Finché il materiale non c'è, l'intervento
 * non si può fare — prima questa informazione non esisteva e si finiva per
 * telefonare al fornitore per sapere a che punto era.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Truck, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TICKET_MERCE_STATI, type TicketMerceStato } from "@/types/tickets";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrdinaMerceDialog } from "@/components/tickets/OrdinaMerceDialog";

interface OdaRow {
  id: string;
  oda_number: string | null;
  status: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  total: number | null;
  supplier: { name: string } | null;
}

const STATO_LABEL: Record<string, string> = {
  bozza: "Bozza", inviato: "Inviato", confermato: "Confermato",
  parziale: "Arrivato in parte", ricevuto: "Arrivato", annullato: "Annullato",
};

function dataIt(d: string | null) {
  return d ? format(new Date(d), "d MMM yyyy", { locale: it }) : null;
}

export function TicketMerceCard({
  ticketId, orderId, companyId,
  ticket,
}: {
  ticketId: string;
  orderId: string | null;
  companyId: string;
  ticket?: { merce_stato?: string | null; merce_mancante?: string | null } | null;
}) {
  const merceStato = (ticket?.merce_stato ?? null) as TicketMerceStato | null;
  const [mancante, setMancante] = useState(ticket?.merce_mancante ?? "");
  // Dichiarato qui e non piu' in fondo: il `onSuccess` sotto invocava
  // `queryClient`, un nome che nel file non esiste. Al primo salvataggio
  // riuscito sarebbe partito un ReferenceError: niente toast e nessuna lista
  // aggiornata, proprio nel ramo che va a buon fine.
  const qc = useQueryClient();

  // Stato della merce direttamente sul ticket: serve a chi NON usa gli ordini a
  // fornitore (la maggior parte) e alimenta i filtri «merce da arrivare/arrivata».
  const salvaStato = useMutation({
    mutationFn: async (patch: { merce_stato: TicketMerceStato | null; merce_mancante?: string | null }) => {
      const { error } = await supabase.from("tickets").update(patch as never).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(ticketId) });
      qc.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
      toast.success("Merce aggiornata");
    },
    onError: (e) => toast.error("Non salvato", { description: (e as Error).message }),
  });

  const [aperto, setAperto] = useState(false);

  const { data: ordini = [], isLoading } = useQuery({
    queryKey: ["ticket-merce", ticketId],
    queryFn: async (): Promise<OdaRow[]> => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, expected_delivery_date, actual_delivery_date, total, supplier:suppliers(name)")
        .eq("ticket_id", ticketId as never)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OdaRow[];
    },
  });

  const inArrivo = ordini.filter(o => !o.actual_delivery_date && o.status !== "annullato");
  const prossima = inArrivo
    .map(o => o.expected_delivery_date)
    .filter(Boolean)
    .sort()[0] as string | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Merce</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAperto(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ordina
          </Button>
        </div>

        {/* Stato merce del ticket: vale anche senza ordini a fornitore. */}
        <div className="space-y-2">
          <Select
            value={merceStato ?? "__nessuna__"}
            onValueChange={(v) =>
              salvaStato.mutate({
                merce_stato: v === "__nessuna__" ? null : (v as TicketMerceStato),
              })
            }
          >
            <SelectTrigger className={merceStato === "arrivata_parziale" ? "border-red-300 text-red-700" : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__nessuna__">Non serve merce</SelectItem>
              {TICKET_MERCE_STATI.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {merceStato === "arrivata_parziale" && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Bolla incompleta: cosa manca
              </div>
              <Textarea
                value={mancante}
                onChange={(e) => setMancante(e.target.value)}
                onBlur={() => {
                  if ((ticket?.merce_mancante ?? "") !== mancante) {
                    salvaStato.mutate({ merce_stato: "arrivata_parziale", merce_mancante: mancante.trim() || null });
                  }
                }}
                placeholder="Es. mancano 2 maniglie e la guarnizione inferiore"
                rows={2}
                className="border-red-200 bg-white focus-visible:ring-red-400"
              />
              {(ticket?.merce_mancante ?? "") !== mancante && (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={salvaStato.isPending}
                  onClick={() =>
                    salvaStato.mutate({ merce_stato: "arrivata_parziale", merce_mancante: mancante.trim() || null })
                  }
                >
                  {salvaStato.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Salva cosa manca
                </Button>
              )}
            </div>
          )}
        </div>

        {prossima && (
          <div className="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-800">
            <Truck className="h-3.5 w-3.5 shrink-0" />
            <span>Prossimo arrivo previsto: <strong>{dataIt(prossima)}</strong></span>
          </div>
        )}

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : ordini.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nessun materiale ordinato per questa assistenza.
          </p>
        ) : (
          <div className="space-y-2">
            {ordini.map(o => (
              <Link key={o.id} to={`/azienda/ordini-acquisto/${o.id}`}
                    className="block rounded-lg border border-border p-2.5 transition-colors hover:bg-muted/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">
                    {o.oda_number || "Bozza"} · {o.supplier?.name ?? "—"}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {STATO_LABEL[o.status] ?? o.status}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {o.actual_delivery_date
                    ? `Arrivata il ${dataIt(o.actual_delivery_date)}`
                    : o.expected_delivery_date
                      ? `Attesa per il ${dataIt(o.expected_delivery_date)}`
                      : "Data di arrivo non ancora indicata"}
                  <ExternalLink className="ml-1 inline h-3 w-3" />
                </p>
              </Link>
            ))}
          </div>
        )}
      </CardContent>

      <OrdinaMerceDialog
        open={aperto}
        onOpenChange={setAperto}
        ticketId={ticketId}
        orderId={orderId}
        companyId={companyId}
      />
    </Card>
  );
}
