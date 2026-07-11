import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, FileText, FileSignature, Loader2, Send, AlertTriangle,
  Search, Mail, CheckCircle2, Clock, XCircle, Copy,
  FileStack, Target, ExternalLink, ClipboardCheck, ShieldCheck, RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { supabase } from '@/integrations/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useDocumentoSessioni } from '@/hooks/useDocumentoSessioni';
import { createTimeoutSignal, withClientTimeout } from '@/lib/query-timeout';
import { DocumentiList } from '@/components/documenti/DocumentiList';
import { FEABadge } from '@/components/fea/FEABadge';
import { RichiediFirmaDialog } from '@/components/fea/RichiediFirmaDialog';
import type { DocumentoTemplate } from '@/types/fea';
import { toast } from 'sonner';
import {
  filterSignatureRequests,
  formatFirmaDate,
  getLegacyQuoteStatusFilter,
  getFirmaRequestErrorMessage,
  isFirmaExpired,
  shouldShowFirmaRequestsLoader,
  sortSignatureRequestsByCreatedAt,
} from '@/lib/fea/firmaElettronicaHub';

interface SignatureRequestRow {
  id: string;
  token: string | null;
  signer_name: string | null;
  signer_email: string | null;
  status: string;
  tipo_documento: string;
  tipo_firmatario: string;
  order_id: string | null;
  quote_id: string | null;
  sessione_id: string | null;
  created_at: string;
  expires_at: string | null;
  signed_at: string | null;
  otp_tentativi: number | null;
  documento_label: string | null;
  documento_subtitle: string | null;
  documento_url: string | null;
  firma_url: string | null;
  metodo_firma: "FEA OTP" | "Link preventivo";
  source_kind: "fea" | "quote";
}

type SignatureRequestBaseRow = Omit<
  SignatureRequestRow,
  "documento_label" | "documento_subtitle" | "documento_url" | "firma_url" | "metodo_firma" | "source_kind"
>;

interface QuoteSignatureRow {
  id: string;
  quote_number: string | null;
  client_name: string | null;
  client_email: string | null;
  title: string | null;
  status: string | null;
  signature_token: string | null;
  sent_at: string | null;
  created_at: string;
  signed_at: string | null;
  expires_at: string | null;
  refused_at: string | null;
  total: number | null;
}

interface OrderLite {
  id: string;
  order_code: string | null;
  description: string | null;
}

interface QuoteLite {
  id: string;
  quote_number: string | null;
  client_name: string | null;
  title: string | null;
}

