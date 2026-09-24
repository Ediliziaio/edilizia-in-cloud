import { useState, useMemo, useCallback, useEffect } from "react";
import { documentoDaConservare } from "@/lib/fatturazione/conservazione";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useDocumentiFiscali, useDeleteDocumento, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Checkbox } from "@/components/ui/checkbox";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { useMonthlyTimeline } from "@/hooks/billing/useMonthlyTimeline";
import { useDocumentCounts } from "@/hooks/billing/useDocumentCounts";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { MonthlyTimeline } from "@/components/fatturazione/MonthlyTimeline";
import { StatoBadge } from "@/components/fatturazione/StatoBadge";
import { DocumentiFooter } from "@/components/fatturazione/DocumentiFooter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { AbbinaFattureCommesseDialog } from "@/components/fatture/AbbinaFattureCommesseDialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, MoreHorizontal, Search, X, Loader2, ChevronLeft, ChevronRight,
  Download, Eye, Pencil, Copy, CreditCard, Trash2, FileWarning, FileText,
  AlertCircle, CheckCircle2, Clock, Truck, RotateCcw, FileSpreadsheet,
  BarChart3, Settings2, BookUser, Wallet, Archive, Calculator, ShieldCheck,
  Scale, ExternalLink, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento, AnagraficaAzienda } from "@/types/fatturazione";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import AnagraficheList from "./AnagraficheList";
import RegistroIncassi from "./RegistroIncassi";
import CassettoSDI from "./CassettoSDI";

import { useIsMobile } from "@/hooks/use-mobile";
const PER_PAGE = 25;

type BillingHubTab = "fatture" | "rubrica" | "incassi" | "sdi" | "fiscalita";

const HUB_TABS: {
  id: BillingHubTab;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { id: "fatture", label: "Fatture", description: "Emissione, DDT, proforma e note", icon: FileText },
  { id: "rubrica", label: "Clienti fiscali", description: "Clienti, fornitori e riconciliazione", icon: BookUser },
  { id: "incassi", label: "Registro incassi", description: "Pagamenti, residui e scadenze", icon: Wallet },
  { id: "sdi", label: "Cassetto SDI", description: "Invii, ricevute e scarti", icon: Archive },
  { id: "fiscalita", label: "Fiscalità", description: "IVA, F24, ritenute e conservazione", icon: Calculator },
];

// ─── Tab config ───────────────────────────────────────────
const TIPO_TABS: {
  id: string;
  label: string;
  tipos: TipoDocumento[] | null;
  icon: React.ElementType;
  countKey: string;
  tabColor?: string;
  emptyTitle: string;
  emptyDescription: string;
}[] = [
  { id: "fattura", label: "Fatture", tipos: ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue", "autofattura", "nota_debito", "fattura_riepilogativa"], icon: FileText, countKey: "fatture", emptyTitle: "Nessuna fattura trovata", emptyDescription: "Crea la tua prima fattura per iniziare." },
  { id: "proforma", label: "Pro forma", tipos: ["proforma"], icon: Clock, countKey: "proforma", emptyTitle: "Nessun proforma trovato", emptyDescription: "Crea un proforma da inviare al cliente prima della fattura definitiva." },
  { id: "nota_credito", label: "Note di Credito", tipos: ["nota_credito"], icon: FileWarning, countKey: "nota_credito", emptyTitle: "Nessuna nota di credito", emptyDescription: "Le note di credito emesse per stornare fatture appariranno qui." },
  { id: "ddt", label: "DDT", tipos: ["ddt"], icon: Truck, countKey: "ddt", emptyTitle: "Nessun DDT trovato", emptyDescription: "I documenti di trasporto emessi appariranno qui." },
  { id: "annullate", label: "Cestino", tipos: null, icon: Trash2, countKey: "cestinati", tabColor: "text-destructive", emptyTitle: "Il cestino è vuoto", emptyDescription: "I documenti eliminati appariranno qui. Dopo 14 giorni vengono cancellati definitivamente." },
];

const NC_ALLOWED: StatoDocumento[] = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];
const PAGABILE: StatoDocumento[] = ["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata"];
const TIPI_PAGABILI: TipoDocumento[] = ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria", "nota_debito"];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function isDocumentoPagabile(doc: DocumentoFiscale) {
  return TIPI_PAGABILI.includes(doc.tipo) && PAGABILE.includes(doc.stato);
}

