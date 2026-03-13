import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentiFiscali, useDeleteDocumento, useUpdateDocumento } from "@/hooks/useDocumentiFiscali";
import { Checkbox } from "@/components/ui/checkbox";
import { useAnagraficaAzienda } from "@/hooks/useAnagraficaAzienda";
import { useMonthlyTimeline } from "@/hooks/billing/useMonthlyTimeline";
import { useDocumentCounts } from "@/hooks/billing/useDocumentCounts";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import { creaNotaCredito } from "@/lib/fatturazione/noteCredito";
import { convertiProformaInFattura } from "@/lib/fatturazione/proforma";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { MonthlyTimeline } from "@/components/fatturazione/MonthlyTimeline";
import { StatoBadge } from "@/components/fatturazione/StatoBadge";
import { DocumentiFooter } from "@/components/fatturazione/DocumentiFooter";
import { Button } from "@/components/ui/button";
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
  AlertCircle, CheckCircle2, Clock, Truck, FileSearch, RotateCcw, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento, AnagraficaAzienda } from "@/types/fatturazione";

const PER_PAGE = 25;

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
  { id: "fattura", label: "Fatture", tipos: ["fattura", "fattura_pa"], icon: FileText, countKey: "fatture", emptyTitle: "Nessuna fattura trovata", emptyDescription: "Crea la tua prima fattura per iniziare." },
  { id: "proforma", label: "Pro forma", tipos: ["proforma"], icon: Clock, countKey: "proforma", emptyTitle: "Nessun proforma trovato", emptyDescription: "Crea un proforma da inviare al cliente prima della fattura definitiva." },
  { id: "nota_credito", label: "Note di Credito", tipos: ["nota_credito"], icon: FileWarning, countKey: "nota_credito", emptyTitle: "Nessuna nota di credito", emptyDescription: "Le note di credito emesse per stornare fatture appariranno qui." },
  { id: "ddt", label: "DDT", tipos: ["ddt"], icon: Truck, countKey: "ddt", emptyTitle: "Nessun DDT trovato", emptyDescription: "I documenti di trasporto emessi appariranno qui." },
  { id: "preventivo", label: "Preventivi", tipos: ["preventivo"], icon: FileSearch, countKey: "preventivo", emptyTitle: "Nessun preventivo trovato", emptyDescription: "Crea preventivi da inviare ai clienti. Potrai convertirli in fattura una volta accettati." },
  { id: "annullate", label: "Cestino", tipos: null, icon: Trash2, countKey: "annullate", tabColor: "text-destructive", emptyTitle: "Il cestino è vuoto", emptyDescription: "I documenti eliminati appariranno qui." },
];

const NC_ALLOWED: StatoDocumento[] = ["emessa", "consegnata", "inviata_sdi", "accettata", "pagata", "parzialmente_pagata"];
const PAGABILE: StatoDocumento[] = ["emessa", "inviata_sdi", "consegnata", "accettata", "parzialmente_pagata"];

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