interface SessioneLite {
  id: string;
  nome: string;
  template?: { nome?: string | null; tipo_doc?: string | null } | null;
}

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "In attesa firma", icon: Clock, className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  otp_verified: { label: "OTP verificato", icon: Target, className: "bg-blue-100 text-blue-700 border-blue-200" },
  signed: { label: "Firmato", icon: CheckCircle2, className: "bg-green-100 text-green-700 border-green-200" },
  refused: { label: "Rifiutato", icon: XCircle, className: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "Scaduto", icon: Clock, className: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "Annullato", icon: XCircle, className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TIPO_DOC_LABEL: Record<string, string> = {
  order: "Ordine",
  quote: "Preventivo",
  sessione: "Documento",
  odv: "Ordine di vendita",
};

const FLOW_STEPS = [
  {
    title: "Documento operativo",
    text: "Preventivo, collaudo, modulo o ordine nasce nella sua area.",
    icon: FileText,
  },
  {
    title: "Invio firma",
    text: "La richiesta parte dal documento, con destinatario e scadenza.",
    icon: Send,
  },
  {
    title: "Cliente firma",
    text: "Il cliente apre il link, riceve OTP quando previsto e firma.",
    icon: ShieldCheck,
  },
  {
    title: "Archivio qui",
    text: "Qui controlli creati, inviati, firmati, rifiutati e scaduti.",
    icon: ClipboardCheck,
  },
];

const SIGNATURE_REQUESTS_TIMEOUT_MS = 12_000;
const SIGNATURE_OPTIONAL_LOOKUP_TIMEOUT_MS = 4_000;
const SIGNATURE_ARCHIVE_PAGE_SIZE = 100;

// Solo per query SECONDARIE (dettagli ordini/preventivi/sessioni, legacy quotes):
// su errore fa fallback a [] ma logga un warning per non perdere il segnale.
async function readOptionalRows<T>(
  task: PromiseLike<{ data: T[] | null; error?: unknown }> | null,
  label: string,
  timeoutMs = SIGNATURE_OPTIONAL_LOOKUP_TIMEOUT_MS,
): Promise<T[]> {
  if (!task) return [];
  try {
    const { data, error } = await withClientTimeout(task, label, timeoutMs);
    if (error) {
      console.warn(`[FirmaElettronica] ${label}:`, (error as { message?: string })?.message ?? error);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.warn(`[FirmaElettronica] ${label}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export default function FirmaElettronicaHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const companyId = useEffectiveCompanyId();
  const { sessioni, isLoading: sessioniLoading } = useDocumentoSessioni();
  const isMarketingContext = location.pathname.startsWith("/azienda/marketing/");

  const [activeTab, setActiveTab] = useState("richieste");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("tutti");
  const [tipoDocFilter, setTipoDocFilter] = useState<string>("tutti");
  const [requestsLoadingTimedOut, setRequestsLoadingTimedOut] = useState(false);
  const [richiediFirmaOpen, setRichiediFirmaOpen] = useState<{
    open: boolean;
    documento_id: string;
    titolo: string;
    pdfMissing: boolean;
  }>({ open: false, documento_id: "", titolo: "", pdfMissing: false });

  // ── Richieste di firma (signature_requests) ──────────────────────────────
  const {
    data: requests = [],
    isLoading: reqLoading,
    fetchStatus: reqFetchStatus,
    isError: reqIsError,
    error: reqError,
    refetch: refetchRequests,
    isFetching: reqFetching,
  } = useQuery<SignatureRequestRow[], Error>({
    queryKey: ["signature-requests", companyId, statusFilter, tipoDocFilter],
    enabled: !!companyId,
    // L'admin vede le firme completate senza refresh manuale
    refetchInterval: 15000,
    queryFn: async ({ signal }) => {
      let q = supabase
        .from("signature_requests" as never)
        .select("id, token, signer_name, signer_email, status, tipo_documento, tipo_firmatario, order_id, quote_id, sessione_id, created_at, expires_at, signed_at, otp_tentativi")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(SIGNATURE_ARCHIVE_PAGE_SIZE);
      if (statusFilter !== "tutti") q = q.eq("status", statusFilter) as typeof q;
      if (tipoDocFilter !== "tutti") q = q.eq("tipo_documento", tipoDocFilter) as typeof q;

      const requestTimeout = createTimeoutSignal(SIGNATURE_OPTIONAL_LOOKUP_TIMEOUT_MS, signal);
      let feaRows: SignatureRequestBaseRow[];
      try {
        // Query PRINCIPALE: l'errore deve propagarsi, così la UI mostra
        // lo stato di errore con il bottone "Riprova caricamento".
        const { data, error } = await withClientTimeout(
          q.abortSignal(requestTimeout.signal) as unknown as PromiseLike<{ data: SignatureRequestBaseRow[] | null; error?: unknown }>,
          "Archivio FEA",
          SIGNATURE_OPTIONAL_LOOKUP_TIMEOUT_MS,
        );
        if (error) {
          throw error instanceof Error
            ? error
            : new Error((error as { message?: string })?.message ?? "Archivio FEA: errore di caricamento");
        }
        feaRows = data ?? [];
      } finally {
        requestTimeout.dispose();
      }

      const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean))) as string[];
      const orderIds = unique(feaRows.map((r) => r.order_id));
      const quoteIds = unique(feaRows.map((r) => r.quote_id));
      const sessioneIds = unique(feaRows.map((r) => r.sessione_id));
      const legacyQuoteStatuses = getLegacyQuoteStatusFilter(statusFilter);
      const shouldFetchLegacyQuotes = (tipoDocFilter === "tutti" || tipoDocFilter === "quote") && legacyQuoteStatuses.length > 0;

      const optionalTimeout = createTimeoutSignal(SIGNATURE_OPTIONAL_LOOKUP_TIMEOUT_MS, signal);
      let orderRows: OrderLite[];
      let quoteRows: QuoteLite[];
      let sessioneRows: SessioneLite[];
      let legacyQuotes: QuoteSignatureRow[];

      try {
        [orderRows, quoteRows, sessioneRows, legacyQuotes] = await Promise.all([
          readOptionalRows<OrderLite>(
            orderIds.length
              ? supabase
                  .from("orders")
                  .select("id, order_code, description")
                  .in("id", orderIds)
                  .abortSignal(optionalTimeout.signal) as unknown as PromiseLike<{ data: OrderLite[] | null; error?: unknown }>
              : null,
            "Dettagli ordini firma",
          ),
          readOptionalRows<QuoteLite>(
            quoteIds.length
              ? supabase
                  .from("quotes")
                  .select("id, quote_number, client_name, title")
                  .in("id", quoteIds)
                  .abortSignal(optionalTimeout.signal) as unknown as PromiseLike<{ data: QuoteLite[] | null; error?: unknown }>
              : null,
            "Dettagli preventivi firma",
          ),
          readOptionalRows<SessioneLite>(
            sessioneIds.length
              ? supabase
                  .from("documento_sessioni" as never)
                  .select("id, nome, template:documento_templates(nome, tipo_doc)")
                  .in("id", sessioneIds)
                  .abortSignal(optionalTimeout.signal) as unknown as PromiseLike<{ data: SessioneLite[] | null; error?: unknown }>
              : null,
            "Dettagli documenti firma",
          ),
          readOptionalRows<QuoteSignatureRow>(
            shouldFetchLegacyQuotes
              ? supabase
                  .from("quotes")
                  .select("id, quote_number, client_name, client_email, title, status, signature_token, sent_at, created_at, signed_at, expires_at, refused_at, total")
                  .eq("company_id", companyId!)
                  .in("status", legacyQuoteStatuses)
                  .not("signature_token", "is", null)
                  .order("created_at", { ascending: false })
                  .limit(SIGNATURE_ARCHIVE_PAGE_SIZE)
                  .abortSignal(optionalTimeout.signal) as unknown as PromiseLike<{ data: QuoteSignatureRow[] | null; error?: unknown }>
              : null,
            "Preventivi legacy firma",
          ),
        ]);
      } finally {
        optionalTimeout.dispose();
      }

      const ordersById = new Map(orderRows.map((o) => [o.id, o]));
      const quotesById = new Map(quoteRows.map((quote) => [quote.id, quote]));
      const sessioniById = new Map(sessioneRows.map((s) => [s.id, s]));
      const quoteIdsAlreadyInFea = new Set(quoteIds);

      const mappedFeaRows: SignatureRequestRow[] = feaRows.map((r) => {
        const quote = r.quote_id ? quotesById.get(r.quote_id) : null;
        const order = r.order_id ? ordersById.get(r.order_id) : null;
        const sessione = r.sessione_id ? sessioniById.get(r.sessione_id) : null;
        const token = typeof r.token === "string" ? r.token : "";
        const documentoLabel =
          quote ? `${quote.quote_number ?? "Preventivo"}${quote.title ? ` · ${quote.title}` : ""}` :
          order ? `${order.order_code ?? "Ordine"}${order.description ? ` · ${order.description}` : ""}` :
          sessione ? sessione.nome :
          TIPO_DOC_LABEL[r.tipo_documento] ?? "Documento";
        const documentoSubtitle =
          quote?.client_name ??
          sessione?.template?.nome ??
          null;
        const documentoUrl =
          r.quote_id ? `/azienda/marketing/preventivi/${r.quote_id}` :
          r.order_id ? `/azienda/ordini/${r.order_id}` :
          null;

        return {
          ...r,
          token,
          documento_label: documentoLabel,
          documento_subtitle: documentoSubtitle,
          documento_url: documentoUrl,
          firma_url: token ? `/firma-fea/${token}` : null,
          metodo_firma: "FEA OTP",
          source_kind: "fea",
        };
      });

      const mappedQuoteRows: SignatureRequestRow[] = legacyQuotes
        .filter((quote) => !quoteIdsAlreadyInFea.has(quote.id))
        .map((quote) => {
          const status =
            quote.status === "accettata" || quote.signed_at ? "signed" :
            quote.status === "rifiutata" || quote.refused_at ? "refused" :
            isFirmaExpired(quote.expires_at, "pending") ? "expired" :
            "pending";

          return {
            id: `quote-${quote.id}`,
            token: quote.signature_token ?? "",
            signer_name: quote.client_name ?? "Cliente",
            signer_email: quote.client_email ?? "",
            status,
            tipo_documento: "quote",
            tipo_firmatario: "b2c",
            order_id: null,
            quote_id: quote.id,
            sessione_id: null,
            created_at: quote.sent_at ?? quote.created_at,
            expires_at: quote.expires_at,
            signed_at: quote.signed_at,
            otp_tentativi: null,
            documento_label: `${quote.quote_number ?? "Preventivo"}${quote.title ? ` · ${quote.title}` : ""}`,
            documento_subtitle: quote.client_name,
            documento_url: `/azienda/marketing/preventivi/${quote.id}`,
            firma_url: quote.signature_token ? `/offerta/${quote.signature_token}` : null,
            metodo_firma: "Link preventivo",
            source_kind: "quote",
          };
        })
        .filter((quote) => statusFilter === "tutti" || quote.status === statusFilter);

      return sortSignatureRequestsByCreatedAt([...mappedFeaRows, ...mappedQuoteRows]);
    },
    retry: 0,
  });

  const filteredRequests = useMemo(
    () => filterSignatureRequests(requests, search),
    [requests, search],
  );
  const showRequestsLoader = shouldShowFirmaRequestsLoader({
    hasCompanyId: Boolean(companyId),
    isLoading: reqLoading,
    fetchStatus: reqFetchStatus,
  });
  const showRequestsError = reqIsError || requestsLoadingTimedOut;
  const requestErrorMessage = requestsLoadingTimedOut
    ? getFirmaRequestErrorMessage(new Error("Richieste firma: timeout dopo 12 secondi"))
    : getFirmaRequestErrorMessage(reqError);

  useEffect(() => {
    if (!showRequestsLoader) {
      setRequestsLoadingTimedOut(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setRequestsLoadingTimedOut(true), SIGNATURE_REQUESTS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [showRequestsLoader, companyId, statusFilter, tipoDocFilter]);

  // ── Stato provider email transazionale piattaforma (Resend via platform_settings)
  // La configurazione è centralizzata a livello superadmin: ogni company eredita
  // il provider globale. Qui leggiamo platform_settings per mostrare lo stato.
  const { data: emailProvider } = useQuery({
    queryKey: ["platform-email-provider"],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as never)
        .select("key, value")
        .eq("key", "email_transactional_provider")
        .maybeSingle();
      const row = data as { key: string; value: string } | null;
      const provider = row?.value?.replace(/"/g, "") ?? null;
      return { provider, is_active: !!provider };
    },
  });

  // ── KPI calcolati ────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totale = requests.length;
    const inAttesa = requests.filter((r) => r.status === "pending" || r.status === "otp_verified").length;
    const firmati = requests.filter((r) => r.status === "signed").length;
    const scaduti = requests.filter((r) => r.status === "expired" || r.status === "cancelled").length;
    const firmatiThisMonth = requests.filter((r) => {
      if (r.status !== "signed" || !r.signed_at) return false;
      const d = new Date(r.signed_at);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const conversionRate = totale > 0 ? Math.round((firmati / totale) * 100) : 0;
    return { totale, inAttesa, firmati, scaduti, firmatiThisMonth, conversionRate };
  }, [requests]);

  const handleSelectTemplate = (template: DocumentoTemplate) => {
    navigate(`/azienda/firma-elettronica/nuovo-template?templateId=${template.id}`);
  };

  const copyLink = async (firmaUrl: string) => {
    const link = firmaUrl.startsWith("http") ? firmaUrl : `${window.location.origin}${firmaUrl}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard non disponibile");
      await navigator.clipboard.writeText(link);
      toast.success("Link firma copiato negli appunti");
    } catch {
      toast.error("Non riesco a copiare il link. Aprilo e copialo dalla barra del browser.");
    }
  };

  const handleRefetchRequests = () => {
    setRequestsLoadingTimedOut(false);
    void refetchRequests();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
              <FileSignature className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-950">Firma Elettronica</h1>
              <p className="text-sm text-slate-600">
                {isMarketingContext
                  ? "Preventivi e contratti firmati dal cliente, collegati a CRM e opportunità."
                  : "Contratti, DDT, collaudi e moduli operativi firmati, collegati a clienti e commesse."}
              </p>
            </div>
          </div>
          {/* v8.6.67 — flex-wrap su mobile: prima i 3 elementi (badge + 2 button)
              finivano in una riga forzata e uscivano dal viewport iPhone (375px). */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {emailProvider?.is_active ? (
              <Badge variant="outline" className="gap-1.5 border-green-200 bg-green-50 text-green-700">
                <Mail className="h-3 w-3" />
                Email transazionale · {emailProvider.provider ?? "attivo"}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 border-yellow-200 bg-yellow-50 text-yellow-700">
                <AlertTriangle className="h-3 w-3" />
                Email transazionale non configurata
              </Badge>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate(isMarketingContext ? '/azienda/marketing/preventivi' : '/azienda/ordini')}
            >
              <FileText className="h-4 w-4" />
              {isMarketingContext ? "Apri preventivi" : "Apri commesse"}
            </Button>
            <Button
              className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600"
              onClick={() => navigate('/azienda/firma-elettronica/nuovo-template')}
            >
              <Plus className="h-4 w-4" />
              Nuovo template custom
            </Button>
          </div>
        </div>
      </div>

      {/* Banner esplicativo "Flusso corretto" (4 step): vetrina che occupa
          tutto l'above-the-fold su mobile → solo desktop. */}
      <div className="hidden md:block rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-orange-50/70 p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Flusso corretto</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">La firma parte dal documento, qui trovi il controllo completo.</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isMarketingContext
                ? "Il preventivo si invia dalla scheda preventivo e resta collegato al cliente e all'opportunità."
                : "Il contratto, il DDT o il collaudo si inviano dal flusso operativo e restano collegati alla commessa."}{" "}
              Questa pagina serve per vedere cosa è stato creato, inviato, firmato, rifiutato o scaduto.
            </p>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {FLOW_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div key={step.title} className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                      <StepIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step {index + 1}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<FileStack className="h-4 w-4" />} label="Documenti tracciati" value={String(kpi.totale)} />
        <KpiCard icon={<Clock className="h-4 w-4 text-yellow-600" />} label="Da firmare" value={String(kpi.inAttesa)} accent="yellow" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label="Firmati" value={String(kpi.firmati)} accent="green"
          sub={kpi.firmatiThisMonth > 0 ? `${kpi.firmatiThisMonth} questo mese` : undefined} />
        {/* "Scaduti" e "Tasso firma": metriche vetrina → solo da md in su.
            Su mobile restano le 3 operative (Tracciati/Da firmare/Firmati). */}
        <div className="hidden md:contents">
          <KpiCard icon={<XCircle className="h-4 w-4 text-slate-400" />} label="Scaduti/annull." value={String(kpi.scaduti)} accent="slate" />
          <KpiCard icon={<Target className="h-4 w-4 text-blue-600" />} label="Tasso firma" value={`${kpi.conversionRate}%`} accent="blue" />
        </div>
      </div>

      {!emailProvider?.is_active && (
        <Alert className="border-yellow-500/40 bg-yellow-50/60">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Email transazionale non configurata</AlertTitle>
          <AlertDescription className="text-sm">
            Le richieste di firma necessitano dell'invio di email automatiche con OTP e link. Configura
            un provider (Resend, SendGrid o Elastic Email) in{" "}
            <a href="/azienda/impostazioni/dominio-email" className="underline font-medium">Impostazioni → Dominio email</a>
            {" "}per attivare l'invio.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <TabsTrigger value="richieste" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Send className="h-3.5 w-3.5" /> Archivio firme
            {kpi.totale > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{kpi.totale}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="documenti" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileText className="h-3.5 w-3.5" /> Moduli custom
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileStack className="h-3.5 w-3.5" /> Template moduli
          </TabsTrigger>
        </TabsList>

        {/* ── Tab RICHIESTE FIRMA ─────────────────────────────────────────── */}
        <TabsContent value="richieste" className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per documento, cliente, email o token..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli stati</SelectItem>
                <SelectItem value="pending">In attesa firma</SelectItem>
                <SelectItem value="otp_verified">OTP verificato</SelectItem>
                <SelectItem value="signed">Firmato</SelectItem>
                <SelectItem value="refused">Rifiutato</SelectItem>
                <SelectItem value="expired">Scaduto</SelectItem>
                <SelectItem value="cancelled">Annullato</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tipoDocFilter} onValueChange={setTipoDocFilter}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Tipo documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i tipi</SelectItem>
                <SelectItem value="sessione">Documento custom</SelectItem>
                <SelectItem value="quote">Preventivo</SelectItem>
                <SelectItem value="order">Ordine</SelectItem>
                <SelectItem value="odv">Ordine di vendita</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!companyId && (
            <Alert className="border-blue-200 bg-blue-50/60">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <AlertTitle>Connessione azienda in aggiornamento</AlertTitle>
              <AlertDescription className="text-sm">
                Sto recuperando il contesto aziendale. La pagina resta consultabile e si aggiorna appena i dati sono disponibili.
              </AlertDescription>
            </Alert>
          )}

          {showRequestsError ? (
            <Alert className="border-red-200 bg-red-50/70">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle>Richieste firma non caricate</AlertTitle>
              <AlertDescription className="text-sm">
                {requestErrorMessage}
              </AlertDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2 bg-white"
                onClick={handleRefetchRequests}
                disabled={reqFetching && !requestsLoadingTimedOut}
              >
                {reqFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Riprova caricamento
              </Button>
            </Alert>
          ) : showRequestsLoader ? (
            <div className="flex items-center gap-2 text-slate-500 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Caricamento richieste...
            </div>
          ) : filteredRequests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Send className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  {requests.length === 0 ? "Nessuna richiesta di firma ancora" : "Nessuna richiesta corrisponde ai filtri"}
                </p>
                {requests.length === 0 && (
                  <p className="text-slate-400 text-sm mt-1">
                    Invia un preventivo dalla sua scheda oppure richiedi una firma da un modulo custom.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
            {/* Vista MOBILE a card: la tabella a 7 colonne mandava le azioni
                (copia link / apri) fuori schermo a destra. */}
            <div className="space-y-2 md:hidden">
              {filteredRequests.map((r) => {
                const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
                const StatusIcon = cfg.icon;
                const isExpired = isFirmaExpired(r.expires_at, r.status);
                return (
                  <Card key={r.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.documento_label || "Documento"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" />{r.signer_name || "Cliente"} · {r.signer_email || "email non salvata"}
                        </p>
                      </div>
                      <Badge className={`gap-1 shrink-0 ${cfg.className}`} variant="outline">
                        <StatusIcon className="h-3 w-3" />{cfg.label}
                      </Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{TIPO_DOC_LABEL[r.tipo_documento] ?? r.tipo_documento}</Badge>
                      <span>Inviata {formatFirmaDate(r.created_at)}</span>
                      {r.signed_at && <span className="text-green-700 font-medium">· Firmata {formatFirmaDate(r.signed_at)}</span>}
                      {r.expires_at && !r.signed_at && <span className={isExpired ? "text-red-600" : ""}>· scade {formatFirmaDate(r.expires_at)}{isExpired ? " (scaduto)" : ""}</span>}
                    </div>
                    {r.firma_url && (
                      <div className="mt-2 flex gap-2">
                        {r.status !== "signed" && r.status !== "refused" && (
                          <Button variant="outline" size="sm" className="flex-1 h-10 gap-1.5" onClick={() => void copyLink(r.firma_url!)}>
                            <Copy className="h-4 w-4" /> Copia link
                          </Button>
                        )}
                        <Button variant="default" size="sm" className="flex-1 h-10 gap-1.5" asChild>
                          <a href={r.firma_url} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> Apri</a>
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
            <Card className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Firmatario</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Invio</TableHead>
                    <TableHead>Firmata</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((r) => {
                    const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
                    const StatusIcon = cfg.icon;
                    const isExpired = isFirmaExpired(r.expires_at, r.status);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="max-w-[320px] truncate text-sm font-semibold text-slate-900">
                                {r.documento_label || "Documento"}
                              </span>
                              {r.documento_url && (
                                <Button variant="ghost" size="icon" className="h-6 w-6" asChild title="Apri documento operativo">
                                  <a href={r.documento_url}>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                                {TIPO_DOC_LABEL[r.tipo_documento] ?? r.tipo_documento}
                              </Badge>
                              <Badge variant="secondary" className="w-fit text-[10px] px-1.5 py-0">
                                {r.metodo_firma}
                              </Badge>
                              {r.documento_subtitle && (
                                <span className="max-w-[260px] truncate text-xs text-muted-foreground">
                                  {r.documento_subtitle}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{r.signer_name || "Cliente"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {r.signer_email || "Email non salvata"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 ${cfg.className}`} variant="outline">
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                          {r.otp_tentativi != null && r.otp_tentativi > 2 && (
                            <div className="text-[10px] text-red-600 mt-0.5">
                              {r.otp_tentativi} tentativi OTP
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatFirmaDate(r.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.signed_at ? (
                            <span className="text-green-700 font-medium">
                              {formatFirmaDate(r.signed_at)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.expires_at ? (
                            <span className={isExpired ? "text-red-600" : "text-muted-foreground"}>
                              {formatFirmaDate(r.expires_at)}
                              {isExpired && " (scaduto)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            {r.firma_url && r.status !== "signed" && r.status !== "refused" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Copia link firma"
                                onClick={() => void copyLink(r.firma_url!)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {r.firma_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Apri link firma in nuova scheda"
                                asChild
                              >
                                <a href={r.firma_url} target="_blank" rel="noreferrer">
                                  <Send className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
            </>
          )}
        </TabsContent>

        {/* ── Tab DOCUMENTI COMPILATI ──────────────────────────────────────── */}
        <TabsContent value="documenti" className="mt-4">
          {sessioniLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Caricamento documenti...
            </div>
          ) : sessioni.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Nessun documento ancora</p>
                <p className="text-slate-400 text-sm mt-1">
                  Crea un documento da un template per iniziare
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessioni.map((s) => {
                const canRequestSign = s.stato !== "firmato";
                const pdfMissing = !(s as unknown as { pdf_url?: string | null }).pdf_url;
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-4 p-4 bg-white border rounded-xl hover:shadow-sm transition-shadow"
                  >
                    <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">{s.nome}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {s.template && (
                          <p className="text-xs text-slate-500">{s.template.nome}</p>
                        )}
                        {pdfMissing && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            PDF non generato
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <FEABadge stato={s.stato === 'firmato' ? 'signed' : s.stato === 'in_firma' ? 'pending' : null} />
                      <span className="text-xs text-slate-400 hidden sm:inline">
                        {formatFirmaDate(s.created_at)}
                      </span>
                      {canRequestSign && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setRichiediFirmaOpen({
                            open: true,
                            documento_id: s.id,
                            titolo: s.nome,
                            pdfMissing,
                          })}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Richiedi firma
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab TEMPLATE ─────────────────────────────────────────────────── */}
        <TabsContent value="template" className="mt-4">
          <DocumentiList onSelect={handleSelectTemplate} />
        </TabsContent>
      </Tabs>

      <RichiediFirmaDialog
        open={richiediFirmaOpen.open}
        onOpenChange={(o) => setRichiediFirmaOpen((prev) => ({ ...prev, open: o }))}
        tipo_documento="sessione"
        documento_id={richiediFirmaOpen.documento_id}
        documento_titolo={richiediFirmaOpen.titolo}
        pdf_missing={richiediFirmaOpen.pdfMissing}
      />
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: "green" | "yellow" | "red" | "blue" | "slate" }) {
  const accentClass =
    accent === "green" ? "border-green-200" :
    accent === "yellow" ? "border-yellow-200" :
    accent === "red" ? "border-red-200" :
    accent === "blue" ? "border-blue-200" :
    accent === "slate" ? "border-slate-200" :
    "";
  return (
    <Card className={accentClass}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-xl font-bold mt-1">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
