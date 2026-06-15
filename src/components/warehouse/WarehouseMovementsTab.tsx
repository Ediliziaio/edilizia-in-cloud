/**
 * WarehouseMovementsTab — registro globale dei movimenti di magazzino.
 *
 * Vista d'insieme di tutti i carichi/scarichi (warehouse_movements) della company
 * nel periodo selezionato, con filtri tipo/periodo/ricerca, riepilogo e export CSV.
 * Risolve nomi articolo / commessa / operatore con query mirate (no embed FK-name
 * guessing) per robustezza.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowDownToLine, ArrowUpFromLine, Search, Download, RefreshCw, AlertTriangle, History, Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { exportToCSV, type CsvColumn } from "@/lib/csvExport";

interface Props {
  companyId: string;
  warehouseFilter: string | null;
}

type PeriodKey = "7" | "30" | "90" | "all";

interface RawMovement {
  id: string;
  stock_item_id: string;
  movement_type: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  performed_by: string | null;
  order_id: string | null;
  lot_number: string | null;
  unit_cost: number | null;
  warehouse_id: string | null;
}

interface MovementRow extends RawMovement {
  itemName: string;
  orderCode: string | null;
  performerName: string | null;
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7": "Ultimi 7 giorni",
  "30": "Ultimi 30 giorni",
  "90": "Ultimi 90 giorni",
  all: "Tutto lo storico",
};

export default function WarehouseMovementsTab({ companyId, warehouseFilter }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [typeFilter, setTypeFilter] = useState<"all" | "carico" | "scarico">("all");
  const [query, setQuery] = useState("");

  const sinceISO = useMemo(() => {
    if (period === "all") return null;
    return subDays(new Date(), Number(period)).toISOString();
  }, [period]);

  const { data: rows = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["warehouse-movements-registry", companyId, warehouseFilter, sinceISO],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<MovementRow[]> => {
      let q = supabase
        .from("warehouse_movements")
        .select("id, stock_item_id, movement_type, quantity, notes, created_at, performed_by, order_id, lot_number, unit_cost, warehouse_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (warehouseFilter) q = q.eq("warehouse_id", warehouseFilter);
      if (sinceISO) q = q.gte("created_at", sinceISO);

      const { data, error } = await q;
      if (error) throw error;
      const movements = (data ?? []) as RawMovement[];
      if (movements.length === 0) return [];

      const stockIds = [...new Set(movements.map((m) => m.stock_item_id).filter(Boolean))];
      const orderIds = [...new Set(movements.map((m) => m.order_id).filter(Boolean))] as string[];
      const userIds = [...new Set(movements.map((m) => m.performed_by).filter(Boolean))] as string[];

      const [stockRes, orderRes, userRes] = await Promise.all([
        stockIds.length
          ? supabase.from("warehouse_stock").select("id, name").in("id", stockIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? supabase.from("orders").select("id, order_code").in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabase.from("profiles").select("id, first_name, last_name").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const nameById = new Map((stockRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
      const orderById = new Map((orderRes.data ?? []).map((o: { id: string; order_code: string | null }) => [o.id, o.order_code]));
      const userById = new Map(
        (userRes.data ?? []).map((u: { id: string; first_name: string | null; last_name: string | null }) =>
          [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || null],
        ),
      );

      return movements.map((m) => ({
        ...m,
        itemName: nameById.get(m.stock_item_id) ?? "Articolo eliminato",
        orderCode: m.order_id ? orderById.get(m.order_id) ?? m.order_id.slice(0, 8) : null,
        performerName: m.performed_by ? userById.get(m.performed_by) ?? null : null,
      }));
    },
  });

  const filtered = useMemo(() => {
    const norm = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.movement_type !== typeFilter) return false;
      if (!norm) return true;
      return (
        r.itemName.toLowerCase().includes(norm) ||
        (r.notes?.toLowerCase().includes(norm) ?? false) ||
        (r.lot_number?.toLowerCase().includes(norm) ?? false) ||
        (r.orderCode?.toLowerCase().includes(norm) ?? false)
      );
    });
  }, [rows, typeFilter, query]);

  const summary = useMemo(() => {
    let carichi = 0, scarichi = 0, valore = 0;
    for (const r of filtered) {
      const qty = Number(r.quantity) || 0;
      if (r.movement_type === "carico") carichi += qty;
      else scarichi += qty;
      valore += qty * Number(r.unit_cost ?? 0);
    }
    return { count: filtered.length, carichi, scarichi, valore };
  }, [filtered]);

  const handleExport = () => {
    const columns: CsvColumn[] = [
      { key: "data", label: "Data" },
      { key: "tipo", label: "Tipo" },
      { key: "articolo", label: "Articolo" },
      { key: "quantita", label: "Quantità" },
      { key: "costo_unitario", label: "Costo unitario" },
      { key: "valore", label: "Valore" },
      { key: "lotto", label: "Lotto" },
      { key: "commessa", label: "Commessa" },
      { key: "operatore", label: "Operatore" },
      { key: "note", label: "Note" },
    ];
    const data = filtered.map((r) => ({
      data: format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: it }),
      tipo: r.movement_type === "carico" ? "Carico" : "Scarico",
      articolo: r.itemName,
      quantita: `${r.movement_type === "carico" ? "+" : "-"}${r.quantity}`,
      costo_unitario: r.unit_cost != null ? String(r.unit_cost) : "",
      valore: r.unit_cost != null ? String(Number(r.quantity) * Number(r.unit_cost)) : "",
      lotto: r.lot_number ?? "",
      commessa: r.orderCode ?? "",
      operatore: r.performerName ?? "",
      note: r.notes ?? "",
    }));
    exportToCSV(data, columns, `magazzino_movimenti_${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca articolo, lotto, commessa o nota…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="carico">Solo carichi</SelectItem>
                <SelectItem value="scarico">Solo scarichi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{PERIOD_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Aggiorna</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Movimenti" value={String(summary.count)} icon={History} tone="slate" />
        <SummaryCard label="Carichi (pz)" value={`+${summary.carichi}`} icon={ArrowDownToLine} tone="emerald" />
        <SummaryCard label="Scarichi (pz)" value={`-${summary.scarichi}`} icon={ArrowUpFromLine} tone="red" />
        <SummaryCard label="Valore movimentato" value={formatCurrency(summary.valore)} icon={Download} tone="blue" />
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Impossibile caricare i movimenti.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Caricamento movimenti…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <History className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">Nessun movimento nel periodo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                I carichi (arrivi merce) e gli scarichi (uscite verso cantiere) compariranno qui.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Articolo</TableHead>
                    <TableHead className="text-center">Qtà</TableHead>
                    <TableHead className="hidden md:table-cell">Lotto</TableHead>
                    <TableHead className="hidden lg:table-cell">Commessa</TableHead>
                    <TableHead className="hidden lg:table-cell">Operatore</TableHead>
                    <TableHead className="hidden sm:table-cell">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={m.movement_type === "carico" ? "default" : "destructive"}
                          className={m.movement_type === "carico"
                            ? "gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400"
                            : "gap-1"}
                        >
                          {m.movement_type === "carico"
                            ? <ArrowDownToLine className="h-3 w-3" />
                            : <ArrowUpFromLine className="h-3 w-3" />}
                          {m.movement_type === "carico" ? "Carico" : "Scarico"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm font-medium">{m.itemName}</TableCell>
                      <TableCell className={`text-center font-semibold tabular-nums ${m.movement_type === "carico" ? "text-emerald-600" : "text-red-600"}`}>
                        {m.movement_type === "carico" ? "+" : "−"}{m.quantity}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.lot_number || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{m.orderCode || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{m.performerName || "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[200px] truncate text-sm text-muted-foreground">{m.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length >= 1000 && (
              <p className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
                Mostrati i 1000 movimenti più recenti del periodo. Restringi il periodo per vedere il resto.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: "slate" | "emerald" | "red" | "blue";
}) {
  const toneCls: Record<string, string> = {
    slate: "text-slate-500",
    emerald: "text-emerald-600",
    red: "text-red-600",
    blue: "text-blue-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <Icon className={`h-5 w-5 shrink-0 ${toneCls[tone]}`} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
          <p className="truncate text-lg font-bold leading-tight tabular-nums sm:text-xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