// ─── Main Page ────────────────────────────────────────────
export default function DocumentiFiscaliList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tipo") ?? "fattura";

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [statoFilter, setStatoFilter] = useState<string>("all");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 300);
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DocumentoFiscale | null>(null);
  const [payTarget, setPayTarget] = useState<DocumentoFiscale | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);

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
  const statoFilterArr = isTrash
    ? (["annullata"] as StatoDocumento[])
    : statoFilter !== "all"
      ? ([statoFilter] as StatoDocumento[])
      : undefined;

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
    }),
    [tipoFilter, statoFilterArr, search, dataDa, dataA, page]
  );

  const { data, isLoading } = useDocumentiFiscali(filters);
  const { data: counts } = useDocumentCounts();
  const { data: timelineMonths } = useMonthlyTimeline(isTrash ? null : currentTab.tipos);

  const docs = data?.documenti ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PER_PAGE);

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
          await downloadNativePDF(doc.id, doc.numero);
          toast.success("PDF scaricato");
        } catch (e: any) {
          toast.error(e.message);
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
        } catch (e: any) {
          toast.error(e.message);
        }
        break;
      case "nc":
        try {
          const prefilled = await creaNotaCredito(doc.id, "totale");
          navigate("/azienda/documenti/nuovo?tipo=nota_credito", { state: { prefilled } });
        } catch (e: any) {
          toast.error(e.message);
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
          toast.success(`Convertito in fattura ${fattura.numero}`);
          navigate(`/azienda/documenti/${fattura.id}/dettaglio`);
        } catch (e: any) {
          toast.error(e.message);
        }
        break;
      case "convert_preventivo":
        navigate(`/azienda/documenti/nuovo?tipo=fattura`, { state: { prefilled: doc } });
        break;
      case "accept_preventivo":
        updateMutation.mutate({ id: doc.id, stato: "accettata" as StatoDocumento });
        break;
      case "restore":
        updateMutation.mutate({ id: doc.id, stato: "bozza" as StatoDocumento });
        break;
      case "fattura_ddt":
        navigate(`/azienda/documenti/nuovo?tipo=fattura&from_ddt=${doc.id}`);
        break;
    }
  };

  // ── Type-specific columns logic ─────────────────────────
  const showColStorno = activeTab === "nota_credito";
  const showColFatturaCollegata = activeTab === "ddt";
  const showColValidita = activeTab === "preventivo";
  const showColTipo = isTrash;
  const showColScadenza = !showColStorno && !showColFatturaCollegata && !showColValidita && !isTrash;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fatturazione</h1>
          <p className="text-sm text-muted-foreground">Gestisci tutti i tuoi documenti fiscali</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Nuovo documento
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura")}>Fattura (TD01)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=nota_credito")}>Nota di Credito</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=proforma")}>Pro-Forma</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=preventivo")}>Preventivo</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=ddt")}>DDT</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/azienda/documenti/nuovo?tipo=fattura_pa")}>Fattura PA</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Monthly Timeline ───────────────────────────── */}
      {timelineMonths && timelineMonths.length > 0 && (
        <MonthlyTimeline
          months={timelineMonths}
          selectedMonth={selectedMonth}
          onSelectMonth={(m) => {
            setSelectedMonth(m);
            setPage(0);
          }}
        />
      )}

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex items-center border-b border-border overflow-x-auto">
        {TIPO_TABS.map((tab) => {
          const count = counts?.[tab.countKey as keyof typeof counts] ?? 0;
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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

      {/* ── Filters ────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
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

      {/* ── Table ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
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
                  {showColTipo && <TableHead className="w-28">Tipo</TableHead>}
                  <TableHead className="w-28">Stato</TableHead>
                  <TableHead>Cliente</TableHead>
                  {showColStorno && <TableHead className="w-36">Storna Fattura</TableHead>}
                  <TableHead className="w-36">Data / Numero</TableHead>
                  {showColScadenza && <TableHead className="w-40">Prox. Scadenza</TableHead>}
                  {showColValidita && <TableHead className="w-36">Valido fino al</TableHead>}
                  {showColFatturaCollegata && <TableHead className="w-36">Fattura Collegata</TableHead>}
                  <TableHead className="text-right w-28">Importo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const scadenza = getScadenzaInfo(doc);
                  const isDdt = doc.tipo === "ddt";
                  const ddtFatturato = isDdt && !!(doc as any).ddt_fattura_id;

                  return (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/azienda/documenti/${doc.id}/dettaglio`)}
                    >
                      {/* Tipo (solo cestino) */}
                      {showColTipo && (
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {{ fattura: "Fattura", fattura_pa: "Fattura PA", proforma: "Proforma", nota_credito: "NC", ddt: "DDT", preventivo: "Preventivo", nota_debito: "Nota Debito", autofattura: "Autofattura", fattura_riepilogativa: "Riepilogativa" }[doc.tipo] ?? doc.tipo}
                          </Badge>
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

                      {/* Valido fino al (solo preventivi) */}
                      {showColValidita && (
                        <TableCell>
                          {doc.data_validita ? (
                            <span className="text-sm">{formatDateShort(doc.data_validita)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}

                      {/* Fattura Collegata (solo DDT) */}
                      {showColFatturaCollegata && (
                        <TableCell>
                          {(doc as any).ddt_fattura_id ? (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/azienda/documenti/${(doc as any).ddt_fattura_id}/dettaglio`);
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
                            <Button variant="ghost" size="icon" className="h-8 w-8">
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
                                <DropdownMenuItem onClick={() => handleAction("pdf", doc)}>
                                  <Download className="h-4 w-4 mr-2" /> Scarica PDF
                                </DropdownMenuItem>
                                {!["ddt", "proforma", "preventivo"].includes(doc.tipo) && (
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

                                {/* Preventivo: segna accettato + converti */}
                                {doc.tipo === "preventivo" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {doc.stato !== "accettata" && (
                                      <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("accept_preventivo", doc)}>
                                        <CheckCircle2 className="h-4 w-4 mr-2" /> Segna Accettato
                                      </DropdownMenuItem>
                                    )}
                                    {doc.stato === "accettata" && (
                                      <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("convert_preventivo", doc)}>
                                        <FileText className="h-4 w-4 mr-2" /> Converti in Fattura
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}

                                {/* DDT: fattura da DDT */}
                                {doc.tipo === "ddt" && !(doc as any).ddt_fattura_id && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-emerald-600" onClick={() => handleAction("fattura_ddt", doc)}>
                                      <FileText className="h-4 w-4 mr-2" /> Fattura da questo DDT
                                    </DropdownMenuItem>
                                  </>
                                )}

                                {/* Fatture: NC */}
                                {NC_ALLOWED.includes(doc.stato) && ["fattura", "fattura_pa"].includes(doc.tipo) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleAction("nc", doc)}>
                                      <FileWarning className="h-4 w-4 mr-2" /> Emetti NC
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {PAGABILE.includes(doc.stato) && (
                                  <DropdownMenuItem onClick={() => handleAction("pagata", doc)}>
                                    <CreditCard className="h-4 w-4 mr-2" /> Segna pagata
                                  </DropdownMenuItem>
                                )}
                                {doc.stato === "bozza" && (
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
            <AlertDialogTitle>Eliminare il documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il documento <strong>{deleteTarget?.numero}</strong>. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
                }
              }}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
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
    </div>
  );
}