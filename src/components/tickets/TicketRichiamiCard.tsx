/**
 * Richiami del cliente sullo stesso intervento.
 *
 * Richiesta Ke Bei: «nel caso lo stesso cliente chiami più volte ci serve un
 * posto dove segnalare che ha telefonato più volte per la stessa Assistenza».
 * Prima finiva nelle note libere e non si poteva né contare né ordinare.
 *
 * Il contatore si incrementa con la RPC `ticket_segna_richiamo` (atomica: due
 * persone in ufficio possono premere insieme senza perdere un conteggio).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { queryKeys } from "@/lib/queryKeys";

interface TicketRichiami {
  richiami_count?: number | null;
  ultimo_richiamo_at?: string | null;
  note_richiami?: string | null;
}

/** Da 3 solleciti in su il cliente sta aspettando troppo: si vede a colpo d'occhio. */
const SOGLIA_ATTENZIONE = 3;

export function TicketRichiamiCard({
  ticketId,
  ticket,
}: {
  ticketId: string;
  ticket: TicketRichiami;
}) {
  const queryClient = useQueryClient();
  const [nota, setNota] = useState("");
  const [aperto, setAperto] = useState(false);

  const conteggio = ticket.richiami_count ?? 0;
  const insistente = conteggio >= SOGLIA_ATTENZIONE;

  const segna = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ticket_segna_richiamo" as never, {
        p_ticket_id: ticketId,
        p_nota: nota.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNota("");
      setAperto(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
      toast.success("Richiamo registrato");
    },
    onError: (e) => toast.error("Richiamo non registrato", { description: userErrorMessage(e) }),
  });

  return (
    <Card className={insistente ? "border-amber-300" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PhoneCall className={`h-4 w-4 ${insistente ? "text-amber-600" : "text-muted-foreground"}`} />
            <h3 className="text-sm font-semibold">Richiami del cliente</h3>
          </div>
          {conteggio > 0 && (
            <Badge className={insistente ? "bg-amber-500 text-white" : "bg-muted text-foreground"}>
              {conteggio} {conteggio === 1 ? "volta" : "volte"}
            </Badge>
          )}
        </div>

        {conteggio === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nessun sollecito. Segnalo ogni volta che il cliente richiama per questo stesso intervento.
          </p>
        ) : (
          <div className="space-y-2">
            <p className={`text-xs ${insistente ? "text-amber-700" : "text-muted-foreground"}`}>
              {insistente
                ? "Il cliente ha già sollecitato più volte: conviene richiamarlo prima che lo faccia lui."
                : "Il cliente ha già sollecitato."}
              {ticket.ultimo_richiamo_at && (
                <> Ultimo: <strong>{format(new Date(ticket.ultimo_richiamo_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}</strong>.</>
              )}
            </p>
            {ticket.note_richiami && (
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2 font-sans text-xs text-muted-foreground">
                {ticket.note_richiami}
              </pre>
            )}
          </div>
        )}

        {aperto ? (
          <div className="space-y-2">
            <Label className="text-xs">Cosa ha detto (facoltativo)</Label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Es. chiede quando arriva il tecnico"
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setAperto(false); setNota(""); }}>
                Annulla
              </Button>
              <Button size="sm" onClick={() => segna.mutate()} disabled={segna.isPending}>
                {segna.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Registra richiamo
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full" onClick={() => setAperto(true)}>
            <PhoneCall className="mr-1 h-3.5 w-3.5" /> Ha richiamato
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
