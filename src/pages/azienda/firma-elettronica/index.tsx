import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Plus, FileText, FileSignature, Loader2, Send, AlertTriangle,
  Search, Mail, CheckCircle2, Clock, XCircle, Copy,
  FileStack, Target,
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
  sessione_id: string | null;
  sessione?: {
    nome: string | null;
    order_id: string | null;
    quote_id: string | null;
    contact_id: string | null;
    template?: { nome: string | null; tipo_doc: string | null } | null;
  } | null;
  created_at: string;
  expires_at: string | null;
  signed_at: string | null;
  otp_tentativi: number | null;
}

type FirmaElettronicaScope = "marketing" | "cantieri";

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "In attesa OTP", icon: Clock, className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  otp_verified: { label: "OTP verificato", icon: Target, className: "bg-blue-100 text-blue-700 border-blue-200" },
  signed: { label: "Firmato", icon: CheckCircle2, className: "bg-green-100 text-green-700 border-green-200" },
  refused: { label: "Rifiutato", icon: XCircle, className: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "Scaduto", icon: Clock, className: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled: { label: "Annullato", icon: XCircle, className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const TIPO_DOC_LABEL: Record<string, string> = {
  order: "Contratto / commessa",
  quote: "Preventivo",
  preventivo: "Preventivo",
  sessione: "Documento operativo",
  odv: "Ordine di vendita",
  contract: "Contratto",
  contratto: "Contratto",
  ddt: "DDT",
  collaudo: "Collaudo",
  verbale: "Verbale",
  sal: "SAL",
  variante: "Variante",
};

const MARKETING_SIGNATURE_TYPES = ["quote", "preventivo", "odv", "contract", "contratto"];
const CANTIERI_SIGNATURE_TYPES = ["order", "sessione", "contract", "contratto", "ddt", "collaudo", "verbale", "sal", "variante"];

const MARKETING_TEMPLATE_TYPES = ["preventivo", "accettazione", "contratto"];
const CANTIERI_TEMPLATE_TYPES = ["contratto", "verbale", "modulo", "sal", "ddt", "variante", "generico"];

const DOC_TYPE_OPTIONS: Record<FirmaElettronicaScope, Array<{ value: string; label: string }>> = {
  marketing: [
    { value: "quote", label: "Preventivo" },
    { value: "odv", label: "Ordine di vendita" },
    { value: "contratto", label: "Contratto" },
  ],
  cantieri: [
    { value: "order", label: "Contratto / commessa" },
    { value: "sessione", label: "Documento operativo" },
    { value: "ddt", label: "DDT" },
    { value: "collaudo", label: "Collaudo" },
    { value: "sal", label: "SAL" },
    { value: "variante", label: "Variante" },
  ],
};

function getTemplateDocType(request: SignatureRequestRow) {
  return request.sessione?.template?.tipo_doc?.toLowerCase() ?? "";
}

function getRequestDocumentLabel(request: SignatureRequestRow) {
  const templateType = getTemplateDocType(request);
  if (request.tipo_documento === "sessione" && templateType) {
    return TIPO_DOC_LABEL[templateType] ?? templateType;
  }
  return TIPO_DOC_LABEL[request.tipo_documento] ?? request.tipo_documento;
}

function requestMatchesScope(request: SignatureRequestRow, scope: FirmaElettronicaScope) {
  const templateType = getTemplateDocType(request);
  if (scope === "marketing") {
    return MARKETING_SIGNATURE_TYPES.includes(request.tipo_documento) ||
      MARKETING_TEMPLATE_TYPES.includes(templateType);
  }

  return CANTIERI_SIGNATURE_TYPES.includes(request.tipo_documento) ||
    CANTIERI_TEMPLATE_TYPES.includes(templateType);
}

function requestMatchesType(request: SignatureRequestRow, tipoDocFilter: string) {
  if (tipoDocFilter === "tutti") return true;
  if (request.tipo_documento === tipoDocFilter) return true;
  return getTemplateDocType(request) === tipoDocFilter;
}

const PAGE_COPY: Record<FirmaElettronicaScope, {
  area: string;
  description: string;
  cta: string;
  emptyRequests: string;
  emptyDocuments: string;
}> = {
  marketing: {
    area: "Marketing & Vendite",
    description: "Archivio commerciale di preventivi, ordini di vendita e contratti inviati al cliente. La firma parte dal preventivo o dal contratto, qui controlli stati e audit.",
    cta: "Nuovo Template Commerciale",
    emptyRequests: "Nessuna richiesta commerciale di firma ancora",
    emptyDocuments: "Nessun documento commerciale ancora",
  },
  cantieri: {
    area: "Cantieri & Lavori",
    description: "Archivio operativo di contratti di commessa, DDT, collaudi, SAL, varianti e moduli firmati. La firma parte dal documento di cantiere, qui controlli stati e audit.",
    cta: "Nuovo Template Operativo",
    emptyRequests: "Nessuna richiesta operativa di firma ancora",
    emptyDocuments: "Nessun documento operativo ancora",
  },
};

function sessioneMatchesScope(sessione: { nome: string; template?: { nome: string; tipo_doc: string } }, scope: FirmaElettronicaScope) {
  const tipo = sessione.template?.tipo_doc?.toLowerCase() ?? "";
  const text = `${sessione.nome} ${sessione.template?.nome ?? ""}`.toLowerCase();
  const typeMatch = scope === "marketing" ? MARKETING_TEMPLATE_TYPES.includes(tipo) : CANTIERI_TEMPLATE_TYPES.includes(tipo);

  if (typeMatch) return true;

  const marketingText = ["preventivo", "offerta", "ordine di vendita", "odv", "contratto commerciale"].some((word) => text.includes(word));
  if (scope === "marketing") return marketingText;

  return ["ddt", "collaudo", "verbale", "sal", "variante", "commessa", "cantiere", "posa"].some((word) => text.includes(word)) || !marketingText;
}

export default function FirmaElettronicaHub({ scope = "marketing" }: { scope?: FirmaElettronicaScope }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyId = useEffectiveCompanyId();
  const { sessioni, isLoading: sessioniLoading } = useDocumentoSessioni();
  const pageCopy = PAGE_COPY[scope];
  const docTypeOptions = DOC_TYPE_OPTIONS[scope];

  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab === "documenti" || tab === "template" ? tab : "richieste";
  });
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
    queryKey: ["signature-requests", companyId, statusFilter, scope],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("signature_requests" as never)
        .select("id, token, signer_name, signer_email, status, tipo_documento, tipo_firmatario, sessione_id, created_at, expires_at, signed_at, otp_tentativi, sessione:documento_sessioni(nome, order_id, quote_id, contact_id, template:documento_templates(nome, tipo_doc))")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (statusFilter !== "tutti") q = q.eq("status", statusFilter) as typeof q;
      q = q.in("tipo_documento", scope === "marketing" ? ["quote", "odv", "sessione"] : ["order", "sessione"]) as typeof q;
      const { data, error } = await (q as unknown as Promise<{ data: SignatureRequestRow[] | null; error: unknown }>);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredRequests = useMemo(() => {
    const s = search.trim().toLowerCase();
    return requests
      .filter((r) => requestMatchesScope(r, scope))
      .filter((r) => requestMatchesType(r, tipoDocFilter))
      .filter((r) => {
        if (!s) return true;
        return r.signer_name.toLowerCase().includes(s) ||
          r.signer_email.toLowerCase().includes(s) ||
          r.token.toLowerCase().includes(s) ||
          (r.sessione?.nome ?? "").toLowerCase().includes(s) ||
          (r.sessione?.template?.nome ?? "").toLowerCase().includes(s);
      });
  }, [requests, scope, search, tipoDocFilter]);

  const filteredSessioni = useMemo(
    () => sessioni.filter((sessione) => sessioneMatchesScope(sessione, scope)),
    [sessioni, scope],
  );

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
    const returnTo = encodeURIComponent(scope === "cantieri" ? "/azienda/firma-elettronica-cantieri?tab=template" : "/azienda/firma-elettronica?tab=template");
    navigate(`/azienda/firma-elettronica/nuovo-template?templateId=${template.id}&scope=${scope}&returnTo=${returnTo}`);
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/firma-fea/${token}`;
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
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-950">Firma Elettronica</h1>
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">{pageCopy.area}</Badge>
              </div>
              <p className="text-sm text-slate-600">
                {pageCopy.description}
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
              className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600"
              onClick={() => navigate(`/azienda/firma-elettronica/nuovo-template?scope=${scope}&returnTo=${scope === "cantieri" ? "/azienda/firma-elettronica-cantieri" : "/azienda/firma-elettronica"}`)}
            >
              <Plus className="h-4 w-4" />
              {pageCopy.cta}
            </Button>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<FileStack className="h-4 w-4" />} label="Richieste totali" value={String(kpi.totale)} />
        <KpiCard icon={<Clock className="h-4 w-4 text-yellow-600" />} label="In attesa" value={String(kpi.inAttesa)} accent="yellow" />
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
            <Send className="h-3.5 w-3.5" /> Richieste firma
            {kpi.totale > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{kpi.totale}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="documenti" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileText className="h-3.5 w-3.5" /> Documenti compilati
          </TabsTrigger>
          <TabsTrigger value="template" className="gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <FileStack className="h-3.5 w-3.5" /> Template
          </TabsTrigger>
        </TabsList>

        {/* ── Tab RICHIESTE FIRMA ─────────────────────────────────────────── */}
        <TabsContent value="richieste" className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, email o token..."
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
                <SelectItem value="pending">In attesa OTP</SelectItem>
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
                {docTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
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
                  {requests.length === 0 ? pageCopy.emptyRequests : "Nessuna richiesta corrisponde ai filtri"}
                </p>
                {requests.length === 0 && (
                  <p className="text-slate-400 text-sm mt-1">
                    Crea un template, compila un documento e invia la richiesta al cliente
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Firmatario</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Creata</TableHead>
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
                        <TableCell>
                          <div className="font-medium text-sm">{r.signer_name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {r.signer_email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">{getRequestDocumentLabel(r)}</span>
                            {r.sessione?.template?.nome && (
                              <span className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                                {r.sessione.template.nome}
                              </span>
                            )}
                            <Badge variant="outline" className="w-fit text-[10px] px-1.5 py-0">
                              {r.tipo_firmatario === "b2c" ? "B2C" : "B2B"}
                            </Badge>
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
                            {r.status !== "signed" && r.status !== "refused" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Copia link firma"
                                onClick={() => copyLink(r.token)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Apri link firma in nuova scheda"
                              asChild
                            >
                              <a href={`/firma-fea/${r.token}`} target="_blank" rel="noreferrer">
                                <Send className="h-3.5 w-3.5" />
                              </a>
                            </Button>
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
          ) : filteredSessioni.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">{pageCopy.emptyDocuments}</p>
                <p className="text-slate-400 text-sm mt-1">
                  Crea un documento da un template per iniziare
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredSessioni.map((s) => {
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
          <DocumentiList
            scope={scope}
            emptyTitle={scope === "cantieri" ? "Nessun template operativo ancora" : "Nessun template commerciale ancora"}
            emptyDescription={scope === "cantieri"
              ? "Carica collaudi, DDT, SAL, verbali o contratti operativi dalle impostazioni Cantieri & Costi."
              : "Carica preventivi, accettazioni o contratti commerciali."
            }
            onSelect={handleSelectTemplate}
          />
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