function isDocumentoEliminabile(doc: DocumentoFiscale) {
  return doc.stato === "bozza" || doc.stato === "annullata";
}

// ─── Scadenza helper ──────────────────────────────────────
function getScadenzaInfo(doc: DocumentoFiscale) {
  if (!doc.data_scadenza || doc.stato === "pagata") return null;
  const oggi = new Date();
  const scadenza = new Date(doc.data_scadenza);
  const diffDays = Math.floor((oggi.getTime() - scadenza.getTime()) / (86400000));
  if (diffDays > 0) return { scaduta: true, giorni: diffDays };
  if (diffDays > -7) return { scaduta: false, giorni: Math.abs(diffDays), urgente: true };
  return { scaduta: false, giorni: Math.abs(diffDays), urgente: false };
}

function BillingHubTabs({
  activeTab,
  onChange,
}: {
  activeTab: BillingHubTab;
  onChange: (tab: BillingHubTab) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-max gap-1">
        {HUB_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                // v8.6.75 (LOOP-AZ-4) — min-w-[170px] su mobile spingeva
                // i tab fuori viewport. Su mobile (<md) min-w-0 + flex-1
                // (icon-only o wrap). Su md+ ritorna min-w-[170px] per
                // layout descrittivo originale.
                "flex min-w-0 md:min-w-[170px] items-center gap-2 rounded-xl px-3 py-2 text-left transition-all flex-1 md:flex-initial",
                isActive
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500",
              )}>
                <TabIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{tab.label}</span>
                <span className={cn(
                  "block truncate text-[11px]",
                  isActive ? "text-white/70" : "text-slate-500",
                )}>
                  {tab.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FiscalitaPanel() {
  const tools = [
    {
      title: "Registro IVA",
      description: "Registri, riepiloghi e controlli IVA.",
      to: "/azienda/documenti/registro-iva",
      icon: BarChart3,
    },
    {
      title: "Contabilità fiscale",
      description: "F24, liquidazione IVA e scadenze fiscali.",
      to: "/azienda/contabilita-fiscale",
      icon: Calculator,
    },
    {
      title: "Ritenute garanzia",
      description: "Trattenute, svincoli e dossier collegati ai cantieri.",
      to: "/azienda/ritenute-garanzia",
      icon: ShieldCheck,
    },
    {
      title: "Archivio sostitutivo",
      description: "Conservazione digitale e documenti in esibizione.",
      to: "/azienda/archivio-sostitutivo",
      icon: Scale,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <Calculator className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Fiscalità</h1>
            <p className="mt-0.5 text-sm text-slate-500">IVA, ritenute e conservazione raccolte nello stesso flusso della fatturazione.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const ToolIcon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <ToolIcon className="h-5 w-5" />
                </span>
                <ExternalLink className="h-4 w-4 text-slate-300 transition-colors group-hover:text-orange-500" />
              </div>
              <div className="mt-4">
                <p className="font-semibold text-slate-950">{tool.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{tool.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DocumentiFiscaliHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as BillingHubTab | null;
  const activeHubTab = HUB_TABS.some((tab) => tab.id === requestedTab) ? requestedTab! : "fatture";

  const handleHubTabChange = (tab: BillingHubTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "fatture") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
      next.delete("tipo");
    }
    setSearchParams(next, { replace: false });
  };

  return (
    <div className="space-y-4">
      <BillingHubTabs activeTab={activeHubTab} onChange={handleHubTabChange} />

      {activeHubTab === "fatture" && <DocumentiFiscaliListInner />}
      {activeHubTab === "rubrica" && <AnagraficheList embedded />}
      {activeHubTab === "incassi" && <RegistroIncassi embedded />}
      {activeHubTab === "sdi" && <CassettoSDI embedded />}
      {activeHubTab === "fiscalita" && <FiscalitaPanel />}
    </div>
  );
}

// ─── Inner Component ──────────────────────────────────────
function DocumentiFiscaliListInner() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTipo = searchParams.get("tipo");
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const activeTab = TIPO_TABS.some((tab) => tab.id === requestedTipo) ? requestedTipo! : "fattura";
  const ddtPdf = useShipmentDDTPDF();

  // Fatture importate dal gestionale esterno che non sanno a quale cantiere
  // appartengono: finché non lo sanno, la commessa non sa quanto ha incassato.
  const { effectiveCompany } = useAuth();
  const [abbinaAperto, setAbbinaAperto] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [timelineYear, setTimelineYear] = useState(new Date().getFullYear());
  const [statoFilter, setStatoFilter] = useState<string>("all");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 300);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DocumentoFiscale | null>(null);
  const [payTarget, setPayTarget] = useState<DocumentoFiscale | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);

  const { isScopriPlan } = useSubscriptionLimits();
  const { data: azienda } = useAnagraficaAzienda();
  const deleteMutation = useDeleteDocumento();
  const updateMutation = useUpdateDocumento();

  // Current tab config
  const currentTab = TIPO_TABS.find((t) => t.id === activeTab) ?? TIPO_TABS[0];
  const isTrash = activeTab === "annullate";

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleTabChange = (tabId: string) => {
    setSearchParams(tabId === "fattura" ? {} : { tipo: tabId }, { replace: true });
    setPage(0);
    setStatoFilter("all");
    setSelectedMonth(null);
    setSearchRaw("");
    clearSelection();
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // toggleSelectAll is defined after docs

  // Build filters for useDocumentiFiscali
  const tipoFilter = isTrash ? undefined : currentTab.tipos ?? undefined;
  const statoFilterArr = useMemo(
    () => isTrash
      ? undefined // Cestino uses showDeleted flag instead
      : statoFilter !== "all"
        ? ([statoFilter] as StatoDocumento[])
        : undefined,
    [isTrash, statoFilter]
  );

  // Month → date range
  const dataDa = selectedMonth ? `${selectedMonth}-01` : undefined;
  const dataA = selectedMonth
    ? (() => {
        const [y, m] = selectedMonth.split("-").map(Number);
        const last = new Date(y, m, 0).getDate();
        return `${selectedMonth}-${String(last).padStart(2, "0")}`;
      })()
    : undefined;

  const filters = useMemo(
    () => ({
      tipo: tipoFilter,
      stato: statoFilterArr,
      search: search || undefined,
      data_da: dataDa,
      data_a: dataA,
      page,
      perPage: PER_PAGE,
      showDeleted: isTrash,
    }),
    [tipoFilter, statoFilterArr, search, dataDa, dataA, page, isTrash]
  );

  const { data, isLoading, isError, isFetching, refetch } = useDocumentiFiscali(filters);
  const [showSlowLoading, setShowSlowLoading] = useState(false);
  const { data: counts } = useDocumentCounts();
  const { data: timelineMonths } = useMonthlyTimeline(isTrash ? null : currentTab.tipos, timelineYear);

  useEffect(() => {
    if (!isLoading) {
      setShowSlowLoading(false);
      return;
    }
    setShowSlowLoading(false);
    const timer = window.setTimeout(() => setShowSlowLoading(true), 3500);
    return () => window.clearTimeout(timer);
  }, [isLoading, activeTab, page, search, selectedMonth, statoFilter]);

  const docs = useMemo(() => data?.documenti ?? [], [data?.documenti]);
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === docs.length && docs.length > 0) return new Set();
      return new Set(docs.map((d) => d.id));
    });
  }, [docs]);

  const allSelected = docs.length > 0 && selectedIds.size === docs.length;
  const someSelected = selectedIds.size > 0;

  // ── Bulk actions ──────────────────────────────────────
  const selectedDocs = useMemo(() => docs.filter((d) => selectedIds.has(d.id)), [docs, selectedIds]);

  const handleBulkExport = () => {
    const columns: CsvColumn[] = [
      { key: "numero", label: "Numero" },
      { key: "tipo", label: "Tipo" },
      { key: "data_emissione", label: "Data" },
      { key: "cliente", label: "Cliente" },
      { key: "stato", label: "Stato" },
      { key: "imponibile", label: "Imponibile" },
      { key: "iva", label: "IVA" },
      { key: "totale", label: "Totale" },
    ];
    const rows = selectedDocs.map((d) => ({
      numero: d.numero,
      tipo: d.tipo,
      data_emissione: d.data_emissione,
      cliente: d.cliente_snapshot?.ragione_sociale ?? "",
      stato: d.stato,
      imponibile: String(d.imponibile_totale),
      iva: String(d.iva_totale),
      totale: String(d.totale_documento),
    }));
    exportToXLSX(rows, columns, `documenti_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`${rows.length} documenti esportati`);
  };

  const handleBulkPay = async () => {
    const now = new Date().toISOString();
    let ok = 0;
    let skipped = 0;
    for (const doc of selectedDocs) {
      if (!isDocumentoPagabile(doc)) {
        skipped++;
        continue;
      }
      try {
        await updateMutation.mutateAsync({
          id: doc.id,
          stato: "pagata" as StatoDocumento,
          importo_pagato: doc.totale_da_pagare,
          pagato_at: now,
        });
        ok++;
      } catch (err: unknown) {
        toast.error("Pagamento non aggiornato", { description: getErrorMessage(err) });
      }
    }
    if (ok > 0) toast.success(`${ok} documenti segnati come pagati`);
    if (skipped > 0) toast.info(`${skipped} documenti non pagabili ignorati`);
    clearSelection();
    setBulkPayOpen(false);
  };

  const handleBulkDelete = async () => {
    let ok = 0;
    let skipped = 0;
    for (const doc of selectedDocs) {
      if (!isDocumentoEliminabile(doc)) {
        skipped++;
        continue;
      }
      try {
        await deleteMutation.mutateAsync(doc.id);
        ok++;
      } catch (err: unknown) {
        toast.error("Documento non eliminato", { description: getErrorMessage(err) });
      }
    }
    if (ok > 0) toast.success(`${ok} documenti spostati nel cestino`);
    if (skipped > 0) toast.info(`${skipped} documenti emessi ignorati: usa una nota di credito per stornarli`);
    clearSelection();
    setBulkDeleteOpen(false);
  };

  // Totals for footer
  const totals = useMemo(() => {
    let imp = 0, iva = 0, tot = 0;
    for (const d of docs) {
      imp += d.imponibile_totale;
      iva += d.iva_totale;
      tot += d.totale_documento;
    }
    return { imp, iva, tot };
  }, [docs]);

  const hasFilters = statoFilter !== "all" || searchRaw || selectedMonth;

  const clearFilters = () => {
    setStatoFilter("all");
    setSearchRaw("");
    setSelectedMonth(null);
    setPage(0);
  };

  // ── Actions ─────────────────────────────────────────────
  const handleAction = async (action: string, doc: DocumentoFiscale) => {
    switch (action) {
      case "view":
        navigate(`/azienda/documenti/${doc.id}/dettaglio`);
        break;
      case "edit":
        navigate(`/azienda/documenti/${doc.id}`);
        break;
      case "duplicate":
        navigate(`/azienda/documenti/nuovo?tipo=${doc.tipo}`, { state: { prefilled: doc } });
        break;
      case "pdf":
        try {
          if (doc.tipo === "ddt") {
            // DDT usa template @react-pdf/renderer dedicato (layout standard
            // italiano DPR 472/96, senza prezzi, con sezione vettore +
            // subappaltatore + seriali per garanzia). Il toast di successo
            // è gestito dentro l'hook.
            await ddtPdf.generate(doc.id);
          } else {
            // Tutti gli altri tipi (fattura, NC, proforma, ecc.) usano la
            // edge function generate-native-pdf che produce HTML stampabile.
            await downloadNativePDF(doc.id, doc.numero);
            toast.success("PDF scaricato");
          }
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
        }
        break;
      case "save_pdf":
        try {
          if (doc.tipo === "ddt") {
            await ddtPdf.uploadAndAttach(doc.id);
          } else {
            toast.error("Salvataggio PDF disponibile solo per DDT");
          }
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
        }
        break;
      case "xml":
        try {
          if (!azienda) {
            toast.error("Anagrafica azienda non configurata");
            return;
          }
          const xml = generateFatturaPAXML(doc, azienda as AnagraficaAzienda);
          const blob = new Blob([xml], { type: "application/xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${doc.numero}.xml`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("XML scaricato");
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
        }
        break;
      case "nc":
        try {
          const prefilled = await creaNotaCredito(doc.id, "totale");
          navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
        }
        break;
      case "pagata":
        setPayTarget(doc);
        break;
      case "delete":
        setDeleteTarget(doc);
        break;
      case "convert_proforma":
        try {
          const fattura = await convertiProformaInFattura(doc.id);
          toast.success("Convertito in fattura", { description: "È una bozza: prende il numero quando la emetti." });
          navigate(`/azienda/documenti/${fattura.id}/dettaglio`);
        } catch (e: unknown) {
          toast.error(getErrorMessage(e));
        }
        break;
      case "restore":
        updateMutation.mutate({ id: doc.id, stato: "bozza" as StatoDocumento, deleted_at: null });
        break;
      case "fattura_ddt":
        navigate(`/azienda/documenti/nuovo?tipo=fattura&from_ddt=${doc.id}`);
        break;
    }
  };

  // ── Type-specific columns logic ─────────────────────────
  const showColStorno = activeTab === "nota_credito";
  const showColFatturaCollegata = activeTab === "ddt";
  const showColTipo = isTrash;
  const showColEliminazione = isTrash;
  const showColScadenza = !showColStorno && !showColFatturaCollegata && !isTrash;

  if (isScopriPlan) return <UpgradeScopriWall type="sdi_invoice" inline />;

  return (
    <>
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Fatturazione</h1>
              <p className="mt-0.5 text-sm text-slate-500">Gestisci documenti fiscali, SDI, incassi e scadenze operative.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/azienda/documenti/report">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Report fiscali</span>
              </Link>
            </Button>
            {!isCommercialistaMode && effectiveCompany?.id && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAbbinaAperto(true)}>
                <Link2 className="h-4 w-4" />
                <span className="hidden sm:inline">Abbina alle commesse</span>
              </Button>
            )}
            {!isCommercialistaMode && (
              <>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link to="/azienda/impostazioni/fatturazione-nativa">
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Impostazioni</span>
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
                      <Plus className="h-4 w-4" /> Nuovo documento
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/* Solo i tipi che il database accetta davvero. Il menu ne
                        offriva sedici, ma documenti_fiscali.tipo ne ammette nove e
                        documento_crea rispondeva «Il tipo di documento non è ancora
                        gestito» alle altre dieci — parcella TD06, accompagnatoria
                        TD24, acconti TD02/TD03, TD25, reverse charge interno TD16,
                        TD21, TD27 e le autofatture estere TD17/TD18/TD19 — dopo
                        aver fatto aprire l'editor. Per riaccenderne una servono,
                        insieme: il vincolo su documenti_fiscali.tipo, l'elenco in
                        documento_crea, la numerazione, documento_segno e una prova
                        del suo XML. */}
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura")}>Fattura (TD01)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura_pa")}>Fattura PA</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_credito")}>Nota di Credito</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_debito")}>Nota di Debito</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=proforma")}>Pro-Forma</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=ddt")}>DDT</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Monthly Timeline ───────────────────────────── */}
      {/* Strip 12 mesi a scorrimento: filtro secondario ingombrante su mobile.
          Solo da tablet in su; su telefono si resta su "tutti i mesi". */}
      {!isTrash && timelineMonths && timelineMonths.length > 0 && (
        <div className="hidden md:block">
          <MonthlyTimeline
            months={timelineMonths}
            selectedMonth={selectedMonth}
            onSelectMonth={(m) => {
              setSelectedMonth(m);
              setPage(0);
            }}
            year={timelineYear}
            onYearChange={(y) => {
              setTimelineYear(y);
              setSelectedMonth(null);
              setPage(0);
            }}
          />
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {TIPO_TABS.map((tab) => {
          const count = counts?.[tab.countKey as keyof typeof counts] ?? 0;
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm transition-all whitespace-nowrap",
                "shrink-0",
                isActive
                  ? "bg-orange-50 text-orange-700 font-medium shadow-sm ring-1 ring-orange-100"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
                tab.tabColor && !isActive && tab.tabColor
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
              {(count as number) > 0 && (
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="ml-1 h-5 min-w-[1.25rem] px-1.5 text-[10px]"
                >
                  {count as number}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Cestino info banner ─────────────────────── */}
      {isTrash && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-amber-800 dark:text-amber-300">
            Bozze e documenti non fiscali vengono eliminati definitivamente dopo <strong>14 giorni</strong>; puoi ripristinarli prima della scadenza.
            Fatture, note di credito e DDT restano invece archiviati anche dopo: la conservazione è obbligatoria per legge.
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        {!isTrash && (
          <Select value={statoFilter} onValueChange={(v) => { setStatoFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="bozza">Bozza</SelectItem>
              <SelectItem value="emessa">Emessa</SelectItem>
              <SelectItem value="inviata_sdi">Inviata SDI</SelectItem>
              <SelectItem value="pagata">Pagata</SelectItem>
              <SelectItem value="scaduta">Scaduta</SelectItem>
              <SelectItem value="parzialmente_pagata">Parz. pagata</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca numero, cliente..."
            value={searchRaw}
            onChange={(e) => { setSearchRaw(e.target.value); setPage(0); }}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
            <X className="h-3 w-3" /> Azzera filtri
          </Button>
        )}
      </div>

      {/* ── Bulk Actions Bar ───────────────────────────── */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}</span>

          {/* Niente export su telefono. */}
          {!isMobile && (
            <Button variant="outline" size="sm" onClick={handleBulkExport}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Esporta XLS
            </Button>
          )}

          {!isTrash && (
            <Button variant="outline" size="sm" onClick={() => setBulkPayOpen(true)}>
              <CreditCard className="h-4 w-4 mr-1.5" />
              Segna pagati
            </Button>
          )}

          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            Elimina
          </Button>

          <Button variant="ghost" size="sm" onClick={clearSelection} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────── */}
      {isError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14">
          <p className="text-sm text-muted-foreground">Errore nel caricamento dei documenti. Riprova.</p>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Riprovo...
              </>
            ) : "Riprova"}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-slate-700">Caricamento documenti...</p>
            {showSlowLoading && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Ci sta mettendo più del previsto. Puoi riprovare senza perdere i filtri.
              </p>
            )}
          </div>
          {showSlowLoading && (
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Riprovo...
                </>
              ) : "Riprova"}
            </Button>
          )}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <currentTab.icon className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">{currentTab.emptyTitle}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasFilters ? "Prova a modificare i filtri." : currentTab.emptyDescription}
          </p>
          {!hasFilters && !isTrash && (
            <Button className="mt-4" onClick={() => navigate(`/azienda/documenti/nuovo?tipo=${currentTab.tipos?.[0] ?? "fattura"}`)}>
              <Plus className="h-4 w-4 mr-1" /> {currentTab.label === "Fatture" ? "Crea la tua prima fattura" : `Nuovo ${currentTab.label.toLowerCase().replace(/i$/, "o")}`}
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                 <TableRow>
                  <TableHead className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Seleziona tutti"
                    />
                  </TableHead>
                  {showColTipo && <TableHead className="w-28">Tipo</TableHead>}
                  {showColEliminazione && <TableHead className="w-36">Eliminazione</TableHead>}
                  <TableHead className="w-28">Stato</TableHead>
                  <TableHead>Cliente</TableHead>
                  {showColStorno && <TableHead className="w-36">Storna Fattura</TableHead>}
                  <TableHead className="w-36">Data / Numero</TableHead>
                  {showColScadenza && <TableHead className="w-40">Prox. Scadenza</TableHead>}
                  {showColFatturaCollegata && <TableHead className="w-36">Fattura Collegata</TableHead>}
                  <TableHead className="text-right w-28">Importo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const scadenza = getScadenzaInfo(doc);
                  const isDdt = doc.tipo === "ddt";
                  const ddtFatturato = isDdt && !!doc.ddt_fattura_id;

                  return (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/azienda/documenti/${doc.id}/dettaglio`)}
                    >
                      {/* Checkbox */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelect(doc.id)}
                          aria-label={`Seleziona ${doc.numero}`}
                        />
                      </TableCell>

                      {/* Tipo (solo cestino) */}
                      {showColTipo && (
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {{ fattura: "Fattura", fattura_pa: "Fattura PA", proforma: "Proforma", nota_credito: "NC", ddt: "DDT", preventivo: "Preventivo", nota_debito: "Nota Debito", autofattura: "Autofattura", fattura_riepilogativa: "Riepilogativa", parcella: "Parcella", fattura_accompagnatoria: "F. Accomp.", integrazione_servizi_estero: "TD17", integrazione_beni_ue: "TD18", integrazione_beni_extra_ue: "TD19" }[doc.tipo] ?? doc.tipo}
                          </Badge>
                        </TableCell>
                      )}

                      {/* Giorni rimasti prima dell'eliminazione definitiva (solo cestino) */}
                      {showColEliminazione && (
                        <TableCell>
                          {(() => {
                            if (!doc.deleted_at) return <span className="text-xs text-muted-foreground">—</span>;
                            // Fatture, note e DDT non vengono mai cancellati:
                            // mostrare un conto alla rovescia sarebbe una promessa falsa.
                            if (documentoDaConservare(doc.tipo, doc.stato)) {
                              return (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Conservazione obbligatoria: resta archiviato anche dopo i 14 giorni">
                                  <ShieldCheck className="h-3 w-3" /> Conservato per legge
                                </span>
                              );
                            }
                            const deletedDate = new Date(doc.deleted_at);
                            const expiryDate = new Date(deletedDate.getTime() + 14 * 86400000);
                            const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000));
                            return (
                              <span className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                daysLeft <= 3 ? "text-destructive font-medium" : daysLeft <= 7 ? "text-amber-600" : "text-muted-foreground"
                              )}>
                                <Clock className="h-3 w-3" />
                                {daysLeft === 0 ? "Scade oggi" : `${daysLeft} giorni rimasti`}
                              </span>
                            );
                          })()}
                        </TableCell>
                      )}

                      {/* Stato */}
                      <TableCell>
                        {isDdt && !isTrash ? (
                          <Badge className={cn("text-[10px]", ddtFatturato ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200")}>
                            {ddtFatturato ? "✓ Fatturato" : "⏳ Da fatturare"}
                          </Badge>
                        ) : (
                          <StatoBadge stato={doc.stato} />
                        )}
                      </TableCell>

                      {/* Cliente */}
                      <TableCell className="text-sm font-medium">
                        {doc.cliente_snapshot?.ragione_sociale || "—"}
                      </TableCell>

                      {/* Storna Fattura (solo NC) */}
                      {showColStorno && (
                        <TableCell>
                          {doc.documento_correlato_id ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/documenti/${doc.documento_correlato_id}/dettaglio`);
                              }}
                            >
                              Vedi fattura originale
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Data / Numero */}
                      <TableCell>
                        <span className="text-sm">{formatDateShort(doc.data_emissione)}</span>
                        <br />
                        <span className="text-xs text-muted-foreground font-mono">{doc.numero}</span>
                      </TableCell>

                      {/* Prox. Scadenza (fatture, proforma) */}
                      {showColScadenza && (
                        <TableCell>
                          {scadenza ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs",
                                scadenza.scaduta
                                  ? "text-destructive font-medium"
                                  : scadenza.urgente
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground"
                              )}
                            >
                              {scadenza.scaduta ? (
                                <><AlertCircle className="h-3 w-3" /> Scaduta da {scadenza.giorni} gg</>
                              ) : (
                                <><Clock className="h-3 w-3" /> Scade in {scadenza.giorni} gg</>
                              )}
                            </span>
                          ) : doc.stato === "pagata" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Pagata
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Fattura Collegata (solo DDT) */}
                      {showColFatturaCollegata && (
                        <TableCell>
                          {doc.ddt_fattura_id ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/documenti/${doc.ddt_fattura_id}/dettaglio`);
                              }}
                            >
                              Vedi fattura
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Importo */}
                      <TableCell className={cn("text-right font-mono font-semibold text-sm", activeTab === "nota_credito" && "text-destructive")}>
                        {formatCurrency(doc.totale_documento)}
                      </TableCell>

                      {/* Azioni */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Altre azioni" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isTrash ? (
                              <>
                                <DropdownMenuItem onClick={() => handleAction("restore", doc)}>
                                  <RotateCcw className="h-4 w-4 mr-2" /> Ripristina
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive font-medium" onClick={() => handleAction("delete", doc)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina definitivamente
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => handleAction("view", doc)}>
                                  <Eye className="h-4 w-4 mr-2" /> Visualizza
                                </DropdownMenuItem>
                                {doc.stato === "bozza" && (
                                  <DropdownMenuItem onClick={() => handleAction("edit", doc)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Modifica
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleAction("duplicate", doc)}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplica
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {/* Niente export su telefono. */}
                                {!isMobile && (
                                  <DropdownMenuItem onClick={() => handleAction("pdf", doc)}>
                                    <Download className="h-4 w-4 mr-2" /> Scarica PDF
                                  </DropdownMenuItem>
                                )}
                                {doc.tipo === "ddt" && (
                                  <DropdownMenuItem
                                    onClick={() => handleAction("save_pdf", doc)}
                                    disabled={ddtPdf.isUploading}
                                  >
                                    <FileText className="h-4 w-4 mr-2" /> Salva PDF su documento
                                  </DropdownMenuItem>
                                )}
                                {/* Niente export su telefono. */}
                                {!isMobile && !["ddt", "proforma", "preventivo"].includes(doc.tipo) && (
                                  <DropdownMenuItem onClick={() => handleAction("xml", doc)}>
                                    <FileText className="h-4 w-4 mr-2" /> Scarica XML
                                  </DropdownMenuItem>
                                )}

                                {/* Proforma: converti in fattura */}
                                {doc.tipo === "proforma" && doc.stato !== "annullata" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("convert_proforma", doc)}>
                                      <FileText className="h-4 w-4 mr-2" /> Converti in Fattura
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* DDT: fattura da DDT */}
                                {doc.tipo === "ddt" && !doc.ddt_fattura_id && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("fattura_ddt", doc)}>
                                      <FileText className="h-4 w-4 mr-2" /> Fattura da questo DDT
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* Fatture: NC */}
                                {NC_ALLOWED.includes(doc.stato) && ["fattura", "fattura_pa", "parcella", "fattura_accompagnatoria"].includes(doc.tipo) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleAction("nc", doc)}>
                                      <FileWarning className="h-4 w-4 mr-2" /> Emetti NC
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {isDocumentoPagabile(doc) && (
                                  <DropdownMenuItem onClick={() => handleAction("pagata", doc)}>
                                    <CreditCard className="h-4 w-4 mr-2" /> Segna pagata
                                  </DropdownMenuItem>
                                )}
                {isDocumentoEliminabile(doc) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => handleAction("delete", doc)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Elimina
                    </DropdownMenuItem>
                  </>
                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <DocumentiFooter
            total={total}
            documenti={docs}
            totalImponibile={totals.imp}
            totalIva={totals.iva}
            totalDocumento={totals.tot}
          />
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page + 1} di {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ───────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.stato === "bozza"
                ? "Eliminare il documento?"
                : deleteTarget?.stato === "annullata"
                  ? "Eliminare definitivamente?"
                  : "Documento non eliminabile"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.stato === "bozza"
                ? <>Stai per spostare nel cestino il documento <strong>{deleteTarget?.numero}</strong>.</>
                : deleteTarget?.stato === "annullata"
                  ? <>Il documento <strong>{deleteTarget?.numero}</strong> verrà mantenuto nel cestino secondo le regole di conservazione fiscale.</>
                  : <>Il documento <strong>{deleteTarget?.numero}</strong> è emesso: usa una nota di credito per stornarlo.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || updateMutation.isPending}
              onClick={() => {
                if (deleteTarget && isDocumentoEliminabile(deleteTarget)) {
                  deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
                } else {
                  setDeleteTarget(null);
                }
              }}
            >
              {(deleteMutation.isPending || updateMutation.isPending)
                ? "Elaborazione..."
                : deleteTarget && isDocumentoEliminabile(deleteTarget)
                  ? "Sposta nel cestino"
                  : "Chiudi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Payment Confirmation Dialog ──────────────── */}
      <AlertDialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Segnare come pagata?</AlertDialogTitle>
            <AlertDialogDescription>
              Il documento <strong>{payTarget?.numero}</strong> verrà segnato come pagato per l'importo di{" "}
              <strong>{payTarget ? formatCurrency(payTarget.totale_da_pagare) : ""}</strong> in data odierna.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateMutation.isPending}
              onClick={() => {
                if (payTarget) {
                  updateMutation.mutate(
                    {
                      id: payTarget.id,
                      stato: "pagata",
                      importo_pagato: payTarget.totale_da_pagare,
                      pagato_at: new Date().toISOString(),
                    },
                    { onSettled: () => setPayTarget(null) }
                  );
                }
              }}
            >
              {updateMutation.isPending ? "Aggiornamento..." : "Conferma pagamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Confirmation ─────────────────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedIds.size} documenti?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo bozze e documenti già annullati verranno spostati nel cestino. I documenti emessi devono essere stornati con nota di credito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={handleBulkDelete}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina consentiti"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Pay Confirmation ────────────────────── */}
      <AlertDialog open={bulkPayOpen} onOpenChange={setBulkPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Segnare {selectedIds.size} documenti come pagati?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo i documenti con stato pagabile verranno aggiornati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateMutation.isPending}
              onClick={handleBulkPay}
            >
              {updateMutation.isPending ? "Aggiornamento..." : "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

      {effectiveCompany?.id && (
        <AbbinaFattureCommesseDialog
          open={abbinaAperto}
          onOpenChange={setAbbinaAperto}
          companyId={effectiveCompany.id}
        />
      )}
    </>
  );
}

export default function DocumentiFiscaliList() {
  return (
    <ErrorBoundary title="Errore nella lista documenti fiscali">
      <DocumentiFiscaliHub />
    </ErrorBoundary>
  );
}
