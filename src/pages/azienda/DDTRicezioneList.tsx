import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import { useOperationalViewMemory } from "@/hooks/useOperationalViewMemory";
import {
  useOperationalArchive,
  inOperationalScope,
} from "@/hooks/useOperationalArchive";
import { OperationalHelp } from "@/components/orders/OperationalHelp";
import { OperationalArchive } from "@/components/orders/OperationalArchive";
import { OperationalTable } from "@/components/orders/OperationalTable";
import { usePipelineTransition } from "@/hooks/usePipelineTransition";
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

import { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileCheck,
  Plus,
  Search,
  Truck,
  Warehouse as WarehouseIcon,
  FileText,
  ArrowRight,
  AlertTriangle,
  Paperclip,
  ShieldCheck,
  Clock,
  Download,
  ChevronDown,
  FileSpreadsheet,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDDTRicezioneList, type DDTStato } from "@/hooks/useDDTRicezione";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import {
  DDTStatusBadge,
  DDT_STATO_META,
} from "@/components/ddt/DDTStatusBadge";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
import { OperationalViewSwitch } from "@/components/orders/OperationalViewSwitch";
import {
  OperationalBoard,
  OperationalPagination,
} from "@/components/orders/OperationalBoard";
import { usePermissions } from "@/hooks/usePermissions";
import {
  inOperationalPeriod,
  operationalPage,
  operationalPeriod,
  updateOperationalParams,
} from "@/lib/orders/operationalFilters";
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

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />;
  return direction === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
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
    <th
      scope="col"
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(
        "p-3 font-medium",
        align === "left" && "text-left",
        align === "center" && "text-center",
        align === "right" && "text-right",
      )}
    >
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
  const permissions = usePermissions();
  const canCreate =
    !permissions.solaLettura &&
    (permissions.canEditWarehouse ||
      permissions.canManagePurchasing ||
      permissions.canEditOrders ||
      permissions.isAdmin);
  const [params, setParams] = useSearchParams();
  useOperationalViewMemory("ddt", [
    "ddt_vista",
    "ddt_ambito",
    "ddt_cerca",
    "ddt_stato",
    "ddt_commessa",
    "ddt_fornitore",
    "ddt_periodo",
    "ddt_focus",
  ]);
  const update = (values: Record<string, string | null>) =>
    setParams(
      updateOperationalParams(
        params,
        "ddt",
        "stato" in values || "focus" in values
          ? { ...values, ambito: "all" }
          : values,
      ),
      {
        replace: true,
      },
    );
  const rawTab = params.get("ddt_stato") ?? "tutti";
  const tab: FilterKey = FILTERS.some((f) => f.key === rawTab)
    ? (rawTab as FilterKey)
    : "tutti";
  const setTab = (v: FilterKey) =>
    update({ stato: v, focus: null, ambito: "all" });
  const search = params.get("ddt_cerca") ?? "";
  const setSearch = (v: string) => update({ cerca: v });
  const view = params.get("ddt_vista") === "elenco" ? "elenco" : "pipeline";
  const archive = useOperationalArchive(
    "ddt_ambito",
    params.has("ddt_stato") || view === "elenco" ? "all" : "active",
  );
  const focus = ["pendenti", "verifica"].includes(params.get("ddt_focus") ?? "")
    ? params.get("ddt_focus")
    : "";
  const filterOrder = params.get("ddt_commessa") ?? "all";
  const filterSupplier = params.get("ddt_fornitore") ?? "all";
  const filterPeriodo = operationalPeriod(params.get("ddt_periodo"));
  const setFilterOrder = (v: string) => update({ commessa: v });
  const setFilterSupplier = (v: string) => update({ fornitore: v });
  const setFilterPeriodo = (v: string) => update({ periodo: v });
  const [newOpen, setNewOpen] = useState(false);
  const movement = usePipelineTransition({ kind: "ddt", enabled: canCreate });

  const [sort, setSort] = useState<{
    key: DDTSortKey;
    direction: SortDirection;
  }>({
    key: "data",
    direction: "desc",
  });

  const {
    data: ddtList = [],
    isLoading,
    isError,
    refetch,
  } = useDDTRicezioneList();
  const { orders } = usePurchaseOrders();

  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders],
  );

  const activeFiltersCount = [
    filterOrder !== "all",
    filterSupplier !== "all",
    filterPeriodo !== "tutto",
    !!search,
    tab !== "tutti",
    !!focus,
  ].filter(Boolean).length;
  const clearFilters = () =>
    update({
      commessa: null,
      fornitore: null,
      periodo: null,
      cerca: null,
      stato: null,
      focus: null,
    });
  const stage = (d: (typeof ddtList)[number]) =>
    d.has_damages || d.stato === "non_conforme"
      ? "non_conforme"
      : d.stato === "attesa"
        ? "atteso"
        : d.stato;
  const moveDocument = (id: string, target: string) => {
    const d = ddtList.find((d) => d.id === id);
    if (d)
      movement.request(
        {
          id: d.id,
          label: d.numero_ddt,
          status: d.stato,
          stage: stage(d),
          href: `/azienda/ddt/${d.id}`,
          damages: d.has_damages,
          quantity: Number(d.quantita_ricevuta),
        },
        target,
      );
  };

  // le scelte vengono dalle bolle che ci sono, non da tutta l'anagrafica
  const commesseInElenco = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of ddtList) {
      const o = d.purchase_orders?.orders;
      if (d.purchase_orders?.order_id && o?.order_code)
        m.set(d.purchase_orders.order_id, o.order_code);
    }
    return [...m.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "it", { numeric: true }),
    );
  }, [ddtList]);
  const fornitoriInElenco = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of ddtList) {
      const id = d.purchase_orders?.supplier_id;
      if (id) m.set(id, d.purchase_orders?.suppliers?.name ?? "Fornitore");
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [ddtList]);

  const handleSort = (key: DDTSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const baseFiltered = useMemo(() => {
    let list = ddtList;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
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

    if (filterOrder === "none")
      list = list.filter((d) => !d.purchase_orders?.order_id);
    else if (filterOrder !== "all")
      list = list.filter((d) => d.purchase_orders?.order_id === filterOrder);
    if (filterSupplier !== "all") {
      list = list.filter(
        (d) => d.purchase_orders?.supplier_id === filterSupplier,
      );
    }
    list = list.filter((d) =>
      inOperationalPeriod(d.data_ricezione, filterPeriodo),
    );

    const getSortValue = (d: (typeof ddtList)[number], key: DDTSortKey) => {
      const po = d.purchase_orders;
      switch (key) {
        case "numero":
          return d.numero_ddt;
        case "data":
          return new Date(d.data_ricezione ?? 0).getTime();
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
          return (
            DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ??
            d.stato
          );
        default:
          return "";
      }
    };

    return [...list].sort((a, b) => {
      const result = compareSortValues(
        getSortValue(a, sort.key),
        getSortValue(b, sort.key),
      );
      return sort.direction === "asc" ? result : -result;
    });
  }, [ddtList, search, filterOrder, filterSupplier, filterPeriodo, sort]);
  const filtered = baseFiltered.filter(
    (d) =>
      (tab === "tutti" || stage(d) === tab) &&
      inOperationalScope(stage(d) === "verificato", archive.scope) &&
      (!focus ||
        (focus === "pendenti"
          ? ["atteso", "parziale"].includes(stage(d))
          : stage(d) === "ricevuto")),
  );
  const page = operationalPage(params.get("ddt_pagina"), filtered.length);
  const visible = filtered.slice((page - 1) * 25, page * 25);

  // Export
  const buildExportRows = () => {
    return filtered.map((d) => {
      const po = d.purchase_orders;
      return {
        numero_ddt: d.numero_ddt,
        data: d.data_ricezione
          ? format(new Date(d.data_ricezione), "dd/MM/yyyy")
          : "",
        oda: po?.oda_number ?? "",
        supplier: po?.suppliers?.name ?? "",
        order_code: po?.orders?.order_code ?? "",
        corriere: d.corriere ?? "",
        autista: d.autista_nome ?? "",
        stato:
          DDT_STATO_META[d.stato as keyof typeof DDT_STATO_META]?.label ??
          d.stato,
        quantita: String(d.quantita_ricevuta ?? 0),
        has_damages: d.has_damages || d.stato === "non_conforme" ? "Sì" : "No",
        attachments_count: String(
          (d.attachments?.length ?? 0) + (d.ddt_file_url ? 1 : 0),
        ),
      };
    });
  };

  const exportColumns = useMemo(
    () => [
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
    ],
    [],
  );

  const exportCSV = () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun DDT da esportare", variant: "destructive" });
      return;
    }
    exportToCSV(
      rows,
      exportColumns,
      `ddt-${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    toast({ title: `CSV esportato — ${rows.length} DDT` });
  };

  const exportXLSX = async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun DDT da esportare", variant: "destructive" });
      return;
    }
    await exportToXLSX(
      rows,
      exportColumns,
      `ddt-${format(new Date(), "yyyy-MM-dd")}.xlsx`,
    );
    toast({ title: `Excel esportato — ${rows.length} DDT` });
  };

  const exportPDF = async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun DDT da esportare", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
      doc.setFontSize(14);
      doc.text("DDT Fornitori", 40, 40);
      doc.setFontSize(9);
      doc.text(
        `Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} DDT`,
        40,
        56,
      );

      const cols = [
        { key: "numero_ddt", label: "N° DDT", w: 70 },
        { key: "data", label: "Data", w: 60 },
        { key: "supplier", label: "Fornitore", w: 140 },
        { key: "oda", label: "OdA", w: 60 },
        { key: "corriere", label: "Corriere", w: 90 },
        { key: "stato", label: "Stato", w: 80 },
        { key: "quantita", label: "Q.tà", w: 50, align: "right" as const },
        { key: "has_damages", label: "NC", w: 40 },
        {
          key: "attachments_count",
          label: "All.",
          w: 40,
          align: "right" as const,
        },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(
        40,
        y - 12,
        cols.reduce((a, c) => a + c.w, 0),
        18,
        "F",
      );
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
      y += 14;
      doc.setFont("helvetica", "normal");

      rows.forEach((r, i) => {
        if (y > 540) {
          doc.addPage();
          y = 40;
        }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(
            40,
            y - 10,
            cols.reduce((a, c) => a + c.w, 0),
            14,
            "F",
          );
        }
        cols.forEach((c) => {
          const val = String(r[c.key as keyof typeof r] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed =
            val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
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
      toast({
        title: "Errore export PDF",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    }
  };

  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.key,
      f.key === "tutti"
        ? baseFiltered.length
        : baseFiltered.filter((d) => stage(d) === f.key).length,
    ]),
  ) as Record<FilterKey, number>;
  const kpis = {
    pending: counts.atteso + counts.parziale,
    verify: counts.ricevuto,
    verified: counts.verificato,
    damaged: counts.non_conforme,
  };
  const columns = [
    {
      id: "atteso",
      label: "Attesi",
      hint: "Merce ancora da ricevere",
      accent: "border-t-sky-500",
    },
    {
      id: "parziale",
      label: "Parziali",
      hint: "Ricezione da completare",
      accent: "border-t-amber-500",
    },
    {
      id: "ricevuto",
      label: "Da verificare",
      hint: "Merce ricevuta, controllo da eseguire",
      accent: "border-t-blue-500",
    },
    {
      id: "verificato",
      label: "Verificati",
      hint: "Controllo completato senza danni segnalati",
      accent: "border-t-emerald-500",
    },
    {
      id: "non_conforme",
      label: "Non conformi / danni",
      hint: "Difformità o danni da approfondire",
      accent: "border-t-rose-500",
    },
  ].map((c) => ({ ...c, items: filtered.filter((d) => stage(d) === c.id) }));
  const renderCard = (ddt: (typeof ddtList)[number]) => (
    <article
      className={cn(
        "block rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        stage(ddt) === "non_conforme" && "border-rose-200",
      )}
    >
      <PipelineCardHeading>
        <Link
          to={`/azienda/ddt/${ddt.id}`}
          className="min-w-0 truncate font-mono text-xs font-semibold text-primary"
          title={ddt.numero_ddt}
        >
          {ddt.numero_ddt}
        </Link>
        <DDTStatusBadge stato={ddt.stato} size="sm" />
      </PipelineCardHeading>
      <p className="mt-2 text-sm font-medium">
        {ddt.purchase_orders?.suppliers?.name ?? "Fornitore non indicato"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {ddt.purchase_orders?.oda_number ?? "OdA non disponibile"}
      </p>
      <p className="mt-1 text-xs text-primary">
        {ddt.purchase_orders?.orders?.order_code ?? "Senza commessa"}
      </p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>
          {ddt.data_ricezione
            ? format(new Date(ddt.data_ricezione), "dd/MM/yyyy")
            : "Data non indicata"}
          {ddt.ora_arrivo ? ` · ${ddt.ora_arrivo.slice(0, 5)}` : ""}
        </p>
        <p>{ddt.warehouses?.name ?? "Magazzino non indicato"}</p>
        {ddt.corriere && (
          <p className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {ddt.corriere}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs font-medium">
        Quantità ricevuta: {Number(ddt.quantita_ricevuta ?? 0)}
      </p>
      {ddt.has_damages && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-700">
          <AlertTriangle className="h-3 w-3" />
          Danni segnalati
        </p>
      )}
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        {(ddt.attachments?.length ?? 0) + (ddt.ddt_file_url ? 1 : 0)} allegati
      </p>
    </article>
  );

  return (
    <div className="space-y-5 max-sm:space-y-3">
      {/* ─── Header ── telefono: il titolo lo dice già la scheda «DDT»; restano
          filtri e «Nuovo», senza esportazioni. ─────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DDT fornitori</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ricezione, controllo della merce e documenti collegati a ordini e
            commesse.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap max-sm:w-full max-sm:flex-nowrap">
          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-sm:hidden">
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Esporta</span>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[11px]">
                DDT filtrati ({filtered.length})
              </DropdownMenuLabel>
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

          <Button
            onClick={() => {
              if (canCreate) setNewOpen(true);
            }}
            size="sm"
            disabled={!canCreate || availablePOs.length === 0}
            className="shrink-0 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25 max-sm:flex-1"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nuovo DDT</span>
            <span className="sm:hidden">Nuovo</span>
          </Button>
        </div>
      </div>

      <section
        aria-label="Riepilogo DDT"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <OperationalKpiCard
          icon={Clock}
          label="Da ricevere"
          value={kpis.pending}
          hint="attesi e parziali"
          tone="amber"
          isLoading={isLoading}
          active={focus === "pendenti"}
          onClick={() => update({ stato: null, focus: "pendenti" })}
        />
        <OperationalKpiCard
          icon={FileCheck}
          label="Da verificare"
          value={kpis.verify}
          hint="ricevuti, controllo da completare"
          tone="blue"
          isLoading={isLoading}
          active={focus === "verifica"}
          onClick={() => update({ stato: null, focus: "verifica" })}
        />
        <OperationalKpiCard
          icon={ShieldCheck}
          label="Verificati"
          value={kpis.verified}
          hint="senza danni segnalati"
          tone="green"
          isLoading={isLoading}
          active={tab === "verificato"}
          onClick={() => setTab("verificato")}
        />
        <OperationalKpiCard
          icon={AlertTriangle}
          label="Non conformi / danni"
          value={kpis.damaged}
          hint="documenti con criticità"
          tone={kpis.damaged ? "red" : "slate"}
          isLoading={isLoading}
          active={tab === "non_conforme"}
          onClick={() => setTab("non_conforme")}
        />
      </section>
      <section
        aria-label="Filtri DDT"
        className="space-y-2 rounded-xl border bg-white p-2.5 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <OperationalViewSwitch
            value={view}
            onChange={(v) => update({ vista: v, ambito: archive.scope })}
          />
          <OperationalHelp>
            Apri un DDT per registrare la ricezione, verificare la merce o
            consultare gli allegati. I documenti con danni sono raccolti tra le
            non conformità.
          </OperationalHelp>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca DDT"
              placeholder="Cerca DDT, OdA, commessa o corriere…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-9 text-xs"
            />
          </div>
          <Select value={filterOrder} onValueChange={setFilterOrder}>
            <SelectTrigger
              aria-label="Commessa DDT"
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le commesse</SelectItem>
              <SelectItem value="none">Senza commessa</SelectItem>
              {commesseInElenco.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger
              aria-label="Fornitore DDT"
              className="h-8 w-[165px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i fornitori</SelectItem>
              {fornitoriInElenco.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!!activeFiltersCount && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" />
              Azzera ({activeFiltersCount})
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 sm:flex-nowrap">
          <div
            role="group"
            aria-label="Stato DDT"
            className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-50 p-1 sm:flex-1"
          >
            {FILTERS.filter(
              (f) =>
                f.key === "tutti" ||
                inOperationalScope(f.key === "verificato", archive.scope),
            ).map((f) => (
              <button
                type="button"
                key={f.key}
                aria-pressed={tab === f.key && !focus}
                onClick={() => setTab(f.key)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium",
                  tab === f.key && !focus
                    ? "bg-orange-50 text-slate-950 ring-1 ring-orange-100"
                    : "text-muted-foreground hover:bg-white",
                )}
              >
                {f.key === "non_conforme" ? "Non conformi / danni" : f.label}{" "}
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-[10px]">
                  {
                    baseFiltered.filter(
                      (d) =>
                        (f.key === "tutti" || stage(d) === f.key) &&
                        inOperationalScope(
                          stage(d) === "verificato",
                          archive.scope,
                        ),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
            <SelectTrigger
              aria-label="Data ricezione DDT"
              className="h-8 w-[190px] shrink-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutto">Ricezione: sempre</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              <SelectItem value="anno">Quest’anno</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <OperationalArchive
            label="DDT"
            scope={archive.scope}
            onChange={(v) =>
              archive.setScope(v, ["ddt_stato", "ddt_focus", "ddt_pagina"])
            }
            active={
              baseFiltered.filter((d) => stage(d) !== "verificato").length
            }
            history={
              baseFiltered.filter((d) => stage(d) === "verificato").length
            }
          />
          <span>
            {filtered.length} di {ddtList.length} DDT
            {focus === "pendenti"
              ? " · Attesi e parziali"
              : focus === "verifica"
                ? " · Ricevuti da verificare"
                : ""}
          </span>
          <span>Le esportazioni includono tutti i DDT filtrati.</span>
        </div>
      </section>

      {/* ─── List ─────────────────────────────────────────────── */}
      {isError ? (
        <div role="alert" className="rounded-xl border p-6 text-sm">
          Impossibile caricare i DDT.{" "}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Riprova
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasFilter={activeFiltersCount > 0}
          canCreate={canCreate && availablePOs.length > 0}
          onCreate={() => {
            if (canCreate) setNewOpen(true);
          }}
        />
      ) : view === "pipeline" ? (
        <>
          <OperationalBoard
            label="Pipeline DDT"
            onOpen={(ddt) => navigate(`/azienda/ddt/${ddt.id}`)}
            onMove={canCreate ? moveDocument : undefined}
            disabled={movement.saving}
            getLabel={(r) => r.numero_ddt}
            columns={columns}
            renderCard={renderCard}
          />
        </>
      ) : (
        <>
          <OperationalTable label="Elenco DDT">
            <thead>
              <tr className="border-b bg-muted/50">
                <SortableTh
                  label="N° DDT"
                  active={sort.key === "numero"}
                  direction={sort.direction}
                  onClick={() => handleSort("numero")}
                />
                <SortableTh
                  label="Data"
                  active={sort.key === "data"}
                  direction={sort.direction}
                  onClick={() => handleSort("data")}
                />
                <SortableTh
                  label="Fornitore"
                  active={sort.key === "fornitore"}
                  direction={sort.direction}
                  onClick={() => handleSort("fornitore")}
                />
                <th scope="col">OdA</th>
                <th scope="col">Commessa</th>
                <SortableTh
                  label="Corriere"
                  active={sort.key === "corriere"}
                  direction={sort.direction}
                  onClick={() => handleSort("corriere")}
                />
                <SortableTh
                  label="Magazzino"
                  active={sort.key === "magazzino"}
                  direction={sort.direction}
                  onClick={() => handleSort("magazzino")}
                />
                <SortableTh
                  label="Allegati"
                  active={sort.key === "allegati"}
                  direction={sort.direction}
                  onClick={() => handleSort("allegati")}
                  align="center"
                />
                <SortableTh
                  label="Q.tà"
                  active={sort.key === "quantita"}
                  direction={sort.direction}
                  onClick={() => handleSort("quantita")}
                  align="right"
                />
                <SortableTh
                  label="Stato"
                  active={sort.key === "stato"}
                  direction={sort.direction}
                  onClick={() => handleSort("stato")}
                />
                <th scope="col">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ddt) => {
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
                        <Link
                          to={`/azienda/ddt/${ddt.id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          {ddt.numero_ddt}
                        </Link>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {ddt.data_ricezione
                        ? format(new Date(ddt.data_ricezione), "dd/MM/yyyy", {
                            locale: it,
                          })
                        : "—"}
                    </td>
                    <td>
                      <span
                        className="block min-w-40 max-w-56 truncate font-medium"
                        title={po?.suppliers?.name}
                      >
                        {po?.suppliers?.name || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {po?.oda_number ? (
                        <Link
                          to={`/azienda/ordini-acquisto/${po.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {po.oda_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {po?.orders?.order_code ? (
                        <Link
                          to={`/azienda/ordini/${po.orders.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {po.orders.order_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {ddt.corriere ? (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[140px]">
                            {ddt.corriere}
                          </span>
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
                    <td>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                      >
                        <Link to={`/azienda/ddt/${ddt.id}`}>
                          Apri
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </OperationalTable>
          <OperationalPagination
            page={page}
            total={filtered.length}
            onChange={(v) => update({ pagina: String(v) })}
            label="Pagine DDT"
          />
        </>
      )}

      {/* ─── New DDT Wizard ─────────────────────────────────── */}
      {movement.dialog}
      {canCreate && <NewDDTDialog open={newOpen} onOpenChange={setNewOpen} />}
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
        {hasFilter
          ? "Nessun DDT corrisponde ai filtri"
          : "Nessun DDT registrato"}
      </p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        {hasFilter
          ? "Prova a cambiare i filtri o la ricerca per trovare il DDT."
          : "Registra il primo DDT per tracciare le ricezioni merce con allegati, dati corriere e verifica qualità."}
      </p>
      {canCreate && !hasFilter && (
        <Button
          onClick={onCreate}
          className="mt-2 bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
        >
          <Plus className="h-4 w-4 mr-1" /> Registra primo DDT
        </Button>
      )}
    </div>
  );
}
