import { OperationalSummary, OperationalSummaryMetric } from "@/components/shared/OperationalSummary";
import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, FileText, Loader2, Send, AlertTriangle,
  Search, CheckCircle2, Clock, XCircle,
  FileStack, Target, RefreshCw, IdCard,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArchivioFirmeTable, MenuColonneFirme, useColonneFirme } from "./ArchivioFirmeTable";
import { useAuth } from "@/contexts/AuthContext";
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
import { FirmatariIdentificati } from '@/components/fea/FirmatariIdentificati';
import { useDocumentoSessioni } from '@/hooks/useDocumentoSessioni';
import { createTimeoutSignal, withClientTimeout } from '@/lib/query-timeout';
import { DocumentiList } from '@/components/documenti/DocumentiList';
import { FEABadge } from '@/components/fea/FEABadge';
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from '@/components/mobile/FiltriMobile';
import { RichiediFirmaDialog } from '@/components/fea/RichiediFirmaDialog';
import type { DocumentoTemplate } from '@/types/fea';
import { toast } from 'sonner';
import { apriPdfFirmato } from '@/lib/fea/pdfFirmatoDownload';
import {
  filterSignatureRequests,
  formatFirmaDate,
  getLegacyQuoteStatusFilter,
  getFirmaRequestErrorMessage,
  isFirmaExpired,
  shouldShowFirmaRequestsLoader,
  sortSignatureRequestsByCreatedAt,
} from '@/lib/fea/firmaElettronicaHub';

export interface SignatureRequestRow {
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
  sent_at?: string | null;
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
  rendiconto: "Rendiconto",
};
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

function aperta(r: SignatureRequestRow) {
  return r.status === "pending" || r.status === "otp_verified";
}

function statoArchivio(r: SignatureRequestRow) {
  return aperta(r) && isFirmaExpired(r.expires_at, r.status) ? "expired" : r.status;
}

function corrispondeStato(r: SignatureRequestRow, filtro: string) {
  const stato = statoArchivio(r);
  if (filtro === "aperte" || filtro === "scadenza") {
    if (!aperta(r) || stato === "expired") return false;
    return filtro === "aperte" || (!!r.expires_at && Date.parse(r.expires_at) <= Date.now() + 7 * 86400000);
  }
  return filtro === "tutti" || stato === filtro;
}

