/**
 * Pipeline dell'assistenza: le lavorazioni aperte disposte per FASE.
 *
 * Perché per fase e non per stato: gli stati sono quindici, e quindici colonne
 * non stanno su nessuno schermo — si scorre in orizzontale e non si capisce
 * più dove sono le cose. Le quattro fasi (da valutare, in attesa, in corso,
 * chiusura) sono il livello a cui si ragiona davvero — "quante ne ho ferme in
 * attesa di qualcosa?" — e lo stato preciso resta scritto sulla card.
 *
 * Ogni card dice le tre cose che servono per decidere se agire: da quanto è
 * ferma, se ci sono soldi da prendere, se sta aspettando merce.
 */
import { Link } from "react-router-dom";
import { AlertCircle, Euro, Package, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TICKET_FASI, TICKET_STATI, type TicketFase } from "@/types/tickets";
import { calcolaFermo, CLASSI_FERMO } from "@/lib/assistenzaSla";

const TONO_BADGE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700", indigo: "bg-indigo-100 text-indigo-700",
  orange: "bg-orange-100 text-orange-700", green: "bg-green-100 text-green-700",
  slate: "bg-slate-100 text-slate-700",
};

export interface TicketPipeline {
  id: string;
  subject: string;
  status: string;
  priority?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  a_pagamento?: boolean | null;
  pagato?: boolean | null;
  importo_finale?: number | null;
  importo_preventivato?: number | null;
  merce_richiesta?: boolean | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
}

function faseDi(status: string): TicketFase | null {
  return TICKET_STATI.find((s) => s.value === status)?.fase ?? null;
}

function CardTicket({ t }: { t: TicketPipeline }) {
  const stato = TICKET_STATI.find((s) => s.value === t.status);
  const fermo = calcolaFermo(t as never);
  const importo = Number(t.importo_finale ?? t.importo_preventivato ?? 0);
  const cliente = [t.customer?.first_name, t.customer?.last_name].filter(Boolean).join(" ");

  return (
    <Link
      to={`/azienda/assistenza/${t.id}`}
      className="block rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t.subject}</p>
        {fermo && fermo.livello === "critico" && (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
        )}
      </div>
      {cliente && <p className="mt-0.5 truncate text-xs text-muted-foreground">{cliente}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge className={`text-[10px] ${TONO_BADGE[stato?.tone ?? "slate"]}`}>
          {stato?.label ?? t.status}
        </Badge>
        {t.merce_richiesta && (
          <span className="inline-flex items-center gap-1 text-[10px] text-purple-700">
            <Package className="h-3 w-3" /> merce
          </span>
        )}
        {t.a_pagamento && !t.pagato && importo > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700">
            <Euro className="h-3 w-3" />
            {importo.toLocaleString("it-IT", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>

      {fermo && (
        <p className={`mt-1.5 text-[10px] ${CLASSI_FERMO[fermo.livello]}`}>{fermo.etichetta}</p>
      )}
    </Link>
  );
}

export function AssistenzaPipeline({
  tickets, isLoading,
}: { tickets: TicketPipeline[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {TICKET_FASI.map((fase) => {
        const dellaFase = tickets.filter((t) => faseDi(t.status) === fase.key);
        const inRitardo = dellaFase.filter((t) => {
          const f = calcolaFermo(t as never);
          return f !== null && f.livello !== "ok";
        }).length;
        const soldi = dellaFase
          .filter((t) => t.a_pagamento && !t.pagato)
          .reduce((s, t) => s + Number(t.importo_finale ?? t.importo_preventivato ?? 0), 0);

        return (
          <Card key={fase.key} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{fase.label}</CardTitle>
                <Badge variant="secondary" className="text-xs">{dellaFase.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {inRitardo > 0 && <span className="text-red-600">{inRitardo} in ritardo</span>}
                {soldi > 0 && (
                  <span>{soldi.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} da incassare</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              {dellaFase.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Niente qui</p>
              ) : (
                dellaFase
                  .slice()
                  .sort((a, b) => (calcolaFermo(b as never)?.giorni ?? 0) - (calcolaFermo(a as never)?.giorni ?? 0))
                  .map((t) => <CardTicket key={t.id} t={t} />)
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
