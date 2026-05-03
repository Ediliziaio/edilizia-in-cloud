// ============================================================================
// DDTRicezioneList — Vista globale dei DDT fornitori (UX procedurale)
// ----------------------------------------------------------------------------
// Tab usata dentro OrdersList.tsx accanto a "Ordini d'Acquisto".
// Include:
//   • Header + KPI con evidenza non conformità / da verificare
//   • Filtro pill mobile-first (tutti/atteso/parziale/ricevuto/verificato/non_conforme)
//   • Card mobile con allegati mini-icon + DDTStatusBadge
//   • Tabella desktop con colonna corriere + allegati
//   • Dialog Nuovo DDT → wizard procedurale 3 step
// ============================================================================

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileCheck, Plus, Loader2, Search, Truck, Warehouse as WarehouseIcon,
  FileText, ShoppingCart, ArrowRight, AlertTriangle, Paperclip,
  ShieldCheck, Image as ImageIcon, ChevronRight, Clock,
  Download, ChevronDown, FileSpreadsheet, Filter, X, Calendar as CalendarIcon,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDDTRicezioneList, type DDTStato } from "@/hooks/useDDTRicezione";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";

type FilterKey = "tutti" | DDTStato;
type SortDirection = "asc" | "desc";
type DDTSortKey =
  | "numero"
  | "data"
  | "fornitore"
  | "corriere"
  | "magazzino"
  | "allegati"
  | "quantita"
  | "stato";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "tutti", label: "Tutti" },
  { key: "atteso", label: "Attesi" },
  { key: "parziale", label: "Parziali" },
  { key: "ricevuto", label: "Ricevuti" },
  { key: "verificato", label: "Verificati" },
  { key: "non_conforme", label: "Non conformi" },
];

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  const normalizedA = typeof a === "number" ? a : String(a ?? "").toLowerCase();
  const normalizedB = typeof b === "number" ? b : String(b ?? "").toLowerCase();
  if (normalizedA < normalizedB) return -1;
  if (normalizedA > normalizedB) return 1;
  return 0;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />;
  return direction === "asc"
    ? <ArrowUp className="h-3.5 w-3.5" />
    : <ArrowDown className="h-3.5 w-3.5" />;
}

function SortableTh({
  label,
  active,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: "left" | "center" | "right";
}) {
  return (
    <th className={cn("p-3 font-medium", align === "left" && "text-left", align === "center" && "text-center", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
          align === "center" && "justify-center",
          align === "right" && "justify-end",
        )}
      >
        {label}
        <SortIcon active={active} direction={direction} />
      </button>
    </th>
  );
}

