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
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FileCheck, Plus, Loader2, Search, Truck, Warehouse as WarehouseIcon,
  FileText, ShoppingCart, ArrowRight, AlertTriangle, Paperclip,
  ShieldCheck, Image as ImageIcon, ChevronRight, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDDTRicezioneList, type DDTStato } from "@/hooks/useDDTRicezione";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { DDTStatusBadge, DDT_STATO_META } from "@/components/ddt/DDTStatusBadge";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";

type FilterKey = "tutti" | DDTStato;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "tutti", label: "Tutti" },
  { key: "atteso", label: "Attesi" },
  { key: "parziale", label: "Parziali" },
  { key: "ricevuto", label: "Ricevuti" },
  { key: "verificato", label: "Verificati" },
  { key: "non_conforme", label: "Non conformi" },
];

export default function DDTRicezioneList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<FilterKey>("tutti");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { data: ddtList = [], isLoading } = useDDTRicezioneList();
  const { orders } = usePurchaseOrders();

  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders]
  );

  const filtered = useMemo(() => {
    let list = ddtList;
    if (tab !== "tutti") {
      list = list.filter((d) => {
        // "atteso" include sia "atteso" che legacy "attesa"
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
    return list;
  }, [ddtList, tab, search]);

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
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2 shrink-0">
            <FileCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">DDT Fornitori</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Ricezioni merce con documenti, corriere, verifica e non conformità
            </p>
          </div>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className="shrink-0 h-10"
          disabled={availablePOs.length === 0}
          size="default"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden xs:inline ml-1.5">Nuovo DDT</span>
          <span className="xs:hidden ml-1">Nuovo</span>
        </Button>
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <KPICard
          icon={FileCheck}
          label="DDT totali"
          value={kpis.total.toString()}
          iconClassName="text-primary"
          bgClassName="from-primary/5 to-transparent"
        />
        <KPICard
          icon={ShieldCheck}
          label="Verificati"
          value={kpis.verificati.toString()}
          sublabel={`${kpis.pct}% del totale`}
          iconClassName="text-green-600"
          bgClassName="from-green-50 to-transparent dark:from-green-950/30"
        />
        <KPICard
          icon={Clock}
          label="Pendenti"
          value={kpis.pendenti.toString()}
          sublabel="Attesi / parziali"
          iconClassName="text-amber-600"
          bgClassName="from-amber-50 to-transparent dark:from-amber-950/30"
        />
        <KPICard
          icon={AlertTriangle}
          label="Non conformi"
          value={kpis.damaged.toString()}
          sublabel={kpis.damaged > 0 ? "Richiede attenzione" : "Nessuno"}
          iconClassName={kpis.damaged > 0 ? "text-rose-600" : "text-muted-foreground"}
          bgClassName={kpis.damaged > 0 ? "from-rose-50 to-transparent dark:from-rose-950/30" : ""}
        />
      </div>

      {/* ─── Filter pills + Search ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
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
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] rounded-full",
                    isActive ? "bg-primary/15 text-primary" : "bg-muted-foreground/15"
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
            className="pl-8 h-9 text-sm"
          />
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
                    <th className="text-left p-3 font-medium">N° DDT</th>
                    <th className="text-left p-3 font-medium">Data</th>
                    <th className="text-left p-3 font-medium">Fornitore / ODA</th>
                    <th className="text-left p-3 font-medium">Corriere</th>
                    <th className="text-left p-3 font-medium">Magazzino</th>
                    <th className="text-center p-3 font-medium">Allegati</th>
                    <th className="text-right p-3 font-medium">Q.tà</th>
                    <th className="text-left p-3 font-medium">Stato</th>
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
// KPI Card
// ============================================================================
function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  iconClassName,
  bgClassName,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  iconClassName?: string;
  bgClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", bgClassName && `bg-gradient-to-br ${bgClassName}`)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {label}
            </p>
            <p className="text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
            {sublabel && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                {sublabel}
              </p>
            )}
          </div>
          <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5 shrink-0", iconClassName)} />
        </div>
      </CardContent>
    </Card>
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
