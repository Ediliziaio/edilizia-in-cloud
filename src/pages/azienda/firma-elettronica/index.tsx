import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Plus, FileText, FileSignature, Loader2, Send, AlertTriangle,
  Search, Mail, CheckCircle2, Clock, XCircle, Copy,
  FileStack, Target, ExternalLink, ClipboardCheck, ShieldCheck,
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
import { DocumentiList } from '@/components/documenti/DocumentiList';
import { FEABadge } from '@/components/fea/FEABadge';
import { RichiediFirmaDialog } from '@/components/fea/RichiediFirmaDialog';
import type { DocumentoTemplate } from '@/types/fea';
import { toast } from 'sonner';

interface SignatureRequestRow {
  id: string;
  token: string;
  signer_name: string;
  signer_email: string;
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
  documento_label: string;
  documento_subtitle: string | null;
  documento_url: string | null;
  firma_url: string | null;
  metodo_firma: "FEA OTP" | "Link preventivo";
  source_kind: "fea" | "quote";
}

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
  const [richiediFirmaOpen, setRichiediFirmaOpen] = useState<{
    open: boolean;
    documento_id: string;
    titolo: string;
    pdfMissing: boolean;
  }>({ open: false, documento_id: "", titolo: "", pdfMissing: false });

  // ── Richieste di firma (signature_requests) ──────────────────────────────
  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ["signature-requests", companyId, statusFilter, tipoDocFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("signature_requests" as never)
        .select("id, token, signer_name, signer_email, status, tipo_documento, tipo_firmatario, order_id, quote_id, sessione_id, created_at, expires_at, signed_at, otp_tentativi")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "tutti") q = q.eq("status", statusFilter) as typeof q;
      if (tipoDocFilter !== "tutti") q = q.eq("tipo_documento", tipoDocFilter) as typeof q;
      const { data, error } = await (q as unknown as Promise<{ data: Omit<SignatureRequestRow, "documento_label" | "documento_subtitle" | "documento_url" | "firma_url" | "metodo_firma" | "source_kind">[] | null; error: unknown }>);
      if (error) throw error;
      const feaRows = data ?? [];

      const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter(Boolean))) as string[];
      const orderIds = unique(feaRows.map((r) => r.order_id));
      const quoteIds = unique(feaRows.map((r) => r.quote_id));
      const sessioneIds = unique(feaRows.map((r) => r.sessione_id));

      const [{ data: orderRows }, { data: quoteRows }, { data: sessioneRows }, { data: legacyQuotes }] = await Promise.all([
        orderIds.length
          ? supabase.from("orders").select("id, order_code, description").in("id", orderIds)
          : Promise.resolve({ data: [] as OrderLite[] }),
        quoteIds.length
          ? supabase.from("quotes").select("id, quote_number, client_name, title").in("id", quoteIds)
          : Promise.resolve({ data: [] as QuoteLite[] }),
        sessioneIds.length
          ? (supabase
              .from("documento_sessioni" as never)
              .select("id, nome, template:documento_templates(nome, tipo_doc)")
              .in("id", sessioneIds) as unknown as Promise<{ data: SessioneLite[] | null }>)
          : Promise.resolve({ data: [] as SessioneLite[] }),
        tipoDocFilter === "tutti" || tipoDocFilter === "quote"
          ? supabase
              .from("quotes")
              .select("id, quote_number, client_name, client_email, title, status, signature_token, sent_at, created_at, signed_at, expires_at, refused_at, total")
              .eq("company_id", companyId!)
              .in("status", ["inviata", "accettata", "rifiutata"])
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as QuoteSignatureRow[] }),
      ]);

      const ordersById = new Map(((orderRows as OrderLite[] | null) ?? []).map((o) => [o.id, o]));
      const quotesById = new Map(((quoteRows as QuoteLite[] | null) ?? []).map((quote) => [quote.id, quote]));
      const sessioniById = new Map((sessioneRows ?? []).map((s) => [s.id, s]));
      const quoteIdsAlreadyInFea = new Set(quoteIds);

      const mappedFeaRows: SignatureRequestRow[] = feaRows.map((r) => {
        const quote = r.quote_id ? quotesById.get(r.quote_id) : null;
        const order = r.order_id ? ordersById.get(r.order_id) : null;
        const sessione = r.sessione_id ? sessioniById.get(r.sessione_id) : null;
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
          documento_label: documentoLabel,
          documento_subtitle: documentoSubtitle,
          documento_url: documentoUrl,
          firma_url: `/firma-fea/${r.token}`,
          metodo_firma: "FEA OTP",
          source_kind: "fea",
        };
      });

      const mappedQuoteRows: SignatureRequestRow[] = ((legacyQuotes as QuoteSignatureRow[] | null) ?? [])
        .filter((quote) => !quoteIdsAlreadyInFea.has(quote.id))
        .map((quote) => {
          const status =
            quote.status === "accettata" || quote.signed_at ? "signed" :
            quote.status === "rifiutata" || quote.refused_at ? "refused" :
            quote.expires_at && new Date(quote.expires_at) < new Date() ? "expired" :
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

      return [...mappedFeaRows, ...mappedQuoteRows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
  });

  const filteredRequests = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return requests;
    return requests.filter((r) =>
      r.signer_name.toLowerCase().includes(s) ||
      r.signer_email.toLowerCase().includes(s) ||
      r.token.toLowerCase().includes(s) ||
      r.documento_label.toLowerCase().includes(s) ||
      (r.documento_subtitle ?? "").toLowerCase().includes(s)
    );
  }, [requests, search]);

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

  const copyLink = (firmaUrl: string) => {
    const link = firmaUrl.startsWith("http") ? firmaUrl : `${window.location.origin}${firmaUrl}`;
    navigator.clipboard.writeText(link);
    toast.success("Link firma copiato negli appunti");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Firma Elettronica</h1>
              <p className="text-sm text-slate-600">
                {isMarketingContext
                  ? "Preventivi e contratti firmati dal cliente, collegati a CRM e opportunità."
                  : "Contratti, DDT, collaudi e moduli operativi firmati, collegati a clienti e commesse."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-orange-50/70 p-4 shadow-sm">
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
        <KpiCard icon={<XCircle className="h-4 w-4 text-slate-400" />} label="Scaduti/annull." value={String(kpi.scaduti)} accent="slate" />
        <KpiCard icon={<Target className="h-4 w-4 text-blue-600" />} label="Tasso firma" value={`${kpi.conversionRate}%`} accent="blue" />
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

          {reqLoading ? (
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
            <Card>
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
                    const isExpired = r.expires_at && new Date(r.expires_at) < new Date() && r.status !== "signed";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="max-w-[320px] truncate text-sm font-semibold text-slate-900">
                                {r.documento_label}
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
                          <div className="font-medium text-sm">{r.signer_name}</div>
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
                          {format(new Date(r.created_at), "dd MMM yyyy", { locale: it })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.signed_at ? (
                            <span className="text-green-700 font-medium">
                              {format(new Date(r.signed_at), "dd MMM yyyy", { locale: it })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.expires_at ? (
                            <span className={isExpired ? "text-red-600" : "text-muted-foreground"}>
                              {format(new Date(r.expires_at), "dd MMM yyyy", { locale: it })}
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
                                onClick={() => copyLink(r.firma_url!)}
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
                        {format(new Date(s.created_at), 'dd MMM yyyy', { locale: it })}
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