export default function FirmaElettronicaHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const colonneFirme = useColonneFirme(`firma-colonne-v1:${user?.id}:${companyId}`);
  const { sessioni, isLoading: sessioniLoading } = useDocumentoSessioni();
  const isMarketingContext = location.pathname.startsWith("/azienda/marketing/");

  const [activeTab, setActiveTab] = useState("richieste");
  const [scegliDocumento, setScegliDocumento] = useState(false);
  const [dettaglioId, setDettaglioId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("tutti");
  const [tipoDocFilter, setTipoDocFilter] = useState<string>("tutti");
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const [requestsLoadingTimedOut, setRequestsLoadingTimedOut] = useState(false);
  const [richiediFirmaOpen, setRichiediFirmaOpen] = useState<{
    open: boolean;
    documento_id: string;
    titolo: string;
    pdfMissing: boolean;
  }>({ open: false, documento_id: "", titolo: "", pdfMissing: false });

  // ── Richieste di firma (signature_requests) ──────────────────────────────
  const opzioniArchivio = (statusFilter: string, tipoDocFilter: string) => ({
    queryKey: ["signature-requests", companyId, statusFilter, tipoDocFilter],
    enabled: !!companyId,
    // L'admin vede le firme completate senza refresh manuale
    refetchInterval: 15000,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      let q = supabase
        .from("signature_requests" as never)
        .select("id, token, signer_name, signer_email, status, tipo_documento, tipo_firmatario, order_id, quote_id, sessione_id, created_at, expires_at, signed_at, otp_tentativi")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(SIGNATURE_ARCHIVE_PAGE_SIZE);
      if (["aperte", "scadenza", "pending", "otp_verified"].includes(statusFilter)) {
        const stati = ["aperte", "scadenza"].includes(statusFilter) ? ["pending", "otp_verified"] : [statusFilter];
        q = q.in("status", stati).or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`);
        if (statusFilter === "scadenza") q = q.lte("expires_at", new Date(Date.now() + 7 * 86400000).toISOString());
      } else if (statusFilter === "expired") {
        q = q.or(`status.eq.expired,and(status.in.(pending,otp_verified),expires_at.lt.${new Date().toISOString()})`);
      } else if (statusFilter !== "tutti") q = q.eq("status", statusFilter);
      if (tipoDocFilter !== "tutti") q = q.eq("tipo_documento", tipoDocFilter) as typeof q;

      const requestTimeout = createTimeoutSignal(SIGNATURE_REQUESTS_TIMEOUT_MS, signal);
      let feaRows: SignatureRequestBaseRow[];
      try {
        // Query PRINCIPALE: l'errore deve propagarsi, così la UI mostra
        // lo stato di errore con il bottone "Riprova caricamento".
        const { data, error } = await withClientTimeout(
          q.abortSignal(requestTimeout.signal) as unknown as PromiseLike<{ data: SignatureRequestBaseRow[] | null; error?: unknown }>,
          "Archivio FEA",
          SIGNATURE_REQUESTS_TIMEOUT_MS,
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
      const legacyQuoteStatuses = getLegacyQuoteStatusFilter(["aperte", "scadenza"].includes(statusFilter) ? "pending" : statusFilter);
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
        .map((quote): SignatureRequestRow => {
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
            order_id: null as null,
            quote_id: quote.id,
            sessione_id: null as null,
            created_at: quote.created_at,
            sent_at: quote.sent_at,
            expires_at: quote.expires_at,
            signed_at: quote.signed_at,
            otp_tentativi: null as null,
            documento_label: `${quote.quote_number ?? "Preventivo"}${quote.title ? ` · ${quote.title}` : ""}`,
            documento_subtitle: quote.client_name,
            documento_url: `/azienda/marketing/preventivi/${quote.id}`,
            firma_url: quote.signature_token ? `/offerta/${quote.signature_token}` : null,
            metodo_firma: "Link preventivo",
            source_kind: "quote",
          };
        })
        .filter((quote) => corrispondeStato(quote, statusFilter));

      return sortSignatureRequestsByCreatedAt([...mappedFeaRows, ...mappedQuoteRows]);
    },
    retry: 0,
  });

  const {
    data: requests = [],
    isLoading: reqLoading,
    fetchStatus: reqFetchStatus,
    isError: reqIsError,
    error: reqError,
    refetch: refetchRequests,
    isFetching: reqFetching,
  } = useQuery(opzioniArchivio(statusFilter, tipoDocFilter));
  const { data: riepilogo = [] } = useQuery(opzioniArchivio("tutti", "tutti"));
  const dettaglio = requests.find(r => r.id === dettaglioId);
  const storico = useQuery({
    queryKey: ["firma-storico", companyId, dettaglioId],
    enabled: !!companyId && dettaglio?.source_kind === "fea",
    queryFn: async () => {
      const { data, error } = await supabase.from("fea_audit_log").select("id, evento, created_at")
        .eq("company_id", companyId!).eq("request_id", dettaglioId!).order("created_at");
      if (error) throw error;
      return data;
    },
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
      const reset = window.setTimeout(() => setRequestsLoadingTimedOut(false), 0);
      return () => window.clearTimeout(reset);
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
    return {
      totale: riepilogo.length,
      inAttesa: riepilogo.filter(r => corrispondeStato(r, "aperte")).length,
      inScadenza: riepilogo.filter(r => corrispondeStato(r, "scadenza")).length,
      firmati: riepilogo.filter(r => r.status === "signed").length,
      scaduti: riepilogo.filter(r => statoArchivio(r) === "expired").length,
    };
  }, [riepilogo]);

  const indicatori = [
    ["aperte", "Da firmare", kpi.inAttesa],
    ["scadenza", "In scadenza entro 7 giorni", kpi.inScadenza],
    ["expired", "Scadute", kpi.scaduti],
    ["signed", "Firmate", kpi.firmati],
  ] as const;
  const selezionaIndicatore = (filtro: string) => {
    setActiveTab("richieste");
    setSearch("");
    setTipoDocFilter("tutti");
    setStatusFilter(statusFilter === filtro ? "tutti" : filtro);
  };
  const moduliPronti = sessioni.filter(s => s.pdf_url && (s.stato === "generato" || s.stato === "bozza"));
  const ultimoInvio = storico.data?.filter(e => e.evento === "link_inviato").at(-1)?.created_at ?? dettaglio?.sent_at;

  const handleSelectTemplate = (template: DocumentoTemplate) => {
    navigate(`/azienda/firma-elettronica/nuovo-template?templateId=${template.id}`);
  };

  // Il PDF firmato (timbro su ogni pagina + certificato). Se manca lo costruisce il server.
  const [pdfFirmatoInCorso, setPdfFirmatoInCorso] = useState<string | null>(null);
  const scaricaPdfFirmato = async (richiestaId: string) => {
    setPdfFirmatoInCorso(richiestaId);
    try {
      await apriPdfFirmato(async () => {
        const { data, error } = await supabase.functions.invoke("fea-pdf-firmato", { body: { request_id: richiestaId } });
        if (error) throw new Error("Non riesco a preparare il PDF firmato. Riprova tra qualche istante.");
        if (typeof data?.url !== "string" || !data.url) throw new Error("Link alla copia firmata non disponibile. Riprova.");
        return data.url;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Non riesco a preparare il PDF firmato. Riprova tra qualche istante.");
    } finally {
      setPdfFirmatoInCorso(null);
    }
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
    // Niente padding né larghezza massima propri: il margine lo dà <main>
    // (erano 48px per lato sul desktop) e la tabella dell'archivio usa la pagina.
    <div className="space-y-6 max-sm:space-y-3">
      {/* Mobile: solo il titolo. Le firme partono dal documento (preventivo,
          commessa), i template si creano al computer: qui su telefono si guarda
          l'archivio e si rimanda il link. */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
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
            {/* Solo l'avviso: «Email transazionale · resend» quando tutto va era
                un dettaglio tecnico in testata. */}
            {emailProvider?.is_active === false && (
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
            <Button onClick={() => setScegliDocumento(true)}><Send className="mr-2 h-4 w-4" />Richiedi firma</Button>
          </div>
        </div>
      </div>

      {/* Qui c'era il riquadro «Flusso corretto»: titolo, due frasi e quattro
          passi per spiegare che la firma parte dal documento (130px prima dei
          numeri). La pagina resta l'archivio; le firme si mandano dal documento. */}

      <KpiMobili className="sm:hidden" voci={indicatori.map(([filtro, label, valore]) => ({
        label, valore: String(valore), attivo: statusFilter === filtro, onClick: () => selezionaIndicatore(filtro),
      }))} />
      <div className="max-sm:hidden">
        <OperationalSummary label="Riepilogo firme" title="Dal documento alla firma" icon={FileStack}
          note="Conteggi sulle richieste recenti. Seleziona un indicatore per filtrare l’archivio.">
          {indicatori.map(([filtro, label, valore]) =>
            <OperationalSummaryMetric key={filtro} label={label} value={String(valore)}
              active={statusFilter === filtro} onClick={() => selezionaIndicatore(filtro)} />)}
        </OperationalSummary>
      </div>

      {emailProvider?.is_active === false && (
        <Alert className="border-yellow-500/40 bg-yellow-50/60 max-sm:py-2.5">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="max-sm:mb-0 max-sm:text-[13px]">Email transazionale non configurata</AlertTitle>
          <AlertDescription className="text-sm max-sm:hidden">
            Le richieste di firma necessitano dell'invio di email automatiche con OTP e link. Configura
            un provider (Resend, SendGrid o Elastic Email) in{" "}
            <a href="/azienda/impostazioni/dominio-email" className="underline font-medium">Impostazioni → Dominio email</a>
            {" "}per attivare l'invio.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Mobile: archivio e moduli; i template si gestiscono al computer. */}
        <TabsList className="h-auto gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:rounded-xl max-sm:p-1">
          <TabsTrigger value="richieste" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <Send className="h-3.5 w-3.5" /> Archivio firme
            {kpi.totale > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{kpi.totale}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="documenti" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileText className="h-3.5 w-3.5" /> Moduli custom
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 max-sm:hidden">
            <FileStack className="h-3.5 w-3.5" /> Template moduli
          </TabsTrigger>
          <TabsTrigger value="firmatari" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <IdCard className="h-3.5 w-3.5" /> Firmatari
          </TabsTrigger>
        </TabsList>

        {/* ── Tab RICHIESTE FIRMA ─────────────────────────────────────────── */}
        <TabsContent value="richieste" className="mt-4 space-y-3 max-sm:mt-3 max-sm:space-y-2">
          <div className="flex items-center gap-2 sm:hidden">
          <CercaConFiltri
            className="min-w-0 flex-1"
            valore={search}
            onCambia={setSearch}
            filtriAttivi={[statusFilter !== "tutti", tipoDocFilter !== "tutti"].filter(Boolean).length}
            onApriFiltri={() => setFiltriMobileAperti(true)}
          />
            <MenuColonneFirme {...colonneFirme} />
          </div>
          {/* Filtri in riga sopra la tabella, senza riquadro attorno. */}
          <div className="flex items-center gap-2 rounded-xl border bg-white p-2.5 shadow-sm max-sm:hidden">
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
                <SelectItem value="aperte">Da firmare</SelectItem>
                <SelectItem value="scadenza">In scadenza entro 7 giorni</SelectItem>
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
            <MenuColonneFirme {...colonneFirme} />
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
              <CardContent className="p-8 text-center max-sm:p-5">
                <Send className="h-12 w-12 text-slate-300 mx-auto mb-3 max-sm:hidden" />
                <p className="text-slate-500 font-medium max-sm:text-sm">
                  {requests.length === 0 ? "Nessuna richiesta di firma ancora" : "Nessuna richiesta corrisponde ai filtri"}
                </p>
                {requests.length === 0 && (
                  <p className="text-slate-400 text-sm mt-1 max-sm:hidden">
                    Invia un preventivo dalla sua scheda oppure richiedi una firma da un modulo custom.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <ArchivioFirmeTable
              key={JSON.stringify([user?.id, companyId, statusFilter, tipoDocFilter, search])}
              visible={colonneFirme.visible}
              rows={filteredRequests}
              openDetail={setDettaglioId}
              status={r => STATUS_CFG[statoArchivio(r)] ?? STATUS_CFG.pending}
              documentType={r => TIPO_DOC_LABEL[r.tipo_documento] ?? r.tipo_documento}
              actions={r => {
                const stato = statoArchivio(r);
                return (stato === "signed" && r.source_kind === "fea"
                        ? <Button size="sm" variant="outline" disabled={pdfFirmatoInCorso === r.id} onClick={() => void scaricaPdfFirmato(r.id)}>Scarica PDF</Button>
                        : <Button size="sm" variant="outline" onClick={() => setDettaglioId(r.id)}>
                            {corrispondeStato(r, "aperte") && r.signer_email && r.firma_url ? "Sollecita" : stato === "expired" && (r.sessione_id || r.documento_url) ? "Prepara nuova richiesta" : "Dettagli"}
                          </Button>
                );
              }}
            />
          )}
        </TabsContent>

        {/* ── Tab DOCUMENTI COMPILATI ──────────────────────────────────────── */}
        <TabsContent value="documenti" className="mt-4 max-sm:mt-3">
          {sessioniLoading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Caricamento documenti...
            </div>
          ) : sessioni.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center max-sm:p-5">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3 max-sm:hidden" />
                <p className="text-slate-500 font-medium max-sm:text-sm">Nessun documento ancora</p>
                <p className="text-slate-400 text-sm mt-1 max-sm:hidden">
                  Crea un documento da un template per iniziare
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden rounded-xl border-slate-200"><Table aria-label="Moduli custom" className="min-w-[850px] text-xs [&_th]:px-3 [&_td]:px-3 [&_td]:py-2 [&_td]:border-r [&_td]:border-slate-100">
              <TableHeader className="bg-slate-50"><TableRow><TableHead>Documento</TableHead><TableHead>Template</TableHead><TableHead>PDF</TableHead><TableHead>Stato firma</TableHead><TableHead>Creato il</TableHead><TableHead className="text-right">Azioni</TableHead></TableRow></TableHeader>
              <TableBody>{sessioni.map(s => {
                const canRequestSign = s.stato !== "firmato";
                const pdfMissing = !(s as unknown as {pdf_url?: string | null}).pdf_url;
                return <TableRow key={s.id}>
                  <TableCell className="max-w-[320px] truncate font-medium" title={s.nome}>{s.nome}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{s.template?.nome || "—"}</TableCell>
                  <TableCell className={pdfMissing ? "text-amber-700" : "text-emerald-700"}>{pdfMissing ? "Da generare" : "Disponibile"}</TableCell>
                  <TableCell><FEABadge stato={s.stato === 'firmato' ? 'signed' : s.stato === 'in_firma' ? 'pending' : null} /></TableCell>
                  <TableCell className="whitespace-nowrap">{formatFirmaDate(s.created_at)}</TableCell>
                  <TableCell className="text-right">{canRequestSign && <Button size="sm" variant="outline" className="h-8 gap-1.5" aria-label="Richiedi firma" onClick={() => setRichiediFirmaOpen({open:true,documento_id:s.id,titolo:s.nome,pdfMissing})}><Send className="h-3.5 w-3.5" />Richiedi firma</Button>}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table></Card>
          )}
        </TabsContent>

        {/* ── Tab TEMPLATE ─────────────────────────────────────────────────── */}
        <TabsContent value="template" className="mt-4">
          <Button className="mb-3" onClick={() => navigate('/azienda/firma-elettronica/nuovo-template')}><Plus className="mr-2 h-4 w-4" />Nuovo modello</Button>
          <DocumentiList onSelect={handleSelectTemplate} layout="table" />
        </TabsContent>

        {/* ── Tab FIRMATARI (firma avanzata) ──────────────────────────────── */}
        <TabsContent value="firmatari" className="mt-4">
          <FirmatariIdentificati />
        </TabsContent>
      </Tabs>

      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={[statusFilter !== "tutti", tipoDocFilter !== "tutti"].filter(Boolean).length}
        onAzzera={() => { setStatusFilter("tutti"); setTipoDocFilter("tutti"); }}
        risultati={filteredRequests.length}
      >
        <PilloleFiltro
          titolo="Stato"
          valore={statusFilter}
          onScegli={setStatusFilter}
          scelte={[
            { value: "tutti", label: "Tutti" },
            { value: "aperte", label: "Da firmare" },
            { value: "scadenza", label: "In scadenza" },
            { value: "cancelled", label: "Annullate" },
            { value: "signed", label: "Firmati" },
            { value: "refused", label: "Rifiutati" },
            { value: "expired", label: "Scaduti" },
          ]}
        />
        <PilloleFiltro
          titolo="Documento"
          valore={tipoDocFilter}
          onScegli={setTipoDocFilter}
          scelte={[
            { value: "tutti", label: "Tutti" },
            { value: "quote", label: "Preventivi" },
            { value: "order", label: "Ordini" },
            { value: "odv", label: "Ordini di vendita" },
            { value: "sessione", label: "Moduli" },
          ]}
        />
      </PannelloFiltri>

      <Dialog open={scegliDocumento} onOpenChange={setScegliDocumento}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogTitle>Richiedi firma</DialogTitle>
          <DialogDescription>Scegli il documento, poi verifica il firmatario prima dell’invio.</DialogDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/azienda/marketing/preventivi")}>Scegli preventivo</Button>
            <Button variant="outline" onClick={() => navigate("/azienda/ordini")}>Scegli commessa</Button>
          </div>
          <h3 className="text-sm font-semibold">Moduli pronti per la firma</h3>
          {sessioniLoading ? <p>Caricamento moduli…</p> : !moduliPronti.length ? <p className="text-sm text-muted-foreground">Nessun modulo pronto.</p> :
            moduliPronti.map(s =>
              <Button key={s.id} variant="outline" onClick={() => { setScegliDocumento(false); setRichiediFirmaOpen({open:true, documento_id:s.id, titolo:s.nome, pdfMissing:false}); }}>{s.nome}</Button>)}
        </DialogContent>
      </Dialog>
      <Dialog open={!!dettaglio} onOpenChange={open => { if (!open) setDettaglioId(null); }}>
        {dettaglio && <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogTitle>{dettaglio.documento_label || "Richiesta di firma"}</DialogTitle>
          <DialogDescription>{dettaglio.metodo_firma} · {STATUS_CFG[statoArchivio(dettaglio)]?.label}</DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt>Firmatario</dt><dd>{dettaglio.signer_name || "—"}</dd>
            <dt>Email</dt><dd className="break-all">{dettaglio.signer_email || "—"}</dd>
            <dt>Creata il</dt><dd>{formatFirmaDate(dettaglio.created_at)}</dd>
            {ultimoInvio && <><dt>Ultimo invio registrato</dt><dd>{formatFirmaDate(ultimoInvio, "dd MMM yyyy HH:mm")}</dd></>}
            <dt>Scadenza</dt><dd>{formatFirmaDate(dettaglio.expires_at)}</dd>
            {dettaglio.signed_at && <><dt>Firmata il</dt><dd>{formatFirmaDate(dettaglio.signed_at)}</dd></>}
          </dl>
          {dettaglio.source_kind === "fea" && <div className="text-sm"><h3 className="font-semibold">Cronologia</h3>
            {storico.isLoading ? "Caricamento…" : storico.isError ? "Cronologia non disponibile." : !storico.data?.length ? "Nessun evento registrato." : storico.data.map(e =>
              <p key={e.id}>{formatFirmaDate(e.created_at, "dd MMM yyyy HH:mm")} · {e.evento.replaceAll("_", " ")}</p>)}
          </div>}
          <div className="flex flex-wrap gap-2">
            {corrispondeStato(dettaglio, "aperte") && dettaglio.firma_url && <>
              {dettaglio.signer_email && <Button asChild><a href={`mailto:${encodeURIComponent(dettaglio.signer_email)}?subject=${encodeURIComponent("Promemoria firma · " + dettaglio.documento_label)}&body=${encodeURIComponent("Buongiorno, ricordiamo che il documento " + dettaglio.documento_label + " è in attesa della sua firma. Può utilizzare il link ricevuto con l’invito.")}`}>Prepara email di sollecito</a></Button>}
              <Button variant="outline" onClick={() => void copyLink(dettaglio.firma_url!)}>Copia link firma</Button>
              <Button variant="outline" asChild><a href={dettaglio.firma_url} target="_blank" rel="noreferrer">Apri link firma</a></Button>
            </>}
            {statoArchivio(dettaglio) === "expired" && dettaglio.sessione_id && sessioni.some(s => s.id === dettaglio.sessione_id && s.stato !== "firmato") &&
              <Button onClick={() => { const s = sessioni.find(s => s.id === dettaglio.sessione_id)!; setDettaglioId(null); setRichiediFirmaOpen({open:true, documento_id:s.id,titolo:s.nome,pdfMissing:!s.pdf_url}); }}>Prepara nuova richiesta</Button>}
            {dettaglio.documento_url && <Button variant="outline" onClick={() => navigate(dettaglio.documento_url!)}>{statoArchivio(dettaglio) === "expired" ? "Prepara nuova richiesta dal documento" : "Apri documento"}</Button>}
          </div>
        </DialogContent>}
      </Dialog>
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