export default function DDTRicezioneList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tab, setTab] = useState<FilterKey>("tutti");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  // Advanced filters
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterHasDamages, setFilterHasDamages] = useState<"all" | "yes" | "no">("all");
  const [filterHasAttachments, setFilterHasAttachments] = useState<"all" | "yes" | "no">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ key: DDTSortKey; direction: SortDirection }>({
    key: "data",
    direction: "desc",
  });

  const { data: ddtList = [], isLoading } = useDDTRicezioneList();
  const { orders } = usePurchaseOrders();
  const { suppliers } = useOperationalSuppliers();

  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders]
  );

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (filterSupplier !== "all") n++;
    if (filterDateFrom) n++;
    if (filterDateTo) n++;
    if (filterHasDamages !== "all") n++;
    if (filterHasAttachments !== "all") n++;
    return n;
  }, [filterSupplier, filterDateFrom, filterDateTo, filterHasDamages, filterHasAttachments]);

  const clearFilters = () => {
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterHasDamages("all");
    setFilterHasAttachments("all");
  };

  const handleSort = (key: DDTSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filtered = useMemo(() => {
    let list = ddtList;
    if (tab !== "tutti") {
      list = list.filter((d) => {
        if (tab === "atteso") return d.stato === "atteso" || d.stato === "attesa";
        return d.stato === tab;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => {
        const po = d.purchase_orders;
        return (
          d.numero_ddt.toLowerCase().includes(q) ||
          po?.oda_number?.toLowerCase().includes(q) ||
          po?.suppliers?.name?.toLowerCase().includes(q) ||
          po?.orders?.order_code?.toLowerCase().includes(q) ||
          (d.corriere ?? "").toLowerCase().includes(q) ||
          (d.autista_nome ?? "").toLowerCase().includes(q)
        );
      });
    }

    if (filterSupplier !== "all") {
      list = list.filter((d) => d.purchase_orders?.suppliers?.id === filterSupplier || d.purchase_orders?.supplier_id === filterSupplier);
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom + "T00:00:00").getTime();
      list = list.filter((d) => d.data_ddt && new Date(d.data_ddt).getTime() >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo + "T23:59:59").getTime();
      list = list.filter((d) => d.data_ddt && new Date(d.data_ddt).getTime() <= to);
    }
    if (filterHasDamages !== "all") {
      list = list.filter((d) => filterHasDamages === "yes" ? (d.has_damages || d.stato === "non_conforme") : !(d.has_damages || d.stato === "non_conforme"));
    }
    if (filterHasAttachments !== "all") {
      list = list.filter((d) => {
        const has = (d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0) > 0;
        return filterHasAttachments === "yes" ? has : !has;
      });
    }

    const getSortValue = (d: (typeof ddtList)[number], key: DDTSortKey) => {
      const po = d.purchase_orders;
      switch (key) {
        case "numero":
          return d.numero_ddt;
        case "data":
          return new Date(d.data_ricezione ?? d.data_ddt ?? 0).getTime();
        case "fornitore":
          return po?.suppliers?.name ?? po?.oda_number ?? "";
        case "corriere":
          return d.corriere ?? "";
        case "magazzino":
          return d.warehouses?.name ?? "";
        case "allegati":
          return (d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0);
        case "quantita":
          return Number(d.quantita_ricevuta ?? 0);
        case "stato":
          return DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ?? d.stato;
        default:
          return "";
      }
    };

    return [...list].sort((a, b) => {
      const result = compareSortValues(getSortValue(a, sort.key), getSortValue(b, sort.key));
      return sort.direction === "asc" ? result : -result;
    });
  }, [ddtList, tab, search, filterSupplier, filterDateFrom, filterDateTo, filterHasDamages, filterHasAttachments, sort]);

  // Export
  const buildExportRows = useCallback(() => {
    return filtered.map((d) => {
      const po = d.purchase_orders;
      return {
        numero_ddt: d.numero_ddt,
        data: d.data_ddt ? format(new Date(d.data_ddt), "dd/MM/yyyy") : "",
        oda: po?.oda_number ?? "",
        supplier: po?.suppliers?.name ?? "",
        order_code: po?.orders?.order_code ?? "",
        corriere: d.corriere ?? "",
        autista: d.autista_nome ?? "",
        stato: DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ?? d.stato,
        quantita: String(d.quantita_ricevuta ?? 0),
        has_damages: (d.has_damages || d.stato === "non_conforme") ? "Sì" : "No",
        attachments_count: String((d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0)),
      };
    });
  }, [filtered]);

  const exportColumns = useMemo(() => ([
    { key: "numero_ddt", label: "N° DDT" },
    { key: "data", label: "Data" },
    { key: "oda", label: "N° OdA" },
    { key: "supplier", label: "Fornitore" },
    { key: "order_code", label: "Ordine Cliente" },
    { key: "corriere", label: "Corriere" },
    { key: "autista", label: "Autista" },
    { key: "stato", label: "Stato" },
    { key: "quantita", label: "Q.tà Ricevuta" },
    { key: "has_damages", label: "Non conforme" },
    { key: "attachments_count", label: "N. Allegati" },
  ]), []);

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun DDT da esportare", variant: "destructive" }); return; }
    exportToCSV(rows, exportColumns, `ddt-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${rows.length} DDT` });
  }, [buildExportRows, exportColumns, toast]);

  const exportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun DDT da esportare", variant: "destructive" }); return; }
    await exportToXLSX(rows, exportColumns, `ddt-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${rows.length} DDT` });
  }, [buildExportRows, exportColumns, toast]);

  const exportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast({ title: "Nessun DDT da esportare", variant: "destructive" }); return; }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("DDT Fornitori", 40, 40);
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} DDT`, 40, 56);

      const cols = [
        { key: "numero_ddt", label: "N° DDT", w: 70 },
        { key: "data", label: "Data", w: 60 },
        { key: "supplier", label: "Fornitore", w: 140 },
        { key: "oda", label: "OdA", w: 60 },
        { key: "corriere", label: "Corriere", w: 90 },
        { key: "stato", label: "Stato", w: 80 },
        { key: "quantita", label: "Q.tà", w: 50, align: "right" as const },
        { key: "has_damages", label: "NC", w: 40 },
        { key: "attachments_count", label: "All.", w: 40, align: "right" as const },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(40, y - 12, cols.reduce((a, c) => a + c.w, 0), 18, "F");
      cols.forEach((c) => { doc.text(c.label, x + 4, y); x += c.w; });
      y += 14;
      doc.setFont("helvetica", "normal");

      rows.forEach((r, i) => {
        if (y > 540) { doc.addPage(); y = 40; }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(40, y - 10, cols.reduce((a, c) => a + c.w, 0), 14, "F");
        }
        cols.forEach((c) => {
          const val = String(r[c.key as keyof typeof r] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed = val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
          if (c.align === "right") {
            doc.text(trimmed, x + c.w - 4, y, { align: "right" });
          } else {
            doc.text(trimmed, x + 4, y);
          }
          x += c.w;
        });
        y += 13;
      });

      doc.save(`ddt-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${rows.length} DDT` });
    } catch (e) {
      toast({ title: "Errore export PDF", description: e instanceof Error ? e.message : "Generazione PDF fallita", variant: "destructive" });
    }
  }, [buildExportRows, toast]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      tutti: ddtList.length,
      atteso: 0,
      attesa: 0,
      parziale: 0,
      ricevuto: 0,
      verificato: 0,
      non_conforme: 0,
    };
    for (const d of ddtList) {
      if (d.stato === "atteso" || d.stato === "attesa") c.atteso++;
      else c[d.stato as FilterKey] = (c[d.stato as FilterKey] || 0) + 1;
    }
    return c;
  }, [ddtList]);

  const kpis = useMemo(() => {
    const totalQty = ddtList.reduce((s, d) => s + Number(d.quantita_ricevuta || 0), 0);
    const verificati = ddtList.filter((d) => d.stato === "verificato").length;
    const damaged = ddtList.filter((d) => d.has_damages || d.stato === "non_conforme").length;
    const pct = ddtList.length > 0 ? Math.round((verificati / ddtList.length) * 100) : 0;
    return {
      total: ddtList.length,
      totalQty: totalQty.toLocaleString("it-IT", { maximumFractionDigits: 2 }),
      verificati,
      pct,
      damaged,
      pendenti: counts.atteso + counts.parziale,
    };
  }, [ddtList, counts]);

  return (
    <div className="space-y-5">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 sm:px-6 pt-5 pb-5 shadow-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <FileCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight truncate">DDT Fornitori</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Ricezioni merce, corrieri, verifica e non conformità in un'unica vista.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Esporta</span>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[11px]">DDT filtrati ({filtered.length})</DropdownMenuLabel>
              <DropdownMenuItem onClick={exportCSV}>
                <FileText className="h-4 w-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportXLSX}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDF}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filtri avanzati */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="relative">
                <Filter className="h-4 w-4 mr-1.5" />
                Filtri
                {activeFiltersCount > 0 && (
                  <Badge className="ml-2 h-5 px-1.5 text-[10px] bg-primary">{activeFiltersCount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Filtri avanzati</p>
                  {activeFiltersCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                      <X className="h-3 w-3 mr-1" /> Azzera
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fornitore</Label>
                  <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i fornitori</SelectItem>
                      {suppliers.filter((s) => s.is_active).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><CalendarIcon className="h-3 w-3" />DDT dal</Label>
                    <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">DDT al</Label>
                    <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Non conformità</Label>
                  <Select value={filterHasDamages} onValueChange={(v) => setFilterHasDamages(v as "all" | "yes" | "no")}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      <SelectItem value="yes">Con danni / non conformi</SelectItem>
                      <SelectItem value="no">Solo conformi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Allegati</Label>
                  <Select value={filterHasAttachments} onValueChange={(v) => setFilterHasAttachments(v as "all" | "yes" | "no")}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      <SelectItem value="yes">Con allegati</SelectItem>
                      <SelectItem value="no">Senza allegati</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            onClick={() => setNewOpen(true)}
            size="sm"
            disabled={availablePOs.length === 0}
            className="shrink-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nuovo DDT</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <OperationalKpiCard
          icon={FileCheck}
          label="DDT totali"
          value={kpis.total.toString()}
          tone="blue"
        />
        <OperationalKpiCard
          icon={ShieldCheck}
          label="Verificati"
          value={kpis.verificati.toString()}
          hint={`${kpis.pct}% del totale`}
          tone="green"
        />
        <OperationalKpiCard
          icon={Clock}
          label="Pendenti"
          value={kpis.pendenti.toString()}
          hint="Attesi / parziali"
          tone="amber"
        />
        <OperationalKpiCard
          icon={AlertTriangle}
          label="Non conformi"
          value={kpis.damaged.toString()}
          hint={kpis.damaged > 0 ? "Richiede attenzione" : "Nessuno"}
          tone={kpis.damaged > 0 ? "red" : "slate"}
        />
      </div>

      {/* ─── Filter pills + Search ─────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex overflow-x-auto gap-1 p-0.5 rounded-lg bg-muted/50 scrollbar-none">
          {FILTERS.map((f) => {
            const c = counts[f.key] ?? 0;
            const isActive = tab === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setTab(f.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all flex items-center gap-1.5",
                  isActive
                    ? "bg-orange-50 text-slate-950 shadow-sm ring-1 ring-orange-100"
                    : "text-muted-foreground hover:bg-white hover:text-slate-900"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] rounded-full",
                    isActive ? "bg-orange-100 text-orange-700" : "bg-muted-foreground/15"
                  )}
                >
                  {c}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca DDT, ODA, fornitore, corriere…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-slate-200 pl-8 text-sm shadow-none"
          />
        </div>
        </div>
      </div>

      {/* ─── List ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={!!search || tab !== "tutti"}
          canCreate={availablePOs.length > 0}
          onCreate={() => setNewOpen(true)}
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filtered.map((ddt) => (
              <MobileDDTCard
                key={ddt.id}
                ddt={ddt}
                onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <SortableTh label="N° DDT" active={sort.key === "numero"} direction={sort.direction} onClick={() => handleSort("numero")} />
                    <SortableTh label="Data" active={sort.key === "data"} direction={sort.direction} onClick={() => handleSort("data")} />
                    <SortableTh label="Fornitore / ODA" active={sort.key === "fornitore"} direction={sort.direction} onClick={() => handleSort("fornitore")} />
                    <SortableTh label="Corriere" active={sort.key === "corriere"} direction={sort.direction} onClick={() => handleSort("corriere")} />
                    <SortableTh label="Magazzino" active={sort.key === "magazzino"} direction={sort.direction} onClick={() => handleSort("magazzino")} />
                    <SortableTh label="Allegati" active={sort.key === "allegati"} direction={sort.direction} onClick={() => handleSort("allegati")} align="center" />
                    <SortableTh label="Q.tà" active={sort.key === "quantita"} direction={sort.direction} onClick={() => handleSort("quantita")} align="right" />
                    <SortableTh label="Stato" active={sort.key === "stato"} direction={sort.direction} onClick={() => handleSort("stato")} />
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ddt) => {
                    const po = ddt.purchase_orders;
                    const attachCount =
                      (ddt.attachments?.length ?? 0) + (ddt.ddt_file_url ? 1 : 0);
                    return (
                      <tr
                        key={ddt.id}
                        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => navigate(`/azienda/ddt/${ddt.id}`)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {ddt.ddt_file_url && (
                              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                            <span className="font-mono text-xs font-medium">
                              {ddt.numero_ddt}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium truncate max-w-[200px]">
                              {po?.suppliers?.name || "—"}
                            </span>
                            <div className="flex items-center gap-2 text-[11px]">
                              {po?.oda_number && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/azienda/ordini-acquisto/${po.id}`);
                                  }}
                                  className="inline-flex items-center gap-0.5 text-primary hover:underline font-mono"
                                >
                                  <ShoppingCart className="h-2.5 w-2.5" />
                                  {po.oda_number}
                                </button>
                              )}
                              {po?.orders?.order_code && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/azienda/ordini/${po.orders!.id}`);
                                  }}
                                  className="inline-flex items-center gap-0.5 text-primary hover:underline font-mono"
                                >
                                  <FileText className="h-2.5 w-2.5" />
                                  {po.orders.order_code}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          {ddt.corriere ? (
                            <div className="flex items-center gap-1.5">
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate max-w-[140px]">{ddt.corriere}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {ddt.warehouses?.name ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <WarehouseIcon className="h-3 w-3" />
                              {ddt.warehouses.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {attachCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                              <Paperclip className="h-3 w-3" />
                              {attachCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", {
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-3">
                          <DDTStatusBadge stato={ddt.stato} size="sm" />
                          {ddt.has_damages && (
                            <AlertTriangle className="h-3 w-3 text-rose-500 inline-block ml-1" />
                          )}
                        </td>
                        <td className="p-3">
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── New DDT Wizard ─────────────────────────────────── */}
      <NewDDTDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

// ============================================================================
// Empty state
// ============================================================================
function EmptyState({
  hasFilter,
  canCreate,
  onCreate,
}: {
  hasFilter: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="text-center py-12 sm:py-16 space-y-3 rounded-lg border-2 border-dashed">
      <div className="h-12 w-12 mx-auto rounded-full bg-muted flex items-center justify-center">
        <FileCheck className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-muted-foreground font-medium">
        {hasFilter ? "Nessun DDT corrisponde ai filtri" : "Nessun DDT registrato"}
      </p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {hasFilter
          ? "Prova a cambiare i filtri o la ricerca per trovare il DDT."
          : "Registra il primo DDT per tracciare le ricezioni merce con allegati, dati corriere e verifica qualità."}
      </p>
      {canCreate && !hasFilter && (
        <Button onClick={onCreate} className="mt-2">
          <Plus className="h-4 w-4 mr-1" /> Registra primo DDT
        </Button>
      )}
      {!canCreate && (
        <p className="text-xs text-muted-foreground italic">
          Crea prima un Ordine d'Acquisto per poter registrare un DDT.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Mobile DDT Card
// ============================================================================
function MobileDDTCard({
  ddt,
  onClick,
}: {
  ddt: ReturnType<typeof useDDTRicezioneList>["data"] extends (infer U)[] | undefined ? U : never;
  onClick: () => void;
}) {
  const po = ddt.purchase_orders;
  const attachCount = (ddt.attachments?.length ?? 0) + (ddt.ddt_file_url ? 1 : 0);
  const meta = DDT_STATO_META[ddt.stato] ?? DDT_STATO_META.atteso;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]",
        ddt.has_damages && "border-rose-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Line 1: numero + badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {ddt.ddt_file_url ? (
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-mono text-xs font-semibold truncate max-w-[180px]">
              {ddt.numero_ddt}
            </span>
            <DDTStatusBadge stato={ddt.stato} size="sm" />
          </div>

          {/* Line 2: fornitore */}
          {po?.suppliers?.name && (
            <div className="flex items-center gap-1 mt-1 text-sm font-medium">
              <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{po.suppliers.name}</span>
            </div>
          )}

          {/* Line 3: meta (data · ODA · corriere) */}
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
            <span>{format(new Date(ddt.data_ricezione), "dd/MM/yyyy", { locale: it })}</span>
            {po?.oda_number && (
              <span className="inline-flex items-center gap-0.5 text-primary">
                <ShoppingCart className="h-2.5 w-2.5" />
                {po.oda_number}
              </span>
            )}
            {ddt.corriere && (
              <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]">
                <Truck className="h-2.5 w-2.5" />
                {ddt.corriere}
              </span>
            )}
            {attachCount > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                {attachCount}
              </span>
            )}
          </div>

          {/* Non conformità */}
          {ddt.has_damages && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-600">
              <AlertTriangle className="h-3 w-3" />
              Non conformità rilevata
            </div>
          )}
        </div>

        {/* Right: qty + arrow */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-semibold text-sm tabular-nums">
            {Number(ddt.quantita_ricevuta).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-muted-foreground">unità</span>
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full mt-auto", meta.dotColor)} />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}
