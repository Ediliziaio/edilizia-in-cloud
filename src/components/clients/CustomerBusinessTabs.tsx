import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Euro, Ticket, FileText, ExternalLink,
  CalendarDays, CreditCard, FileSignature, Wrench, Link2, Plus,
  AlertTriangle, FileCheck2, FileWarning,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { KpiMini } from "./KpiMini";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  /** Schema reale (migration 20260809000001_interventi.sql): la colonna è
   *  `descrizione`, non `tipo_intervento`. Mantenere allineato. */
  descrizione: string;
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

interface CustomerDocumentRow {
  id: string;
  document_type: "contract" | "identity" | "fiscal_code" | "other";
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

const CUSTOMER_DOCUMENT_BUCKET = "customer-documents";
const CUSTOMER_DOCUMENT_LABELS: Record<CustomerDocumentRow["document_type"], string> = {
  contract: "Contratto",
  identity: "Documento identità",
  fiscal_code: "Codice fiscale",
  other: "Altro",
};
const EXPECTED_CUSTOMER_DOCUMENTS: Array<CustomerDocumentRow["document_type"]> = ["contract", "identity", "fiscal_code"];

type CustomerDocumentsQueryClient = {
  from: (table: "customer_documents") => {
    select: (columns: string) => {
      eq: (column: "customer_id", value: string) => {
        order: (
          column: "created_at",
          options: { ascending: boolean },
        ) => Promise<{ data: CustomerDocumentRow[] | null; error: Error | null }>;
      };
    };
  };
};

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
  dataWarnings?: {
    anagrafica?: string | null;
    fatture?: string | null;
    preventivi?: string | null;
    tickets?: string | null;
    rapportini?: string | null;
    appuntamenti?: string | null;
    rate?: string | null;
  };
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
          onClick={() => navigate(`/azienda/assistenza/${item.id}`)}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{item.descrizione || "Intervento"}</p>
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
  customerDocuments,
  anagraficaCollegata,
}: {
  fatture: FatturaRow[];
  customerDocuments: CustomerDocumentRow[];
  anagraficaCollegata: { id: string; ragione_sociale: string | null } | null;
}) {
  const navigate = useNavigate();
  const uploadedTypes = new Set(customerDocuments.map((doc) => doc.document_type));
  const missingTypes = EXPECTED_CUSTOMER_DOCUMENTS.filter((type) => !uploadedTypes.has(type));

  const openCustomerDocument = async (doc: CustomerDocumentRow) => {
    const { data, error } = await supabase.storage
      .from(CUSTOMER_DOCUMENT_BUCKET)
      .createSignedUrl(doc.file_path, 60 * 5);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (!anagraficaCollegata && customerDocuments.length === 0) {
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Fascicolo cliente</p>
            <p className="text-xs text-muted-foreground">Contratto, identità e CF: presenti o da recuperare.</p>
          </div>
          <Badge variant={missingTypes.length ? "outline" : "default"} className="text-xs">
            {customerDocuments.length}/{EXPECTED_CUSTOMER_DOCUMENTS.length} caricati
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {EXPECTED_CUSTOMER_DOCUMENTS.map((type) => {
            const doc = customerDocuments.find((item) => item.document_type === type);
            return (
              <button
                key={type}
                type="button"
                disabled={!doc}
                onClick={() => doc && openCustomerDocument(doc)}
                className="rounded-md border p-2 text-left transition-colors enabled:hover:bg-muted/50 disabled:cursor-default"
              >
                <div className="flex items-center gap-2">
                  {doc ? <FileCheck2 className="h-4 w-4 text-emerald-600" /> : <FileWarning className="h-4 w-4 text-amber-600" />}
                  <span className="text-xs font-medium">{CUSTOMER_DOCUMENT_LABELS[type]}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {doc ? doc.file_name : "Mancante"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {fatture.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
          {anagraficaCollegata && (
            <p className="text-xs text-muted-foreground mb-1">
              Collegata a: {anagraficaCollegata.ragione_sociale}
            </p>
          )}
          <p className="text-sm font-medium text-muted-foreground">Nessun documento fiscale trovato</p>
          <p className="text-xs text-muted-foreground mt-1">Fatture e note appariranno qui quando disponibili</p>
        </div>
      ) : (
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
      )}
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
  dataWarnings,
}: CustomerBusinessTabsProps) {
  useAuth();
  const navigate = useNavigate();
  const { data: customerDocuments = [] } = useQuery({
    queryKey: ["customer-documents", customerId],
    queryFn: async () => {
      const customerDocumentsClient = supabase as unknown as CustomerDocumentsQueryClient;
      const { data, error } = await customerDocumentsClient
        .from("customer_documents")
        .select("id, document_type, file_name, file_path, file_type, file_size, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CustomerDocumentRow[];
    },
    enabled: !!customerId,
  });

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
        <KpiMini icon={FileText} label="Documenti" value={fatture.length + customerDocuments.length} color="purple" />
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

      {dataWarnings && Object.values(dataWarnings).some(Boolean) && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Alcuni collegamenti cliente non sono stati caricati.</p>
              {Object.entries(dataWarnings)
                .filter(([, message]) => Boolean(message))
                .map(([key, message]) => (
                  <p key={key}>{message}</p>
                ))}
            </div>
          </div>
        </div>
      )}

      <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 h-auto mb-2">
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
          Documenti ({fatture.length + customerDocuments.length})
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
        <DocumentiTab
          fatture={fatture}
          customerDocuments={customerDocuments}
          anagraficaCollegata={anagraficaCollegata}
        />
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
