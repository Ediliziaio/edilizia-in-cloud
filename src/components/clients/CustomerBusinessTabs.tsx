import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Euro, Ticket, FileText, ExternalLink,
  CalendarDays, CreditCard, FileSignature, Wrench, Link2, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { KpiMini } from "./KpiMini";
import { useAuth } from "@/contexts/AuthContext";

// ── Row types ────────────────────────────────────────────────────────────────

export interface OrderRow {
  id: string;
  order_code: string | null;
  description: string | null;
  total_amount: number | null;
  created_at: string;
  current_status_id: string | null;
  order_statuses: { name: string; color: string } | null;
}

export interface PreventivoRow {
  id: string;
  quote_number: string | null;
  title: string | null;
  total: number | null;
  status: string | null;
  created_at: string;
}

export interface TicketRow {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  created_at: string;
}

export interface RapportinoRow {
  id: string;
  created_at: string;
  tipo_intervento: string | null;
  note: string | null;
}

export interface FatturaRow {
  id: string;
  tipo: string;
  numero: string | null;
  data_emissione: string | null;
  stato: string | null;
  totale_documento: number | null;
}

export interface AppuntamentoRow {
  id: string;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
}

export interface RataRow {
  id: string;
  amount: number | null;
  due_date: string | null;
  paid_at: string | null;
  order_id: string | null;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CustomerBusinessTabsProps {
  customerId: string;
  companyId: string;
  customerFullName?: string;
  orders: OrderRow[];
  preventivi: PreventivoRow[];
  tickets: TicketRow[];
  rapportini: RapportinoRow[];
  fatture: FatturaRow[];
  appuntamenti: AppuntamentoRow[];
  rate: RataRow[];
  anagraficaCollegata: { id: string; ragione_sociale: string | null } | null;
  totalOrderValue: number;
  openTicketsCount: number;
}

// Helper: costruisce URL di creazione entità con cliente pre-selezionato
// via search params (le pagine target possono leggere `customer_id`).
function buildCreateUrl(base: string, customerId: string, customerName?: string): string {
  const u = new URL(base, window.location.origin);
  u.searchParams.set("customer_id", customerId);
  if (customerName) u.searchParams.set("customer_name", customerName);
  return `${u.pathname}${u.search}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: it });
  } catch {
    return "—";
  }
}

function EmptyState({
  icon: Icon,
  label,
  actionLabel,
  actionHref,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">Nessun {label} trovato</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        {actionHref ? "Crealo ora e verrà collegato a questo cliente." : "Apparirà qui quando sarà disponibile."}
      </p>
      {actionHref && (
        <Button variant="outline" size="sm" onClick={() => navigate(actionHref)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {actionLabel ?? `Crea ${label}`}
        </Button>
      )}
    </div>
  );
}

// ── Tab content components ────────────────────────────────────────────────────

function OrdiniTab({ orders, customerId, customerFullName }: { orders: OrderRow[]; customerId: string; customerFullName?: string }) {
  const navigate = useNavigate();
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        label="ordine"
        actionLabel="Crea ordine"
        actionHref={buildCreateUrl("/azienda/ordini/nuovo", customerId, customerFullName)}
      />
    );
  }
  return (
    <div className="space-y-1">
      {orders.map((order) => {
        const status = order.order_statuses;
        return (
          <div
            key={order.id}
            className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
            onClick={() => navigate(`/azienda/ordini/${order.id}`)}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{order.order_code || "—"}</p>
              <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {status && (
                <Badge variant="outline" className="text-xs gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                  {status.name}
                </Badge>
              )}
              {order.total_amount != null && (
                <span className="text-sm font-medium whitespace-nowrap">
                  € {Number(order.total_amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                </span>
              )}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PreventiviTab({ items, customerId, customerFullName }: { items: PreventivoRow[]; customerId: string; customerFullName?: string }) {
  const navigate = useNavigate();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        label="preventivo"
        actionLabel="Crea preventivo"
        actionHref={buildCreateUrl("/azienda/marketing/preventivi/nuovo", customerId, customerFullName)}
      />
    );
  }
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => navigate(`/azienda/marketing/preventivi/${item.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.quote_number || item.title || "—"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.status && <Badge variant="outline" className="text-xs">{item.status}</Badge>}
            {item.total != null && (
              <span className="text-sm font-medium whitespace-nowrap">
                € {Number(item.total).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            )}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AssistenzaTab({ tickets, customerId, customerFullName }: { tickets: TicketRow[]; customerId: string; customerFullName?: string }) {
  const navigate = useNavigate();
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        label="ticket"
        actionLabel="Apri ticket"
        actionHref={buildCreateUrl("/azienda/assistenza/nuovo", customerId, customerFullName)}
      />
    );
  }
  return (
    <div className="space-y-1">
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => navigate(`/azienda/assistenza/${ticket.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{ticket.title || "—"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(ticket.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ticket.status && <Badge variant="outline" className="text-xs">{ticket.status}</Badge>}
            {ticket.priority && <Badge variant="secondary" className="text-xs">{ticket.priority}</Badge>}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InterventiTab({ items }: { items: RapportinoRow[] }) {
  const navigate = useNavigate();
  if (items.length === 0) return <EmptyState icon={Wrench} label="intervento" />;
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => navigate(`/azienda/interventi/${item.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.tipo_intervento || "Intervento"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(item.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.note && (
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">{item.note}</span>
            )}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentiTab({
  fatture,
  anagraficaCollegata,
}: {
  fatture: FatturaRow[];
  anagraficaCollegata: { id: string; ragione_sociale: string | null } | null;
}) {
  const navigate = useNavigate();

  if (!anagraficaCollegata) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nessuna anagrafica fiscale collegata</p>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/azienda/fatturazione")}
        >
          <Link2 className="h-3.5 w-3.5" />
          Vai a Riconciliazione
        </Button>
      </div>
    );
  }

  if (fatture.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-xs text-muted-foreground mb-1">
          Collegata a: {anagraficaCollegata.ragione_sociale}
        </p>
        <p className="text-sm font-medium text-muted-foreground">Nessun documento trovato</p>
        <p className="text-xs text-muted-foreground mt-1">Apparirà qui quando sarà disponibile</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {fatture.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => navigate(`/azienda/documenti/${f.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{f.numero || "—"}</p>
            <p className="text-xs text-muted-foreground">{f.data_emissione?.substring(0, 10) ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {f.stato && <Badge variant="outline" className="text-xs">{f.stato}</Badge>}
            {f.totale_documento != null && (
              <span className="text-sm font-medium whitespace-nowrap">
                € {Number(f.totale_documento).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            )}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AppuntamentiTab({ items, customerId, customerFullName }: { items: AppuntamentoRow[]; customerId: string; customerFullName?: string }) {
  const navigate = useNavigate();
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        label="appuntamento"
        actionLabel="Nuovo appuntamento"
        actionHref={buildCreateUrl("/azienda/calendario", customerId, customerFullName)}
      />
    );
  }
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => navigate(`/azienda/calendario`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.title || "Appuntamento"}</p>
            <p className="text-xs text-muted-foreground">{formatDate(item.start_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.status && <Badge variant="outline" className="text-xs">{item.status}</Badge>}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RateTab({ rate }: { rate: RataRow[] }) {
  if (rate.length === 0) return <EmptyState icon={CreditCard} label="rata" />;
  return (
    <div className="space-y-1">
      {rate.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between gap-2 p-2.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Rata</p>
            <p className="text-xs text-muted-foreground">Scadenza: {formatDate(r.due_date)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={r.paid_at ? "secondary" : "outline"} className="text-xs">
              {r.paid_at ? "Pagata" : "In attesa"}
            </Badge>
            {r.amount != null && (
              <span className="text-sm font-medium whitespace-nowrap">
                € {Number(r.amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerBusinessTabs({
  customerId,
  customerFullName,
  orders,
  preventivi,
  tickets,
  rapportini,
  fatture,
  appuntamenti,
  rate,
  anagraficaCollegata,
  totalOrderValue,
  openTicketsCount,
}: CustomerBusinessTabsProps) {
  useAuth();
  const navigate = useNavigate();

  // Quick actions bar
  const quickActions: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: "Ordine",      href: buildCreateUrl("/azienda/ordini/nuovo", customerId, customerFullName),       icon: ClipboardList },
    { label: "Preventivo",  href: buildCreateUrl("/azienda/marketing/preventivi/nuovo", customerId, customerFullName), icon: FileSignature },
    { label: "Appuntamento", href: buildCreateUrl("/azienda/calendario", customerId, customerFullName),         icon: CalendarDays },
    { label: "Ticket",      href: buildCreateUrl("/azienda/assistenza/nuovo", customerId, customerFullName),    icon: Ticket },
  ];

  return (
    <Tabs defaultValue="ordini">
      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiMini icon={ClipboardList} label="Ordini" value={orders.length} color="blue" />
        <KpiMini
          icon={Euro}
          label="Valore totale"
          value={`€ ${totalOrderValue.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`}
          color="green"
        />
        <KpiMini
          icon={Ticket}
          label="Ticket aperti"
          value={openTicketsCount}
          color={openTicketsCount > 0 ? "orange" : "green"}
        />
        <KpiMini icon={FileText} label="Documenti" value={fatture.length} color="purple" />
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3 p-2 rounded-lg border bg-muted/30">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mr-1">Crea per questo cliente:</span>
        {quickActions.map((a) => (
          <Button
            key={a.label}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => navigate(a.href)}
          >
            <Plus className="h-3 w-3 mr-1" />
            <a.icon className="h-3 w-3 mr-1" />
            {a.label}
          </Button>
        ))}
      </div>

      <TabsList className="grid grid-cols-4 lg:grid-cols-7 h-auto mb-2">
        <TabsTrigger value="ordini" className="text-xs px-1">
          Ordini ({orders.length})
        </TabsTrigger>
        <TabsTrigger value="preventivi" className="text-xs px-1">
          Preventivi ({preventivi.length})
        </TabsTrigger>
        <TabsTrigger value="assistenza" className="text-xs px-1">
          Assistenza ({tickets.length})
        </TabsTrigger>
        <TabsTrigger value="interventi" className="text-xs px-1">
          Interventi ({rapportini.length})
        </TabsTrigger>
        <TabsTrigger value="documenti" className="text-xs px-1">
          Documenti ({fatture.length})
        </TabsTrigger>
        <TabsTrigger value="appuntamenti" className="text-xs px-1">
          Appuntamenti ({appuntamenti.length})
        </TabsTrigger>
        <TabsTrigger value="rate" className="text-xs px-1">
          Rate ({rate.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ordini">
        <OrdiniTab orders={orders} customerId={customerId} customerFullName={customerFullName} />
      </TabsContent>
      <TabsContent value="preventivi">
        <PreventiviTab items={preventivi} customerId={customerId} customerFullName={customerFullName} />
      </TabsContent>
      <TabsContent value="assistenza">
        <AssistenzaTab tickets={tickets} customerId={customerId} customerFullName={customerFullName} />
      </TabsContent>
      <TabsContent value="interventi">
        <InterventiTab items={rapportini} />
      </TabsContent>
      <TabsContent value="documenti">
        <DocumentiTab fatture={fatture} anagraficaCollegata={anagraficaCollegata} />
      </TabsContent>
      <TabsContent value="appuntamenti">
        <AppuntamentiTab items={appuntamenti} customerId={customerId} customerFullName={customerFullName} />
      </TabsContent>
      <TabsContent value="rate">
        <RateTab rate={rate} />
      </TabsContent>
    </Tabs>
  );
}
