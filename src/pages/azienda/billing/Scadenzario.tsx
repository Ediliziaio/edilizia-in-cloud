import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Plus, Loader2, Search, Filter, X } from "lucide-react";
import { useScadenzario } from "@/hooks/useScadenzario";
import ScadenzarioKPIs from "@/components/scadenzario/ScadenzarioKPIs";
import ScadenzarioTable from "@/components/scadenzario/ScadenzarioTable";
import MarkPaidDialog from "@/components/scadenzario/MarkPaidDialog";
import NewScadenzaDialog from "@/components/scadenzario/NewScadenzaDialog";
import type { Scadenza } from "@/hooks/useScadenzario";
import { isPast, isToday, startOfMonth, endOfMonth, addDays, addMonths, format } from "date-fns";

const DATE_PRESETS = [
  { label: "Questo mese", value: "questo_mese" },
  { label: "Prossimi 30gg", value: "30gg" },
  { label: "Prossimi 90gg", value: "90gg" },
  { label: "Personalizzato", value: "custom" },
];

function getDateRange(preset: string): { from: string; to: string } | null {
  const today = new Date();
  switch (preset) {
    case "questo_mese":
      return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(endOfMonth(today), "yyyy-MM-dd") };
    case "30gg":
      return { from: format(today, "yyyy-MM-dd"), to: format(addDays(today, 30), "yyyy-MM-dd") };
    case "90gg":
      return { from: format(today, "yyyy-MM-dd"), to: format(addDays(today, 90), "yyyy-MM-dd") };
    default:
      return null;
  }
}

export default function Scadenzario() {
  const { scadenze, isLoading, summary, isSummaryLoading, markPaid, create, cancel } = useScadenzario();
  const [tab, setTab] = useState("tutte");
  const [search, setSearch] = useState("");
  const [payDialog, setPayDialog] = useState<Scadenza | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const hasActiveFilters = datePreset || filterTipo || filterStatus;

  const clearFilters = () => {
    setDatePreset("");
    setCustomFrom("");
    setCustomTo("");
    setFilterTipo("");
    setFilterStatus("");
  };

  const filtered = useMemo(() => {
    let list = scadenze;

    // Tab filter
    if (tab === "da_incassare") list = list.filter((s) => s.direction === "entrata" && s.status !== "pagata" && s.status !== "annullata");
    else if (tab === "da_pagare") list = list.filter((s) => s.direction === "uscita" && s.status !== "pagata" && s.status !== "annullata");
    else if (tab === "scadute") list = list.filter((s) => {
      const d = new Date(s.due_date);
      return isPast(d) && !isToday(d) && s.status !== "pagata" && s.status !== "annullata";
    });
    else if (tab === "pagate") list = list.filter((s) => s.status === "pagata");

    // Date range filter
    const range = datePreset === "custom"
      ? (customFrom || customTo ? { from: customFrom, to: customTo } : null)
      : datePreset ? getDateRange(datePreset) : null;

    if (range) {
      if (range.from) list = list.filter((s) => s.due_date >= range.from);
      if (range.to) list = list.filter((s) => s.due_date <= range.to);
    }

    // Tipo filter
    if (filterTipo) list = list.filter((s) => s.tipo === filterTipo);

    // Status filter
    if (filterStatus) list = list.filter((s) => s.status === filterStatus);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.description.toLowerCase().includes(q) ||
        s.suppliers?.name?.toLowerCase().includes(q) ||
        s.invoices?.client_company_name?.toLowerCase().includes(q) ||
        s.invoices?.invoice_number?.toLowerCase().includes(q) ||
        s.marketing_contacts?.company_name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [scadenze, tab, search, datePreset, customFrom, customTo, filterTipo, filterStatus]);

  // Counts for tabs
  const counts = useMemo(() => {
    const active = scadenze.filter((s) => s.status !== "pagata" && s.status !== "annullata");
    const overdue = scadenze.filter((s) => {
      const d = new Date(s.due_date);
      return isPast(d) && !isToday(d) && s.status !== "pagata" && s.status !== "annullata";
    });
    return {
      tutte: scadenze.length,
      da_incassare: active.filter((s) => s.direction === "entrata").length,
      da_pagare: active.filter((s) => s.direction === "uscita").length,
      scadute: overdue.length,
      pagate: scadenze.filter((s) => s.status === "pagata").length,
    };
  }, [scadenze]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Scadenzario</h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Scadenza
        </Button>
      </div>

      {/* KPIs */}
      <ScadenzarioKPIs summary={summary} isLoading={isSummaryLoading} />

      {/* Tabs + Search + Filters toggle */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Tabs value={tab} onValueChange={setTab} className="flex-1">
            <TabsList>
              <TabsTrigger value="tutte">Tutte ({counts.tutte})</TabsTrigger>
              <TabsTrigger value="da_incassare">Da Incassare ({counts.da_incassare})</TabsTrigger>
              <TabsTrigger value="da_pagare">Da Pagare ({counts.da_pagare})</TabsTrigger>
              <TabsTrigger value="scadute">
                Scadute {counts.scadute > 0 && <span className="ml-1 text-destructive font-bold">({counts.scadute})</span>}
              </TabsTrigger>
              <TabsTrigger value="pagate">Pagate</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <Filter className="h-4 w-4" />
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
              )}
            </Button>
          </div>
        </div>

        {/* Advanced filters row */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Periodo</label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {datePreset === "custom" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Da</label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px] h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">A</label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px] h-9 text-sm" />
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="incasso_cliente">Incasso cliente</SelectItem>
                  <SelectItem value="pagamento_fornitore">Pagamento fornitore</SelectItem>
                  <SelectItem value="costo_aziendale">Costo aziendale</SelectItem>
                  <SelectItem value="scadenza_fiscale">Scadenza fiscale</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stato</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="da_pagare">Da pagare</SelectItem>
                  <SelectItem value="parziale">Parziale</SelectItem>
                  <SelectItem value="pagata">Pagata</SelectItem>
                  <SelectItem value="annullata">Annullata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1">
                <X className="h-3 w-3" /> Pulisci
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScadenzarioTable
          scadenze={filtered}
          onMarkPaid={(s) => setPayDialog(s)}
          onCancel={(id) => cancel.mutate(id)}
        />
      )}

      {/* Dialogs */}
      <MarkPaidDialog
        scadenza={payDialog}
        open={!!payDialog}
        onOpenChange={(o) => !o && setPayDialog(null)}
        onConfirm={(p) => {
          markPaid.mutate(p, { onSuccess: () => setPayDialog(null) });
        }}
        isPending={markPaid.isPending}
      />
      <NewScadenzaDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => {
          create.mutate(p, { onSuccess: () => setNewOpen(false) });
        }}
        isPending={create.isPending}
      />
    </div>
  );
}
