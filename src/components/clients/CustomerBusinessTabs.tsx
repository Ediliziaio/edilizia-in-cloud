import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, Ticket, FileText, ExternalLink,
  CalendarDays, CreditCard, FileSignature, Wrench, Link2, Plus,
  AlertTriangle, FileCheck2, FileWarning, Mail, MessageSquare, Paperclip, Sparkles,
  PencilLine,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
// KpiMini rimosso (2026-05-27): le KPI sono già nell'header CompanyCustomerDetail.
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposeDialog, type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";

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

interface CustomerEmailConversationRow {
  id: string | null;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string | null;
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  attachments: unknown;
  is_read: boolean | null;
  preview: string | null;
  status: string | null;
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
  customerEmail?: string | null;
  orders: OrderRow[];
  preventivi: PreventivoRow[];
  tickets: TicketRow[];
  rapportini: RapportinoRow[];
  fatture: FatturaRow[];
  appuntamenti: AppuntamentoRow[];
  rate: RataRow[];
  anagraficaCollegata: { id: string; ragione_sociale: string | null } | null;
  /** @deprecated 2026-05-27: KPI rimossa, già nell'header. Resta per backcompat parent. */
  totalOrderValue?: number;
  /** @deprecated 2026-05-27: KPI rimossa, già nell'header. Resta per backcompat parent. */
  openTicketsCount?: number;
  /**
   * Tab da pre-selezionare quando il componente viene aperto da fuori
   * (es. dal pannello laterale destro del layout 3-col). Default "ordini".
   */
  defaultTab?: string;
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

function normalizeEmailForLookup(email: string | null | undefined): string | null {
  const value = (email ?? "").trim().toLowerCase();
  return value.includes("@") ? value : null;
}

function hasEmailAttachments(attachments: unknown): boolean {
  return Array.isArray(attachments) && attachments.length > 0;
}

function emailCategoryLabel(category: string | null): string | null {
  if (!category) return null;
  const labels: Record<string, string> = {
    lead: "Lead",
    lead_new: "Lead",
    lead_followup: "Follow-up",
    cliente_esistente: "Cliente",
    customer: "Cliente",
    fornitore: "Fornitore",
    supplier: "Fornitore",
    ddt: "DDT",
    fattura: "Fattura",
    invoice: "Fattura",
    quote_request: "Preventivo",
    preventivo: "Preventivo",
    richiesta_preventivo: "Preventivo",
    support: "Supporto",
    assistenza: "Supporto",
    ticket: "Ticket",
  };
  return labels[category] ?? category.replace(/_/g, " ");
}

async function fetchCustomerEmailConversations(
  companyId: string,
  normalizedEmail: string,
): Promise<CustomerEmailConversationRow[]> {
  const selectColumns = [
    "id",
    "thread_id",
    "from_email",
    "from_name",
    "to_email",
    "subject",
    "received_at",
    "ai_category",
    "ai_priority",
    "ai_summary",
    "attachments",
    "is_read",
    "preview",
    "status",
  ].join(", ");

  // La view v_my_email_inbox è già filtrata su auth.uid(): qui aggiungiamo solo
  // il match operativo sul cliente, senza esporre caselle di altri utenti.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const baseQuery = () =>
    client
      .from("v_my_email_inbox")
      .select(selectColumns)
      .eq("company_id", companyId)
      .order("received_at", { ascending: false })
      .limit(25);

  const [fromResult, toResult] = await Promise.all([
    baseQuery().ilike("from_email", normalizedEmail),
    baseQuery().ilike("to_email", normalizedEmail),
  ]);

  if (fromResult.error) throw fromResult.error;
  if (toResult.error) throw toResult.error;

  const byThread = new Map<string, CustomerEmailConversationRow>();
  const rows = [
    ...((fromResult.data ?? []) as CustomerEmailConversationRow[]),
    ...((toResult.data ?? []) as CustomerEmailConversationRow[]),
  ];

  for (const row of rows) {
    const key = row.thread_id || row.id;
    if (!key) continue;
    const current = byThread.get(key);
    const currentTime = current?.received_at ? new Date(current.received_at).getTime() : 0;
    const rowTime = row.received_at ? new Date(row.received_at).getTime() : 0;
    if (!current || rowTime >= currentTime) byThread.set(key, row);
  }

  return Array.from(byThread.values())
    .sort((a, b) => {
      const aTime = a.received_at ? new Date(a.received_at).getTime() : 0;
      const bTime = b.received_at ? new Date(b.received_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 25);
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

function EmailConversationsTab({
  conversations,
  customerEmail,
  companyId,
  isLoading,
  error,
}: {
  conversations: CustomerEmailConversationRow[];
  customerEmail: string | null;
  companyId: string;
  isLoading: boolean;
  error: unknown;
}) {
  const navigate = useNavigate();
  // 2026-05-26 (request utente "potere inviare email anche da qui"):
  // dialog di compose locale, apre con destinatario pre-popolato. Niente
  // più redirect forzato a /azienda/email per scrivere.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });
  const openNewEmail = () => {
    setComposeContext({
      mode: "new",
      initialTo: customerEmail ? [customerEmail] : undefined,
    });
    setComposeOpen(true);
  };
  const emailHref = customerEmail
    ? `/azienda/email?customer_email=${encodeURIComponent(customerEmail)}`
    : "/azienda/email";

  if (!customerEmail) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Mail className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Nessuna email cliente disponibile</p>
        <p className="text-xs text-muted-foreground mt-1">
          Quando l'anagrafica avrà un indirizzo email reale, qui vedrai le conversazioni collegate.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Conversazioni email non caricate</p>
            <p className="mt-1 text-xs">Puoi comunque aprire il client email e cercare manualmente {customerEmail}.</p>
            <Button variant="outline" size="sm" className="mt-2 bg-white" onClick={() => navigate(emailHref)}>
              Apri client email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nessuna conversazione email trovata</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Ho cercato nelle tue caselle personali collegate usando {customerEmail}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={openNewEmail}>
              <PencilLine className="h-3.5 w-3.5" />
              Scrivi prima email
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(emailHref)}>
              Cerca nel client
            </Button>
          </div>
        </div>
        <EmailComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          context={composeContext}
          companyIdOverride={companyId}
        />
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-blue-950">Conversazioni collegate al cliente</p>
            <p className="text-xs text-blue-900/70">
              Vista personale: email inviate o ricevute da {customerEmail}, con categoria AI e allegati.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={openNewEmail}>
            <PencilLine className="h-3.5 w-3.5" />
            Scrivi
          </Button>
          <Button variant="outline" size="sm" className="bg-white" onClick={() => navigate(emailHref)}>
            Apri inbox
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {conversations.map((message) => {
          const threadId = message.thread_id || message.id;
          const category = emailCategoryLabel(message.ai_category);
          const highPriority = message.ai_priority === "alta" || message.ai_priority === "high";
          const sender = message.from_name || message.from_email || "Sconosciuto";
          const targetHref = threadId
            ? `/azienda/email?thread_id=${encodeURIComponent(threadId)}&customer_email=${encodeURIComponent(customerEmail)}`
            : emailHref;

          return (
            <button
              key={threadId ?? `${message.from_email}-${message.received_at}`}
              type="button"
              className="group flex w-full items-start justify-between gap-3 rounded-md border border-transparent p-2.5 text-left transition-colors hover:border-blue-100 hover:bg-blue-50/50"
              onClick={() => navigate(targetHref)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!message.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                  <p className="truncate text-sm font-medium">{sender}</p>
                  {category && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {category}
                    </Badge>
                  )}
                  {highPriority && (
                    <Badge variant="outline" className="h-5 border-orange-200 bg-orange-50 px-1.5 text-[10px] text-orange-700">
                      Priorità
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-foreground">{message.subject || "(senza oggetto)"}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {message.ai_summary || message.preview || "Nessuna anteprima disponibile"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                <span>{formatDate(message.received_at)}</span>
                <div className="flex items-center gap-1">
                  {hasEmailAttachments(message.attachments) && <Paperclip className="h-3.5 w-3.5" />}
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        context={composeContext}
        companyIdOverride={companyId}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerBusinessTabs({
  customerId,
  companyId,
  customerFullName,
  customerEmail,
  orders,
  preventivi,
  tickets,
  rapportini,
  fatture,
  appuntamenti,
  rate,
  anagraficaCollegata,
  defaultTab,
  dataWarnings,
}: CustomerBusinessTabsProps) {
  useAuth();
  const navigate = useNavigate();
  const normalizedCustomerEmail = normalizeEmailForLookup(customerEmail);
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
  const {
    data: emailConversations = [],
    isLoading: isLoadingEmailConversations,
    error: emailConversationsError,
  } = useQuery({
    queryKey: ["customer-email-conversations", customerId, companyId, normalizedCustomerEmail],
    queryFn: () => fetchCustomerEmailConversations(companyId, normalizedCustomerEmail!),
    enabled: !!companyId && !!normalizedCustomerEmail,
    staleTime: 60 * 1000,
  });

  // Quick actions bar
  const quickActions: Array<{ label: string; href: string; icon: React.ComponentType<{ className?: string }> }> = [
    { label: "Ordine",      href: buildCreateUrl("/azienda/ordini/nuovo", customerId, customerFullName),       icon: ClipboardList },
    { label: "Preventivo",  href: buildCreateUrl("/azienda/marketing/preventivi/nuovo", customerId, customerFullName), icon: FileSignature },
    { label: "Appuntamento", href: buildCreateUrl("/azienda/calendario", customerId, customerFullName),         icon: CalendarDays },
    { label: "Ticket",      href: buildCreateUrl("/azienda/assistenza/nuovo", customerId, customerFullName),    icon: Ticket },
  ];

  // 2026-05-27 (richiesta utente "coerente con pagina contatti"):
  // 1. KPI cards rimosse — già nell'header CompanyCustomerDetail (stile marketing).
  // 2. Pannello "Crea per questo cliente" rimosso — spostato nel dropdown "..."
  //    del header (stile marketing che usa DropdownMenu invece di pulsantiera
  //    inline). Risultato: tabs partono subito senza chrome ridondante.
  void quickActions; // mantenuto per future estensioni; non più renderizzato qui.
  return (
    <Tabs defaultValue={defaultTab ?? "ordini"} key={defaultTab ?? "ordini"}>

      {/*
        2026-05-27 (audit dettaglio cliente): alert errori meno invasivo.
        PRIMA: mostrava un blocco giallo grosso con TUTTI gli errori, anche
        quelli "normali" tipo "Impossibile caricare gli appuntamenti"
        quando in realtà la tabella appointments non aveva ancora la RLS
        configurata per quel ruolo. Look allarmante per non-errori.
        ORA: pill discreta che si espande on-click. Errori dettagliati
        solo se l'utente vuole vederli. Solo errori CON message
        non-vuoto vengono mostrati (filtrato da .some(Boolean)).
      */}
      {dataWarnings && Object.values(dataWarnings).some(Boolean) && (
        <details className="mb-3 group">
          <summary className="cursor-pointer list-none flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-100 transition-colors">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">
              {Object.values(dataWarnings).filter(Boolean).length === 1
                ? "1 collegamento non caricato"
                : `${Object.values(dataWarnings).filter(Boolean).length} collegamenti non caricati`}
            </span>
            <span className="ml-auto text-[10px] text-amber-700 group-open:hidden">Mostra dettagli</span>
            <span className="ml-auto text-[10px] text-amber-700 hidden group-open:inline">Nascondi</span>
          </summary>
          <div className="mt-1.5 space-y-0.5 rounded-md border border-amber-100 bg-amber-50/50 px-3 py-2 text-[11px] text-amber-900">
            {Object.entries(dataWarnings)
              .filter(([, message]) => Boolean(message))
              .map(([key, message]) => (
                <p key={key}>· {message}</p>
              ))}
          </div>
        </details>
      )}

      <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 h-auto mb-2">
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
        <TabsTrigger value="email" className="text-xs px-1">
          Email ({emailConversations.length})
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
      <TabsContent value="email">
        <EmailConversationsTab
          conversations={emailConversations}
          customerEmail={normalizedCustomerEmail}
          companyId={companyId}
          isLoading={isLoadingEmailConversations}
          error={emailConversationsError}
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
