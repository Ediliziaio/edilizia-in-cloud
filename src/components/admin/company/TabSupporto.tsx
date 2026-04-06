import { useState } from "react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Ticket, Plus, AlertCircle, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTicketAzienda, type TicketRow } from "@/hooks/useTicketAzienda";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { NuovoTicketModal } from "./NuovoTicketModal";

interface TabSupportoProps {
  companyId: string;
}

const prioritaConfig: Record<
  TicketRow["priorita"],
  { label: string; className: string }
> = {
  urgente: { label: "Urgente", className: "bg-red-100 text-red-700 border-red-200" },
  alta: { label: "Alta", className: "bg-orange-100 text-orange-700 border-orange-200" },
  normale: { label: "Normale", className: "bg-gray-100 text-gray-700 border-gray-200" },
  bassa: { label: "Bassa", className: "bg-green-100 text-green-700 border-green-200" },
};

const statoLabels: Record<TicketRow["stato"] | "tutti", string> = {
  tutti: "Tutti",
  aperto: "Aperti",
  in_lavorazione: "In lavorazione",
  in_attesa: "In attesa",
  risolto: "Risolti",
  chiuso: "Chiusi",
};

function TicketRow({ ticket, onClick }: { ticket: TicketRow; onClick: () => void }) {
  const giorni = differenceInDays(new Date(), new Date(ticket.created_at));
  const priorita = prioritaConfig[ticket.priorita];

  return (
    <button
      className="w-full text-left flex items-start gap-3 py-3 px-1 hover:bg-muted/50 rounded-md transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-xs ${priorita.className}`}>
            {priorita.label}
          </Badge>
          {ticket.categoria && ticket.categoria !== "generale" && (
            <Badge variant="secondary" className="text-xs">{ticket.categoria}</Badge>
          )}
        </div>
        <p className="text-sm font-medium mt-1 truncate">{ticket.titolo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {giorni === 0 ? "Aperto oggi" : `Aperto ${giorni} giorn${giorni === 1 ? "o" : "i"} fa`}
          {ticket.assegnato_a_nome && ` · Assegnato a ${ticket.assegnato_a_nome}`}
        </p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 mt-1">
        {format(new Date(ticket.created_at), "dd/MM/yyyy", { locale: it })}
      </span>
    </button>
  );
}

export function TabSupporto({ companyId }: TabSupportoProps) {
  const { tickets, isLoading, isError, creaTicket, cambiaStato } = useTicketAzienda(companyId);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [statoFilter, setStatoFilter] = useState<TicketRow["stato"] | "tutti">("tutti");
  const [nuovoOpen, setNuovoOpen] = useState(false);

  const filtered =
    statoFilter === "tutti" ? tickets : tickets.filter((t) => t.stato === statoFilter);

  const openCount = tickets.filter((t) => t.stato === "aperto" || t.stato === "in_lavorazione").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            Supporto
            {openCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                {openCount}
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">Ticket di supporto per questa azienda</p>
        </div>
        <Button size="sm" onClick={() => setNuovoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Ticket
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select
          value={statoFilter}
          onValueChange={(v) => setStatoFilter(v as TicketRow["stato"] | "tutti")}
        >
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(statoLabels) as (TicketRow["stato"] | "tutti")[]).map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {statoLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Impossibile caricare i ticket</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <Ticket className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {statoFilter === "tutti"
                  ? "Nessun ticket per questa azienda"
                  : `Nessun ticket con stato "${statoLabels[statoFilter]}"`}
              </p>
              {statoFilter === "tutti" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setNuovoOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Crea il primo ticket
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => (
                <TicketRow key={t.id} ticket={t} onClick={() => setSelectedTicket(t)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TicketDetailDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onCambiaStato={(ticketId, stato) => {
          cambiaStato.mutate(
            { ticketId, stato },
            {
              onSuccess: () =>
                setSelectedTicket((prev) => (prev ? { ...prev, stato } : prev)),
            }
          );
        }}
        isChangingState={cambiaStato.isPending}
      />

      <NuovoTicketModal
        open={nuovoOpen}
        onOpenChange={setNuovoOpen}
        onSubmit={(data) =>
          creaTicket.mutate({ ...data, company_id: companyId }, { onSuccess: () => setNuovoOpen(false) })
        }
        isLoading={creaTicket.isPending}
      />
    </div>
  );
}
