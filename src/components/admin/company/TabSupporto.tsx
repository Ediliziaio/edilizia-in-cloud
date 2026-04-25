import { useMemo, useState } from "react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Ticket, Plus, AlertCircle, Filter, AlertTriangle, Clock, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useTicketAzienda, type TicketRow,
} from "@/hooks/useTicketAzienda";
import { useAuth } from "@/contexts/AuthContext";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { NuovoTicketModal } from "./NuovoTicketModal";
import { cn } from "@/lib/utils";

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

/**
 * Item della lista ticket. Rinominato da `TicketRow` a `TicketListItem`
 * per evitare collision col TYPE `TicketRow` importato dal hook (TS le
 * separa nei namespace value/type ma il name shadowing crea confusione).
 */
function TicketListItem({
  ticket, onClick,
}: {
  ticket: TicketRow;
  onClick: () => void;
}) {
  const giorni = differenceInDays(new Date(), new Date(ticket.created_at));
  const priorita = prioritaConfig[ticket.priorita];
  const isStale =
    (ticket.stato === "aperto" || ticket.stato === "in_lavorazione") &&
    giorni > 7;

  return (
    <button
      type="button"
      className={cn(
        "w-full text-left flex items-start gap-3 py-3 px-1 hover:bg-muted/50 rounded-md transition-colors",
      )}
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
          {isStale && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300"
            >
              <Clock className="h-2.5 w-2.5 mr-0.5" />
              {giorni}gg
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium mt-1 truncate">{ticket.titolo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {giorni === 0
            ? "Aperto oggi"
            : `Aperto ${giorni} giorn${giorni === 1 ? "o" : "i"} fa`}
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
  const { user, profile } = useAuth();
  const { tickets, isLoading, isError, creaTicket, cambiaStato } = useTicketAzienda(companyId);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [statoFilter, setStatoFilter] = useState<TicketRow["stato"] | "tutti">("tutti");
  const [prioritaFilter, setPrioritaFilter] = useState<TicketRow["priorita"] | "tutti">("tutti");
  const [search, setSearch] = useState("");
  const [nuovoOpen, setNuovoOpen] = useState(false);

  // Nome operatore reale per audit trail (prima passato come undefined → null in DB)
  const operatorName = (() => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
    }
    return user?.email ?? null;
  })();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statoFilter !== "tutti" && t.stato !== statoFilter) return false;
      if (prioritaFilter !== "tutti" && t.priorita !== prioritaFilter) return false;
      if (q) {
        const hay = `${t.titolo ?? ""} ${t.categoria ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, statoFilter, prioritaFilter, search]);

  const openCount = tickets.filter((t) => t.stato === "aperto" || t.stato === "in_lavorazione").length;

  // KPI counts: aperti, urgenti, vecchi (>7gg aperti), risolti
  const kpi = useMemo(() => {
    const today = new Date();
    return {
      open: openCount,
      urgent: tickets.filter(
        (t) =>
          t.priorita === "urgente" &&
          (t.stato === "aperto" || t.stato === "in_lavorazione"),
      ).length,
      stale: tickets.filter(
        (t) =>
          (t.stato === "aperto" || t.stato === "in_lavorazione") &&
          differenceInDays(today, new Date(t.created_at)) > 7,
      ).length,
      resolved: tickets.filter(
        (t) => t.stato === "risolto" || t.stato === "chiuso",
      ).length,
    };
  }, [tickets, openCount]);

  const hasActiveFilters =
    statoFilter !== "tutti" || prioritaFilter !== "tutti" || !!search;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            Supporto
            {openCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1">
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

      {/* KPI strip */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            {
              label: "Aperti",
              value: kpi.open,
              icon: Ticket,
              accent: kpi.open > 0 ? "text-amber-600" : "text-muted-foreground",
              bg: kpi.open > 0 ? "bg-amber-500/10" : "bg-muted",
            },
            {
              label: "Urgenti",
              value: kpi.urgent,
              icon: AlertTriangle,
              accent: kpi.urgent > 0 ? "text-destructive" : "text-muted-foreground",
              bg: kpi.urgent > 0 ? "bg-rose-500/10" : "bg-muted",
            },
            {
              label: "Vecchi (>7gg)",
              value: kpi.stale,
              icon: Clock,
              accent: kpi.stale > 0 ? "text-amber-600" : "text-muted-foreground",
              bg: kpi.stale > 0 ? "bg-amber-500/10" : "bg-muted",
            },
            {
              label: "Risolti",
              value: kpi.resolved,
              icon: CheckCircle2,
              accent: "text-emerald-600",
              bg: "bg-emerald-500/10",
            },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={cn("rounded-lg p-2", k.bg)}>
                  <k.icon className={cn("h-3.5 w-3.5", k.accent)} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {k.label}
                  </p>
                  <p className={cn("text-lg font-bold leading-tight", k.accent)}>
                    {k.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per titolo o categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-56 h-8 text-xs"
        />
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
        <Select
          value={prioritaFilter}
          onValueChange={(v) =>
            setPrioritaFilter(v as TicketRow["priorita"] | "tutti")
          }
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Priorità" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti" className="text-xs">
              Tutte priorità
            </SelectItem>
            <SelectItem value="urgente" className="text-xs">Urgente</SelectItem>
            <SelectItem value="alta" className="text-xs">Alta</SelectItem>
            <SelectItem value="normale" className="text-xs">Normale</SelectItem>
            <SelectItem value="bassa" className="text-xs">Bassa</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setStatoFilter("tutti");
              setPrioritaFilter("tutti");
              setSearch("");
            }}
          >
            Reset
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} di {tickets.length}
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
                {/* FIX: empty state contestuale: distingue "nessun ticket totale"
                    da "filtri attivi → 0 risultati". Prima diceva sempre "Nessun
                    ticket con stato X" anche se era la priorità o la search. */}
                {tickets.length === 0
                  ? "Nessun ticket per questa azienda"
                  : "Nessun ticket corrisponde ai filtri correnti"}
              </p>
              {tickets.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setNuovoOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Crea il primo ticket
                </Button>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 text-xs"
                  onClick={() => {
                    setStatoFilter("tutti");
                    setPrioritaFilter("tutti");
                    setSearch("");
                  }}
                >
                  Reset filtri
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => (
                <TicketListItem
                  key={t.id}
                  ticket={t}
                  onClick={() => setSelectedTicket(t)}
                />
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
        // FIX: nuovo signature passa callbacks separati così il modale può
        // resettare lo state SOLO su success (prima reset pre-success → data
        // loss su failure). Inoltre passa aperto_da_nome per audit reale.
        onSubmit={(data, callbacks) =>
          creaTicket.mutate(
            {
              ...data,
              company_id: companyId,
              aperto_da_nome: operatorName ?? undefined,
            },
            { onSuccess: callbacks.onSuccess },
          )
        }
        isLoading={creaTicket.isPending}
      />
    </div>
  );
}
