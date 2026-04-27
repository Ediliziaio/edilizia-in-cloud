import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShoppingCart, Plus, Loader2, Search, Truck, ShieldCheck, FileText, Download, ChevronDown,
  FileSpreadsheet, Filter, X, Calendar as CalendarIcon, Package, Wallet, Activity,
} from "lucide-react";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { formatCurrency } from "@/lib/formatters";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
import {
  QuotePageHeader,
  QuoteKpi,
  QuoteHubTabs,
  QuoteChip,
  QuotePrimaryButton,
  type HubTab,
} from "@/components/marketing/preventivi/ui/builderUI";

const STATUS_CHIP_VARIANT: Record<string, "default" | "green" | "orange" | "red" | "navy" | "yellow" | "blue"> = {
  bozza: "default",
  inviato: "blue",
  confermato: "green",
  parziale: "yellow",
  ricevuto: "green",
  annullato: "red",
};

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  confermato: "Confermato",
  parziale: "Parziale",
  ricevuto: "Ricevuto",
  annullato: "Annullato",
};

const VERIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  match: { label: "Verificato", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  partial_match: { label: "Discrepanze", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  mismatch: { label: "Non conforme", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

function VerificationBadge({ result }: { result: string | null | undefined }): JSX.Element | null {
  if (!result) return null;
  const cfg = VERIFICATION_BADGES[result];
  if (!cfg) return null;
  return (
    <Badge className={`text-xs border-0 gap-1 ${cfg.className}`}>
      <ShieldCheck className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export default function PurchaseOrdersList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { orders, isLoading, create } = usePurchaseOrders();
  const { suppliers } = useOperationalSuppliers();
  const [tab, setTab] = useState("tutti");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newDelivery, setNewDelivery] = useState("");
  const [newWarehouseId, setNewWarehouseId] = useState<string | null>(null);

  // Filtri avanzati
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterAmountMin, setFilterAmountMin] = useState<string>("");
  const [filterAmountMax, setFilterAmountMax] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (filterSupplier !== "all") n++;
    if (filterDateFrom) n++;
    if (filterDateTo) n++;
    if (filterAmountMin) n++;
    if (filterAmountMax) n++;
    return n;
  }, [filterSupplier, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  const clearFilters = () => {
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterAmountMin("");
    setFilterAmountMax("");
  };

  const filtered = useMemo(() => {
    let list = orders;
    if (tab === "attivi") list = list.filter((o) => !["annullato", "ricevuto"].includes(o.status));
    else if (tab === "ricevuti") list = list.filter((o) => o.status === "ricevuto");
    else if (tab === "annullati") list = list.filter((o) => o.status === "annullato");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.oda_number.toLowerCase().includes(q) ||
        o.suppliers?.name?.toLowerCase().includes(q) ||
        o.orders?.order_code?.toLowerCase().includes(q)
      );
    }

    if (filterSupplier !== "all") {
      list = list.filter((o) => o.supplier_id === filterSupplier);
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom + "T00:00:00").getTime();
      list = list.filter((o) => new Date(o.issue_date).getTime() >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo + "T23:59:59").getTime();
      list = list.filter((o) => new Date(o.issue_date).getTime() <= to);
    }
    if (filterAmountMin) {
      const min = Number(filterAmountMin);
      if (!isNaN(min)) list = list.filter((o) => Number(o.total) >= min);
    }
    if (filterAmountMax) {
      const max = Number(filterAmountMax);
      if (!isNaN(max)) list = list.filter((o) => Number(o.total) <= max);
    }

    return list;
  }, [orders, tab, search, filterSupplier, filterDateFrom, filterDateTo, filterAmountMin, filterAmountMax]);

  // Export handlers
  const buildExportRows = useCallback(() => {
    return filtered.map((o) => ({
      oda_number: o.oda_number,
      supplier: o.suppliers?.name ?? "",
      order_code: o.orders?.order_code ?? "",
      issue_date: format(new Date(o.issue_date), "dd/MM/yyyy"),
      expected_delivery: o.expected_delivery_date ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy") : "",
      status: STATUS_LABELS[o.status] ?? o.status,
      total: String(Number(o.total).toFixed(2)),
      verification: o.last_verification?.result ?? "",
    }));
  }, [filtered]);

  const exportColumns = useMemo(() => ([
    { key: "oda_number", label: "N° OdA" },
    { key: "supplier", label: "Fornitore" },
    { key: "order_code", label: "Ordine Cliente" },
    { key: "issue_date", label: "Data Emissione" },
    { key: "expected_delivery", label: "Consegna Prevista" },
    { key: "status", label: "Stato" },
    { key: "total", label: "Totale €" },
    { key: "verification", label: "Verifica" },
  ]), []);

  const exportCSV = useCallback(() => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    exportToCSV(rows, exportColumns, `oda-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${rows.length} OdA` });
  }, [buildExportRows, exportColumns, toast]);

  const exportXLSX = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    await exportToXLSX(rows, exportColumns, `oda-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${rows.length} OdA` });
  }, [buildExportRows, exportColumns, toast]);

  const exportPDF = useCallback(async () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      toast({ title: "Nessun OdA da esportare", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Ordini d'Acquisto", 40, 40);
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${rows.length} OdA`, 40, 56);

      const cols = [
        { key: "oda_number", label: "N° OdA", w: 70 },
        { key: "supplier", label: "Fornitore", w: 160 },
        { key: "order_code", label: "Ordine", w: 70 },
        { key: "issue_date", label: "Emissione", w: 70 },
        { key: "expected_delivery", label: "Consegna", w: 70 },
        { key: "status", label: "Stato", w: 80 },
        { key: "total", label: "Totale €", w: 80, align: "right" as const },
      ];
      let y = 80;
      let x = 40;
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(40, y - 12, cols.reduce((a, c) => a + c.w, 0), 18, "F");
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
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
            const num = Number(val);
            const formatted = !isNaN(num) && val !== "" ? `€ ${num.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : trimmed;
            doc.text(formatted, x + c.w - 4, y, { align: "right" });
          } else {
            doc.text(trimmed, x + 4, y);
          }
          x += c.w;
        });
        y += 13;
      });

      doc.save(`oda-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${rows.length} OdA` });
    } catch (e) {
      toast({
        title: "Errore export PDF",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    }
  }, [buildExportRows, toast]);

  const counts = useMemo(() => ({
    tutti: orders.length,
    attivi: orders.filter((o) => !["annullato", "ricevuto"].includes(o.status)).length,
    ricevuti: orders.filter((o) => o.status === "ricevuto").length,
    annullati: orders.filter((o) => o.status === "annullato").length,
  }), [orders]);

  const kpis = useMemo(() => {
    const active = orders.filter((o) => !["annullato", "ricevuto"].includes(o.status));
    return {
      activeCount: active.length,
      activeTotal: active.reduce((s, o) => s + Number(o.total), 0),
      totalAll: orders.reduce((s, o) => s + Number(o.total), 0),
    };
  }, [orders]);

  const handleCreate = () => {
    if (!newSupplierId) return;
    create.mutate(
      { supplier_id: newSupplierId, expected_delivery_date: newDelivery || undefined, delivery_warehouse_id: newWarehouseId },
      {
        onSuccess: (data: any) => {
          setNewOpen(false);
          setNewSupplierId("");
          setNewDelivery("");
          setNewWarehouseId(null);
          navigate(`/azienda/ordini-acquisto/${data.id}`);
        },
      }
    );
  };

  const hubTabs: HubTab[] = [
    { key: "tutti", label: "Tutti", icon: <ShoppingCart className="h-4 w-4" />, count: counts.tutti },
    { key: "attivi", label: "Attivi", icon: <Activity className="h-4 w-4" />, count: counts.attivi },
    { key: "ricevuti", label: "Ricevuti", icon: <Package className="h-4 w-4" />, count: counts.ricevuti },
    { key: "annullati", label: "Annullati", icon: <X className="h-4 w-4" />, count: counts.annullati },
  ];

  return (
    <div className="space-y-6">
      <QuotePageHeader
        title="Ordini d'Acquisto"
        subtitle="OdA ai fornitori: stato, verifica DDT, consegne previste."
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Esporta</span>
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px]">OdA filtrati ({filtered.length})</DropdownMenuLabel>
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

            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                  <Filter className="h-4 w-4 mr-1.5" />
                  Filtri
                  {activeFiltersCount > 0 && (
                    <Badge className="ml-2 h-5 px-1.5 text-[10px] bg-orange-500 hover:bg-orange-500">{activeFiltersCount}</Badge>
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
                      <Label className="text-xs flex items-center gap-1"><CalendarIcon className="h-3 w-3" />Data dal</Label>
                      <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data al</Label>
                      <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Importo min €</Label>
                      <Input type="number" value={filterAmountMin} onChange={(e) => setFilterAmountMin(e.target.value)} className="h-9 text-xs" placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Importo max €</Label>
                      <Input type="number" value={filterAmountMax} onChange={(e) => setFilterAmountMax(e.target.value)} className="h-9 text-xs" placeholder="∞" />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <QuotePrimaryButton onClick={() => setNewOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuovo OdA</span>
              <span className="sm:hidden">Nuovo</span>
            </QuotePrimaryButton>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QuoteKpi
          label="OdA attivi"
          value={kpis.activeCount}
          variant="orange"
          icon={<Activity className="h-4 w-4" />}
          hint={formatCurrency(kpis.activeTotal)}
        />
        <QuoteKpi
          label="Totale OdA"
          value={orders.length}
          variant="blue"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <QuoteKpi
          label="Valore totale"
          value={formatCurrency(kpis.totalAll)}
          variant="green"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <QuoteHubTabs tabs={hubTabs} active={tab} onSelect={setTab} />
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca OdA..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">
            {search ? "Nessun OdA trovato per la ricerca" : "Nessun ordine d'acquisto"}
          </p>
          <p className="text-sm text-muted-foreground">
            {search ? "Prova a cambiare i termini di ricerca." : "Crea il primo ordine d'acquisto per gestire i tuoi fornitori."}
          </p>
          {!search && (
            <Button onClick={() => setNewOpen(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-1" /> Crea il primo OdA
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Mobile card list */}
        <div className="sm:hidden divide-y border rounded-lg">
          {filtered.map((o) => (
            <div
              key={o.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted cursor-pointer ${o.status === "annullato" ? "opacity-50" : ""}`}
              onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium">{o.oda_number}</span>
                  <QuoteChip variant={STATUS_CHIP_VARIANT[o.status] || "default"}>
                    {STATUS_LABELS[o.status] || o.status}
                  </QuoteChip>
                  <VerificationBadge result={o.last_verification?.result} />
                </div>
                <div className="text-sm font-medium mt-0.5 flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.suppliers?.name || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</span>
                  {o.expected_delivery_date && <span>· consegna {format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it })}</span>}
                  {o.orders?.order_code && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <FileText className="h-3 w-3" /> {o.orders.order_code}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-semibold text-sm">{formatCurrency(Number(o.total))}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden sm:block rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">N° OdA</th>
              <th className="text-left p-3 font-medium">Fornitore</th>
              <th className="text-left p-3 font-medium">Ordine</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Stato</th>
              <th className="text-right p-3 font-medium">Totale</th>
              <th className="text-left p-3 font-medium">Consegna</th>
            </tr></thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className={`border-b hover:bg-muted/30 cursor-pointer ${o.status === "annullato" ? "opacity-50" : ""}`}
                  onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
                >
                  <td className="p-3 font-mono text-xs font-medium">{o.oda_number}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[180px]">{o.suppliers?.name || "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {o.orders?.order_code ? (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <FileText className="h-3 w-3" />
                        {o.orders.order_code}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <QuoteChip variant={STATUS_CHIP_VARIANT[o.status] || "default"}>
                        {STATUS_LABELS[o.status] || o.status}
                      </QuoteChip>
                      <VerificationBadge result={o.last_verification?.result} />
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium">{formatCurrency(Number(o.total))}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {o.expected_delivery_date ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* New OdA Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuovo Ordine d'Acquisto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fornitore</Label>
              <Select value={newSupplierId} onValueChange={setNewSupplierId}>
                <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data consegna prevista (opzionale)</Label>
              <Input type="date" value={newDelivery} onChange={(e) => setNewDelivery(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Magazzino di destinazione (opzionale)</Label>
              <WarehouseSelect
                value={newWarehouseId}
                onChange={setNewWarehouseId}
                nullable
                placeholder="Magazzino predefinito"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!newSupplierId || create.isPending}>
              {create.isPending ? "Creazione..." : "Crea OdA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
