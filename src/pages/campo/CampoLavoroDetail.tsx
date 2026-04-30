/**
 * Dettaglio ordine/cantiere assegnato all'operaio o subappaltatore.
 * Verifica accesso tramite order_campo_assignments — sicurezza obbligatoria.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, MapPin, Phone, Plus, AlertCircle,
  CheckCircle, Clock, Loader2, FileText, PenLine,
  Send, Download, FileCheck,
  ClipboardSignature, ShieldCheck, Package, Wrench,
  Camera, BookOpenCheck, MessageSquare, Navigation,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useOrderDiary } from "@/hooks/useOrderDiary";

type Tab = "descrizione" | "rapportini" | "diario" | "documenti" | "chat";

// Tipi di documento disponibili per firma
const TIPI_DOCUMENTO = [
  {
    tipo: "verbale_consegna",
    label: "Verbale di consegna",
    description: "Documento di consegna lavori al cliente",
    icon: Package,
    color: "text-blue-600 bg-blue-50",
  },
  {
    tipo: "collaudo_finale",
    label: "Collaudo fine lavori",
    description: "Verbale di collaudo e accettazione finale",
    icon: ShieldCheck,
    color: "text-green-600 bg-green-50",
  },
  {
    tipo: "accettazione_lavori",
    label: "Accettazione lavori",
    description: "Conferma accettazione dei lavori eseguiti",
    icon: FileCheck,
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    tipo: "verbale_sopralluogo",
    label: "Verbale sopralluogo",
    description: "Documento con esito del sopralluogo tecnico",
    icon: ClipboardSignature,
    color: "text-violet-600 bg-violet-50",
  },
  {
    tipo: "presa_misure",
    label: "Presa misure",
    description: "Conferma misurazioni effettuate in cantiere",
    icon: Wrench,
    color: "text-amber-600 bg-amber-50",
  },
  {
    tipo: "altro",
    label: "Altro documento",
    description: "Documento generico da far firmare",
    icon: FileText,
    color: "text-slate-600 bg-slate-50",
  },
];

const STATO_FIRMA: Record<string, { label: string; cls: string; icon: any }> = {
  pending:      { label: "In attesa di firma", cls: "bg-amber-100 text-amber-700", icon: Clock },
  otp_verified: { label: "OTP verificato",     cls: "bg-blue-100 text-blue-700",   icon: CheckCircle },
  signed:       { label: "Firmato",             cls: "bg-green-100 text-green-700", icon: CheckCircle },
  expired:      { label: "Scaduto",             cls: "bg-red-100 text-red-700",     icon: AlertCircle },
  cancelled:    { label: "Annullato",           cls: "bg-slate-100 text-slate-600", icon: AlertCircle },
};

export default function CampoLavoroDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("descrizione");
  const { timeline } = useOrderDiary(orderId);

  // Verifica assegnazione — controlla order_campo_assignments e order_employees
  const { data: assignment, isLoading, isError, error } = useQuery({
    queryKey: ["campo-lavoro", orderId, user?.id],
    queryFn: async () => {
      const orderSelect = `
        id, order_code, description, status,
        indirizzo_lavori,
        percentuale_avanzamento,
        work_start_date,
        work_end_date,
        customer:profiles!orders_customer_id_fkey(
          first_name, last_name, phone, email
        )
      `;

      // 1. Prova order_campo_assignments
      const { data: campoData, error: campoErr } = await supabase
        .from("order_campo_assignments")
        .select(`*, order:orders(${orderSelect})`)
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (campoErr) throw campoErr;

      if (campoData?.order) return campoData;

      // 2. Fallback: controlla order_employees
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (empErr) throw empErr;

      if (emp?.id) {
        const { data: empRows, error: rowsErr } = await supabase
          .from("order_employees")
          .select("id, order_id")
          .eq("order_id", orderId!)
          .eq("employee_id", emp.id)
          .limit(1);
        if (rowsErr) throw rowsErr;
        const empAssign = empRows?.[0] ?? null;

        if (empAssign) {
          const { data: orderData, error: ordErr } = await supabase
            .from("orders")
            .select(orderSelect)
            .eq("id", orderId!)
            .single();
          if (ordErr) throw ordErr;
          if (!orderData) return null;

          return { ...empAssign, order: orderData, is_capocantiere: false };
        }
      }

      // Non assegnato — ritorna null, la redirect la fa un useEffect
      return null;
    },
    enabled: !!orderId && !!user?.id,
    retry: 1,
  });

  // Redirect sicuro quando non c'è assegnazione (fuori dalla queryFn → no side-effect in render)
  useEffect(() => {
    if (!isLoading && !isError && assignment === null) {
      navigate("/campo", { replace: true });
    }
  }, [isLoading, isError, assignment, navigate]);

  // Articoli ordine
  const { data: orderItems = [] } = useQuery({
    queryKey: ["campo-order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && activeTab === "descrizione",
  });

  // Rapportini dell'utente su questo ordine
  const { data: rapportini = [] } = useQuery({
    queryKey: ["campo-rapportini-ordine", orderId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("*")
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId && !!user?.id && activeTab === "rapportini",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Errore di rete/RLS → mostra fallback visibile invece di pagina bianca
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-6 text-center">
        <AlertCircle className="w-10 h-10 text-destructive mb-3" />
        <p className="font-semibold text-foreground">Impossibile caricare il lavoro</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xs">
          {error instanceof Error ? error.message : "Errore di connessione"}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["campo-lavoro", orderId] })}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            Riprova
          </button>
          <button
            onClick={() => navigate("/campo")}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium"
          >
            Torna indietro
          </button>
        </div>
      </div>
    );
  }

  // assignment === null → redirect già innescato dall'useEffect
  if (!assignment || !assignment.order) return null;

  const order = assignment.order as any;
  const customer = order?.customer;
  const tabs: { key: Tab; label: string }[] = [
    { key: "descrizione", label: "Descrizione" },
    { key: "rapportini",  label: "Rapportini" },
    { key: "diario",      label: "Diario" },
    { key: "documenti",   label: "Documenti" },
    { key: "chat",        label: "Chat" },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 rounded-b-2xl border-b border-border bg-background px-3 py-3 shadow-sm md:px-4 md:py-4">
        <div className="mb-2 flex items-center gap-3 md:mb-3">
          <button
            onClick={() => navigate("/campo")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted active:bg-muted"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:text-xs">Lavoro assegnato</p>
            <p className="truncate text-lg font-black text-foreground md:text-xl">{order?.order_code}</p>
            <p className="truncate text-xs text-muted-foreground md:text-sm">{order?.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_260px] md:gap-3">
          <div className="rounded-xl bg-muted/60 p-2.5 md:rounded-2xl md:p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Indirizzo cantiere</p>
            {order?.indirizzo_lavori ? (
              <button
                onClick={() => window.open(
                  `https://maps.google.com/?q=${encodeURIComponent(order.indirizzo_lavori)}`,
                  "_blank"
                )}
                className="flex w-full items-start gap-2 text-left text-primary"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="line-clamp-2 text-xs font-semibold md:text-sm">{order.indirizzo_lavori}</span>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun indirizzo impostato dall'ufficio.</p>
            )}
          </div>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary md:rounded-2xl md:p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-75">Avanzamento</p>
            <div className="flex items-end justify-between gap-3">
              <span className="text-2xl font-black">{order?.percentuale_avanzamento ?? 0}%</span>
              <span className="text-xs font-semibold">{order?.status || "In lavorazione"}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-primary/15">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${order?.percentuale_avanzamento ?? 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5 md:mt-3 md:gap-2">
          <QuickAction icon={FileText} label="Rapportino" onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)} />
          <QuickAction icon={Camera} label="Foto e note" onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)} />
          <QuickAction icon={AlertCircle} label="Ticket" onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)} />
          <QuickAction icon={Navigation} label="Maps" disabled={!order?.indirizzo_lavori} onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(order.indirizzo_lavori)}`, "_blank")} />
        </div>

        {/* Tab selector */}
        <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-hide md:mt-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground active:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenuto tab */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-28 md:space-y-4 md:px-4 md:py-4 md:pb-4">

        {/* ── Tab: Descrizione ── */}
        {activeTab === "descrizione" && (
          <>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <InfoTile label="Stato" value={order?.status || "In lavorazione"} icon={CheckCircle} />
              <InfoTile
                label="Inizio"
                value={order?.work_start_date ? format(new Date(order.work_start_date), "d MMM yyyy", { locale: it }) : "Non impostato"}
                icon={Clock}
              />
              <InfoTile
                label="Fine prevista"
                value={order?.work_end_date ? format(new Date(order.work_end_date), "d MMM yyyy", { locale: it }) : "Non impostata"}
                icon={CheckCircle}
              />
            </div>

            {/* Card cliente */}
            {customer && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                <p className="font-semibold text-foreground">
                  {customer.first_name} {customer.last_name}
                </p>
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="flex items-center gap-2 mt-2 text-primary text-sm"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{customer.phone}</span>
                  </a>
                )}
              </div>
            )}

            {/* Materiali da installare */}
            {orderItems.length > 0 && (
              <div className="bg-background border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Materiali / Articoli</p>
                <div className="space-y-2">
                  {orderItems.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <p className="text-sm text-foreground">{item.description || item.name}</p>
                      {item.quantity && (
                        <span className="text-xs text-primary">x{item.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Rapportini ── */}
        {activeTab === "rapportini" && (
          <div className="space-y-3">
            <button
              onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Nuovo rapportino
            </button>

            {rapportini.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 text-center">
                <FileText className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">Nessun rapportino per questo cantiere</p>
                  <p className="mt-1 text-sm text-muted-foreground">Aggiungi foto, ore, avanzamento e note dal cantiere.</p>
                </div>
              </div>
            ) : (
              rapportini.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-muted border border-border rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-semibold text-foreground">
                      {format(new Date(r.data_lavoro), "d MMM yyyy", { locale: it })}
                    </p>
                    {r.approvato ? (
                      <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" />
                        Approvato
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                        <Clock className="w-3 h-3" />
                        In attesa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {r.ore_lavorate != null && <span>{r.ore_lavorate}h lavorate</span>}
                    {r.percentuale_avanzamento != null && <span>{r.percentuale_avanzamento}% avanzamento</span>}
                    {r.foto_urls?.length > 0 && <span>{r.foto_urls.length} foto</span>}
                  </div>
                  {r.descrizione_lavori && (
                    <p className="text-sm text-foreground mt-1 line-clamp-2">{r.descrizione_lavori}</p>
                  )}
                  {r.foto_urls?.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {r.foto_urls.slice(0, 3).map((url: string, i: number) => (
                        <img
                          key={i}
                          src={url}
                          className="w-12 h-12 rounded-lg object-cover"
                          alt="Foto rapportino"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Diario ── */}
        {activeTab === "diario" && (
          <div className="space-y-3">
            <div className="rounded-2xl border bg-blue-50 p-4 text-blue-900">
              <div className="flex items-start gap-3">
                <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div>
                  <p className="font-bold">Diario lavori sincronizzato</p>
                  <p className="mt-1 text-sm text-blue-800/80">
                    Rapportini, foto, note e aggiornamenti dal campo finiscono nello storico principale dell'ordine.
                  </p>
                </div>
              </div>
            </div>
            {timeline.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <BookOpenCheck className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 font-semibold text-foreground">Diario ancora vuoto</p>
                <p className="mt-1 text-sm text-muted-foreground">Invia il primo rapportino per alimentare il diario del lavoro.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {timeline.slice(0, 20).map((entry) => {
                  const isEvent = entry.kind === "event";
                  const data: any = entry.data;
                  const payload = (data.payload ?? {}) as Record<string, any>;
                  const title = isEvent
                    ? diaryEventLabel(data.event_type, payload)
                    : data.subject || (data.channel === "nota_interna" ? "Nota interna" : "Messaggio");
                  const body = isEvent
                    ? payload.descrizione_lavori || payload.note || payload.message
                    : data.body;
                  return (
                    <div key={`${entry.kind}-${data.id}`} className="rounded-2xl border bg-background p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          isEvent ? "bg-primary/10 text-primary" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {isEvent ? <BookOpenCheck className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-foreground">{title}</p>
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(data.created_at), "d MMM HH:mm", { locale: it })}
                            </span>
                          </div>
                          {data.actor_name && <p className="text-xs text-muted-foreground">Da {data.actor_name}</p>}
                          {body && <p className="mt-2 text-sm leading-relaxed text-foreground">{String(body)}</p>}
                          {payload.foto_count ? (
                            <p className="mt-2 text-xs font-semibold text-primary">{payload.foto_count} foto allegate al rapportino</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Documenti e Firma ── */}
        {activeTab === "documenti" && (
          <DocumentiFirmaTab orderId={orderId!} customer={customer} />
        )}

        {/* ── Tab: Chat ── */}
        {activeTab === "chat" && (
          <ChatCantiere orderId={orderId!} orderCode={order?.order_code ?? ""} />
        )}
      </div>

      {/* CTA sticky in basso */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 z-20 pb-20 md:pb-3">
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/campo/lavoro/${orderId}/rapportino`)}
            className="flex-1 bg-primary text-white font-bold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform"
          >
            NUOVO RAPPORTINO
          </button>
          <button
            onClick={() => navigate(`/campo/ticket/nuovo/${orderId}`)}
            className="flex-1 bg-muted text-foreground border border-border font-semibold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            Apri ticket
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-xl border bg-background px-1 text-[10px] font-bold leading-tight text-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 md:h-12 md:flex-row md:gap-2 md:px-3 md:text-xs"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      {label}
    </button>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-2.5 shadow-sm md:rounded-2xl md:p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground md:mb-2 md:gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
        <p className="truncate text-[9px] font-bold uppercase tracking-wide md:text-[10px]">{label}</p>
      </div>
      <p className="truncate text-xs font-bold text-foreground md:text-sm">{value}</p>
    </div>
  );
}

function diaryEventLabel(eventType: string, payload: Record<string, any>) {
  if (eventType === "reportino_cantiere") return "Rapportino dal campo";
  if (eventType === "giornale_lavori_inserito") return "Giornale lavori aggiornato";
  if (eventType === "foto_rilievo_caricata") return "Foto caricata";
  if (eventType === "stato_cambiato") return "Stato lavoro aggiornato";
  if (payload?.title) return String(payload.title);
  return eventType.replaceAll("_", " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Documenti e Firma — tab con richieste firma e invio nuove
// ─────────────────────────────────────────────────────────────────────────────
function DocumentiFirmaTab({ orderId, customer }: { orderId: string; customer: any }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [noteDoc, setNoteDoc] = useState("");

  // Richieste firma esistenti per questo ordine
  const { data: firmeRichieste = [], isLoading } = useQuery({
    queryKey: ["campo-firme-ordine", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orderId,
  });

  // Crea richiesta firma tramite edge function FEA (invia email + OTP automaticamente)
  const { mutate: creaRichiestaFirma, isPending } = useMutation({
    mutationFn: async () => {
      if (!selectedTipo) throw new Error("Seleziona il tipo di documento");
      if (!customer?.email) throw new Error("Email del cliente non disponibile");

      const customerName = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();

      const { data, error } = await supabase.functions.invoke("fea-richiedi-firma", {
        body: {
          tipo_documento: "order",
          documento_id: orderId,
          tipo_firmatario: "b2b",
          signer_email: customer.email,
          signer_name: customerName || "Cliente",
          expires_giorni: 7,
        },
      });

      if (error) throw new Error(error.message || "Errore nell'invio della richiesta");
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast.success("Richiesta di firma inviata! Il cliente riceverà un'email con il link per firmare.");
      queryClient.invalidateQueries({ queryKey: ["campo-firme-ordine"] });
      setShowNewDoc(false);
      setSelectedTipo(null);
      setNoteDoc("");
    },
    onError: (err: any) => toast.error(err.message ?? "Errore nell'invio della richiesta"),
  });

  const firmePending = firmeRichieste.filter((f: any) => f.status === "pending").length;
  const firmeSigned = firmeRichieste.filter((f: any) => f.status === "signed").length;

  return (
    <div className="space-y-4">
      {/* KPI documenti */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{firmeRichieste.length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Totale</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{firmePending}</p>
          <p className="text-[10px] text-amber-600 mt-0.5">In attesa</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{firmeSigned}</p>
          <p className="text-[10px] text-green-600 mt-0.5">Firmati</p>
        </div>
      </div>

      {/* Bottone nuova richiesta */}
      <button
        onClick={() => setShowNewDoc(!showNewDoc)}
        className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
      >
        <PenLine className="w-5 h-5" />
        Richiedi firma documento
      </button>

      {/* Form nuova richiesta */}
      {showNewDoc && (
        <div className="bg-background border border-border rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-foreground">Seleziona tipo documento</p>

          <div className="grid grid-cols-2 gap-2">
            {TIPI_DOCUMENTO.map((doc) => {
              const [textColor, bgColor] = doc.color.split(" ");
              const isSelected = selectedTipo === doc.tipo;
              return (
                <button
                  key={doc.tipo}
                  onClick={() => setSelectedTipo(doc.tipo)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all active:scale-95",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bgColor)}>
                    <doc.icon className={cn("w-5 h-5", textColor)} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-foreground leading-tight">{doc.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{doc.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Destinatario */}
          {customer && (
            <div className="bg-muted/50 border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Firma richiesta a</p>
              <p className="text-sm font-semibold text-foreground">
                {customer.first_name} {customer.last_name}
              </p>
              <p className="text-xs text-muted-foreground">{customer.email}</p>
            </div>
          )}

          {!customer?.email && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Email del cliente non disponibile. Contatta l'ufficio per aggiungere l'email del cliente.
              </p>
            </div>
          )}

          {/* Note opzionali */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Note (opzionale)</label>
            <textarea
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground resize-none placeholder:text-muted-foreground"
              rows={2}
              placeholder="Note aggiuntive per il documento..."
              value={noteDoc}
              onChange={(e) => setNoteDoc(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowNewDoc(false); setSelectedTipo(null); }}
              className="flex-1 bg-muted text-foreground border border-border font-semibold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform"
            >
              Annulla
            </button>
            <button
              onClick={() => creaRichiestaFirma()}
              disabled={!selectedTipo || !customer?.email || isPending}
              className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia richiesta
            </button>
          </div>
        </div>
      )}

      {/* Lista documenti/firme */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : firmeRichieste.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-3 text-center">
          <ClipboardSignature className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">Nessun documento</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Richiedi la firma del cliente su consegna, collaudo o altri documenti
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Storico documenti ({firmeRichieste.length})
          </p>
          {firmeRichieste.map((f: any) => {
            const tipoDoc = TIPI_DOCUMENTO.find(t => t.tipo === f.tipo_documento)
              || (f.tipo_documento === "order" ? { label: "Documento ordine", icon: FileCheck, color: "text-blue-600 bg-blue-50" } : null);
            const stato = STATO_FIRMA[f.status] || STATO_FIRMA.pending;
            const StatoIcon = stato.icon;
            const DocIcon = tipoDoc?.icon || FileText;
            const [textColor, bgColor] = (tipoDoc?.color || "text-slate-600 bg-slate-50").split(" ");

            return (
              <div
                key={f.id}
                className="bg-background border border-border rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", bgColor)}>
                    <DocIcon className={cn("w-5 h-5", textColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">
                        {tipoDoc?.label || f.tipo_documento || "Documento"}
                      </p>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1", stato.cls)}>
                        <StatoIcon className="w-3 h-3" />
                        {stato.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Inviato a {f.signer_name || f.signer_email}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(new Date(f.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                    </p>
                    {f.signed_at && (
                      <p className="text-[11px] text-green-600 font-medium mt-0.5">
                        Firmato il {format(new Date(f.signed_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Azioni */}
                {f.status === "signed" && f.certificato_url && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <a
                      href={f.certificato_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Scarica certificato firmato
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Componente inline: link al canale chat del cantiere ──────────────────────
function ChatCantiere({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const navigate = useNavigate();
  const channelName = "cantiere-" + orderCode.toLowerCase().replace(/\s+/g, "-");

  const { data: canale, isLoading } = useQuery({
    queryKey: ["campo-canale-cantiere", orderId, orderCode],
    queryFn: async () => {
      if (!orderCode) return null;
      const { data, error } = await supabase
        .from("internal_chat_channels")
        .select("id, name")
        .eq("name", channelName)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderCode,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-12 gap-3 text-center">
      {canale ? (
        <>
          <button
            onClick={() => navigate(`/campo/chat/${canale.id}`)}
            className="bg-primary text-primary-foreground font-bold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform"
          >
            Apri chat cantiere
          </button>
          <p className="text-xs text-muted-foreground">Canale: {canale.name}</p>
        </>
      ) : (
        <>
          <button
            onClick={() => navigate("/campo/chat")}
            className="bg-muted text-foreground font-semibold py-3.5 px-8 rounded-xl active:scale-[0.98] transition-transform border border-border"
          >
            Vai alla chat
          </button>
          <p className="text-xs text-muted-foreground">
            Il canale {channelName} verra creato automaticamente
            quando l&apos;ufficio ti assegna a questo cantiere.
          </p>
        </>
      )}
    </div>
  );
}
