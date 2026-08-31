/**
 * Pagamento dell'assistenza: se l'intervento si fa pagare, quanto, e se è stato
 * incassato. Prima queste informazioni vivevano solo nelle note interne, quindi
 * non erano né filtrabili né sommabili.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Euro, Check, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TICKET_MOTIVI_GRATUITO } from "@/types/tickets";

const METODI = ["Bonifico", "Contanti", "Carta", "Assegno", "Altro"];

export interface TicketPagamento {
  customer_id?: string | null;
  order_id?: string | null;
  subject?: string | null;
  scadenza_id?: string | null;
  a_pagamento?: boolean | null;
  motivo_gratuito?: string | null;
  importo_preventivato?: number | null;
  importo_finale?: number | null;
  pagato?: boolean | null;
  data_pagamento?: string | null;
  metodo_pagamento?: string | null;
  note_pagamento?: string | null;
}

export function TicketPagamentoCard({ ticketId, ticket, companyId }: { ticketId: string; ticket: TicketPagamento; companyId: string }) {
  const qc = useQueryClient();
  const [aPagamento, setAPagamento] = useState(!!ticket.a_pagamento);
  const [motivo, setMotivo] = useState(ticket.motivo_gratuito ?? "garanzia");
  const [preventivato, setPreventivato] = useState(ticket.importo_preventivato?.toString() ?? "");
  const [finale, setFinale] = useState(ticket.importo_finale?.toString() ?? "");
  const [metodo, setMetodo] = useState(ticket.metodo_pagamento ?? "");
  const [note, setNote] = useState(ticket.note_pagamento ?? "");
  const pagato = !!ticket.pagato;

  const salva = useMutation({
    mutationFn: async (extra: Record<string, unknown> = {}) => {
      const { error } = await supabase
        .from("tickets")
        .update({
          a_pagamento: aPagamento,
          motivo_gratuito: aPagamento ? null : motivo,
          importo_preventivato: aPagamento && preventivato ? Number(preventivato) : null,
          importo_finale: aPagamento && finale ? Number(finale) : null,
          metodo_pagamento: aPagamento ? (metodo || null) : null,
          note_pagamento: note.trim() || null,
          ...extra,
        } as never)
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Pagamento aggiornato");
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a salvare il pagamento"),
  });

  /**
   * Porta l'importo nello scadenzario come incasso atteso. Senza questo passo
   * il "da incassare" resta un'annotazione sul ticket: non entra nei conti
   * dell'azienda e nessuno lo insegue.
   */
  const mandaAScadenzario = useMutation({
    mutationFn: async () => {
      const importo = Number(finale || preventivato || 0);
      if (!importo) throw new Error("Indica prima l'importo dell'intervento");
      const scadenzaFra30 = new Date();
      scadenzaFra30.setDate(scadenzaFra30.getDate() + 30);
      const { data, error } = await supabase
        .from("scadenze")
        .insert({
          company_id: companyId,
          ticket_id: ticketId,
          order_id: ticket.order_id ?? null,
          contact_id: ticket.customer_id ?? null,
          tipo: "incasso_cliente",
          direction: "entrata",
          description: `Assistenza — ${ticket.subject ?? "intervento"}`,
          amount: importo,
          due_date: scadenzaFra30.toISOString().slice(0, 10),
          status: "da_pagare",
          notes: "Generata dalla scheda assistenza",
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const { error: tErr } = await supabase
        .from("tickets")
        .update({ scadenza_id: (data as { id: string }).id, status: "da_fatturare" } as never)
        .eq("id", ticketId);
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      qc.invalidateQueries({ queryKey: ["scadenze"] });
      toast.success("Incasso messo a scadenzario (30 giorni)");
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a creare la scadenza"),
  });

  const incassa = () => {
    if (!finale && !preventivato) {
      toast.error("Prima indica l'importo dell'intervento");
      return;
    }
    salva.mutate({
      pagato: true,
      data_pagamento: new Date().toISOString().slice(0, 10),
      importo_finale: Number(finale || preventivato),
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Euro className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pagamento</h3>
          </div>
          {aPagamento && (
            pagato
              ? <Badge className="bg-green-100 text-green-700">Incassato</Badge>
              : <Badge className="bg-amber-100 text-amber-700">Da incassare</Badge>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs text-muted-foreground">Intervento a pagamento</Label>
          <Switch checked={aPagamento} onCheckedChange={setAPagamento} disabled={pagato} />
        </div>

        {!aPagamento ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Perché non si paga</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_MOTIVI_GRATUITO.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Preventivato (€)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" className="h-9"
                       value={preventivato} onChange={e => setPreventivato(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Finale (€)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" className="h-9"
                       value={finale} onChange={e => setFinale(e.target.value)} disabled={pagato} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Metodo</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Da definire" /></SelectTrigger>
                <SelectContent>
                  {METODI.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {pagato && ticket.data_pagamento && (
              <p className="text-xs text-muted-foreground">
                Incassato il {new Date(ticket.data_pagamento).toLocaleDateString("it-IT")}
                {ticket.metodo_pagamento ? ` · ${ticket.metodo_pagamento}` : ""}
              </p>
            )}
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Note</Label>
          <Input className="h-9" value={note} onChange={e => setNote(e.target.value)}
                 placeholder="Es. da fatturare a fine mese" />
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => salva.mutate({})} disabled={salva.isPending}>
            {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
          </Button>
          {aPagamento && !pagato && (
            <Button size="sm" className="flex-1" onClick={incassa} disabled={salva.isPending}>
              <Check className="mr-1 h-4 w-4" /> Segna incassato
            </Button>
          )}
        </div>

        {aPagamento && !pagato && (
          ticket.scadenza_id ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Incasso già a scadenzario.
            </p>
          ) : (
            <Button size="sm" variant="ghost" className="w-full text-xs"
                    onClick={() => mandaAScadenzario.mutate()} disabled={mandaAScadenzario.isPending}>
              {mandaAScadenzario.isPending
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <CalendarClock className="mr-1 h-3.5 w-3.5" />}
              Metti a scadenzario (30 gg)
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
