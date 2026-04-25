import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Receipt, ArrowDown, ArrowUp, ChevronLeft, ChevronRight,
  Download, Search, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Storico unificato transazioni crediti per una singola azienda.
 *
 * Sorgente: view `credit_transactions_unified` (migration 20260417000008).
 * Unifica ai_credit_transactions + email_credits_log + whatsapp_credits_log +
 * render ledger/logs in un unico stream con schema normalizzato
 * (credit_type, direction, amount, balance_before/after, ...).
 *
 * Pensato per embed nella tab Abbonamento della pagina dettaglio azienda
 * del SuperAdmin. Paginazione server-side, filtro per tipo wallet.
 */

type CreditType = "all" | "ai" | "email" | "whatsapp" | "render";

interface UnifiedRow {
  id: string;
  credit_type: "ai" | "email" | "whatsapp" | "render";
  company_id: string;
  direction: "in" | "out";
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  type: string;
  description: string | null;
  reference_id: string | null;
  reference_kind: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;

const TYPE_LABELS: Record<CreditType, string> = {
  all: "Tutti",
  ai: "AI Agents",
  email: "Email",
  whatsapp: "WhatsApp",
  render: "Render AI",
};

const TYPE_BADGE: Record<UnifiedRow["credit_type"], string> = {
  ai:       "bg-purple-100 text-purple-700 border-purple-200",
  email:    "bg-blue-100 text-blue-700 border-blue-200",
  whatsapp: "bg-emerald-100 text-emerald-700 border-emerald-200",
  render:   "bg-amber-100 text-amber-700 border-amber-200",
};

interface Props {
  companyId: string;
}

/**
 * Range temporali predefiniti (i custom usano dateFrom/dateTo).
 * 7d/30d/90d/all coprono i casi standard, custom range fornisce flessibilità.
 */
type DateRange = "7d" | "30d" | "90d" | "all" | "custom";

function rangeToCutoff(r: DateRange): string | null {
  if (r === "all" || r === "custom") return null;
  const days = r === "7d" ? 7 : r === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * KPI aggregati delle transazioni nel periodo (TUTTE, non solo la pagina corrente).
 * Hook separato così il KPI strip non re-fetcha quando cambia solo la pagina.
 */
function useKPIs(companyId: string, type: CreditType, dateRange: DateRange,
  customFrom: string, customTo: string) {
  return useQuery({
    queryKey: ["admin-credit-transactions-kpi", companyId, type, dateRange, customFrom, customTo],
    queryFn: async () => {
      let q = supabase
        .from("credit_transactions_unified")
        .select("credit_type, direction, amount")
        .eq("company_id", companyId)
        .limit(10_000); // Safety cap — niente paginazione, è solo per le KPI

      if (type !== "all") q = q.eq("credit_type", type);

      if (dateRange === "custom") {
        if (customFrom) q = q.gte("created_at", `${customFrom}T00:00:00.000Z`);
        if (customTo) q = q.lte("created_at", `${customTo}T23:59:59.999Z`);
      } else {
        const cutoff = rangeToCutoff(dateRange);
        if (cutoff) q = q.gte("created_at", cutoff);
      }

      const { data, error } = await q;
      if (error) throw error;

      let totalIn = 0;
      let totalOut = 0;
      let countIn = 0;
      let countOut = 0;
      // Render è "integer" quindi non sommiamo render dentro EUR
      for (const row of (data ?? []) as Array<Pick<UnifiedRow, "direction" | "amount" | "credit_type">>) {
        if (row.credit_type === "render") continue; // render escluso dalla somma EUR
        if (row.direction === "in") {
          totalIn += row.amount;
          countIn++;
        } else {
          totalOut += row.amount;
          countOut++;
        }
      }

      return {
        totalIn,
        totalOut,
        net: totalIn - totalOut,
        countIn,
        countOut,
        totalRows: data?.length ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });
}

export function CreditTransactionsTable({ companyId }: Props) {
  const [type, setType] = useState<CreditType>("all");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // FIX: prima `count: "exact"` su ogni page change faceva COUNT(*) full-scan.
  // Ora exact solo sulla prima pagina (per il totale UI), "planned" sulle altre.
  const { data, isLoading } = useQuery({
    queryKey: [
      "admin-credit-transactions-unified",
      companyId, type, page, dateRange, customFrom, customTo,
    ],
    queryFn: async () => {
      let q = supabase
        .from("credit_transactions_unified")
        .select("*", { count: page === 0 ? "exact" : "planned" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (type !== "all") q = q.eq("credit_type", type);

      if (dateRange === "custom") {
        if (customFrom) q = q.gte("created_at", `${customFrom}T00:00:00.000Z`);
        if (customTo) q = q.lte("created_at", `${customTo}T23:59:59.999Z`);
      } else {
        const cutoff = rangeToCutoff(dateRange);
        if (cutoff) q = q.gte("created_at", cutoff);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as UnifiedRow[], total: count ?? 0 };
    },
    enabled: !!companyId,
    staleTime: 30 * 1000,
  });

  const kpis = useKPIs(companyId, type, dateRange, customFrom, customTo);

  const allRows = data?.rows ?? [];
  // Search client-side (filter su descrizione + type del movimento)
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.type ?? "").toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // CSV export — esporta TUTTE le transazioni nel range corrente (non solo la pagina)
  const [exporting, setExporting] = useState(false);
  const handleExportCsv = async () => {
    if (!companyId) return;
    setExporting(true);
    const loadingToast = toast.loading("Preparazione export CSV...");
    try {
      let q = supabase
        .from("credit_transactions_unified")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10_000);

      if (type !== "all") q = q.eq("credit_type", type);
      if (dateRange === "custom") {
        if (customFrom) q = q.gte("created_at", `${customFrom}T00:00:00.000Z`);
        if (customTo) q = q.lte("created_at", `${customTo}T23:59:59.999Z`);
      } else {
        const cutoff = rangeToCutoff(dateRange);
        if (cutoff) q = q.gte("created_at", cutoff);
      }

      const { data: allData, error } = await q;
      if (error) throw error;
      const rows = (allData ?? []) as unknown as UnifiedRow[];
      if (rows.length === 0) {
        toast.dismiss(loadingToast);
        toast.warning("Nessuna transazione da esportare");
        return;
      }

      const escape = (v: string | number | null | undefined) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const headers = [
        "Data", "Wallet", "Direzione", "Tipo movimento", "Importo",
        "Saldo prima", "Saldo dopo", "Descrizione", "Riferimento",
      ];
      const csvRows = rows.map((r) =>
        [
          escape(format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss")),
          escape(r.credit_type),
          escape(r.direction === "in" ? "ENTRATA" : "USCITA"),
          escape(r.type),
          escape(r.direction === "out" ? -r.amount : r.amount),
          escape(r.balance_before ?? ""),
          escape(r.balance_after ?? ""),
          escape(r.description ?? ""),
          escape(r.reference_kind ? `${r.reference_kind}:${r.reference_id ?? ""}` : ""),
        ].join(","),
      );
      const csv = [headers.join(","), ...csvRows].join("\r\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transazioni-crediti-${companyId.slice(0, 8)}-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss(loadingToast);
      toast.success(`Esportate ${rows.length} transazioni`);
    } catch (e: unknown) {
      toast.dismiss(loadingToast);
      const msg = e instanceof Error ? e.message : "Errore export";
      toast.error("Errore export CSV", { description: msg });
    } finally {
      setExporting(false);
    }
  };

  const k = kpis.data;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Storico Transazioni Crediti
            </CardTitle>
            <CardDescription>
              Movimenti unificati da AI, Email, WhatsApp, Render — sorgente{" "}
              <code className="text-[0.7rem]">credit_transactions_unified</code>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI strip totali periodo */}
        {!kpis.isLoading && k && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-emerald-600" />
                Entrate
              </div>
              <p className="text-lg font-bold text-emerald-600 mt-0.5">
                {formatCurrency(k.totalIn)}
              </p>
              <p className="text-[10px] text-muted-foreground">{k.countIn} movimenti</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingDown className="h-3 w-3 text-destructive" />
                Uscite
              </div>
              <p className="text-lg font-bold text-destructive mt-0.5">
                {formatCurrency(k.totalOut)}
              </p>
              <p className="text-[10px] text-muted-foreground">{k.countOut} movimenti</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" />
                Saldo netto
              </div>
              <p
                className={cn(
                  "text-lg font-bold mt-0.5",
                  k.net > 0 ? "text-emerald-600" : k.net < 0 ? "text-destructive" : "",
                )}
              >
                {k.net > 0 ? "+" : ""}
                {formatCurrency(k.net)}
              </p>
              <p className="text-[10px] text-muted-foreground">solo wallet EUR</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Receipt className="h-3 w-3" />
                Totale
              </div>
              <p className="text-lg font-bold mt-0.5">
                {(k.totalRows ?? 0).toLocaleString("it-IT")}
              </p>
              <p className="text-[10px] text-muted-foreground">transazioni nel periodo</p>
            </div>
          </div>
        )}

        {/* Toolbar: filtri + search + export */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca descrizione o tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as CreditType);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_LABELS) as CreditType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={dateRange}
            onValueChange={(v) => {
              setDateRange(v as DateRange);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
              <SelectItem value="all">Tutto lo storico</SelectItem>
              <SelectItem value="custom">Personalizzato</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(0);
                }}
                className="w-32 h-8 text-xs"
                max={customTo || undefined}
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(0);
                }}
                className="w-32 h-8 text-xs"
                min={customFrom || undefined}
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 ml-auto"
            onClick={handleExportCsv}
            disabled={exporting || total === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {exporting ? "Export..." : "CSV"}
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search
              ? `Nessuna transazione corrisponde a "${search}"`
              : `Nessuna transazione crediti${type !== "all" ? ` per ${TYPE_LABELS[type]}` : ""} nel periodo selezionato`}
          </p>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead className="text-right">Saldo dopo</TableHead>
                    <TableHead>Descrizione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOut = row.direction === "out";
                    const isIntegerWallet = row.credit_type === "render";
                    const amountLabel = isIntegerWallet
                      ? `${isOut ? "-" : "+"}${row.amount}`
                      : `${isOut ? "-" : "+"}${formatCurrency(row.amount)}`;
                    const balanceLabel =
                      row.balance_after != null
                        ? isIntegerWallet
                          ? String(row.balance_after)
                          : formatCurrency(row.balance_after)
                        : "—";

                    return (
                      <TableRow key={`${row.credit_type}-${row.id}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yy HH:mm", {
                            locale: it,
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={TYPE_BADGE[row.credit_type]}>
                            {TYPE_LABELS[row.credit_type as CreditType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            {isOut ? (
                              <ArrowDown className="h-3 w-3 text-red-500" />
                            ) : (
                              <ArrowUp className="h-3 w-3 text-green-500" />
                            )}
                            <span className="font-mono">{row.type}</span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm ${
                            isOut ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {amountLabel}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          {balanceLabel}
                        </TableCell>
                        <TableCell
                          className="text-sm max-w-[260px] truncate"
                          title={row.description ?? undefined}
                        >
                          {row.description || (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {search
                  ? `${rows.length} di ${total} (filtrate)`
                  : `${total} transazioni`}{" "}
                · Pagina {page + 1} di {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
