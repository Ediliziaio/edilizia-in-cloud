import { useState, useMemo } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BookOpen, Plus, Loader2, Search, Download, ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, Wallet, Bot, Trash2, FileText, ExternalLink, RefreshCw,
} from "lucide-react";
import { PrimaNotaXBRL } from "@/components/contabilita/PrimaNotaXBRL";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

const CATEGORY_LABELS: Record<string, string> = {
  incasso: "Incasso",
  fornitore: "Fornitore",
  costo: "Costo",
  fiscale: "Fiscale",
  stipendi: "Stipendi",
  utenze: "Utenze",
  affitto: "Affitto",
  altro: "Altro",
};

function PrimaNotaInner() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const importMutation = useMutation({
    mutationFn: async (action: "from_banking" | "from_invoices" | "both") => {
      const res = await supabase.functions.invoke("sync-prima-nota", {
        body: { company_id: effectiveCompany?.id, action },
      });
      if (res.error) throw res.error;
      return res.data as { total: number; imported_banking: number; imported_invoices: number };
    },
    onSuccess: (data) => {
      if (data.total === 0) {
        toast.info("Nessuna novità da importare");
      } else {
        const parts = [];
        if (data.imported_banking > 0) parts.push(`${data.imported_banking} da banca`);
        if (data.imported_invoices > 0) parts.push(`${data.imported_invoices} da fatture`);
        toast.success(`Importate ${data.total} registrazioni`, { description: parts.join(", ") });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.primaNota.all });
    },
    onError: (e) => toast.error("Errore importazione", { description: String(e) }),
  });
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [direction, setDirection] = useState<"entrata" | "uscita" | "">("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [autoView, setAutoView] = useState<"tutte" | "auto" | "manuali">("tutte");

  const isAutoFilter = autoView === "auto" ? true : autoView === "manuali" ? false : null;

  const { entries, isLoading, totalCount, totalPages, saldo, isSaldoLoading, create, remove } = usePrimaNota({
    fromDate,
    toDate,
    direction: direction || undefined,
    search,
    isAuto: isAutoFilter,
  }, page, pageSize);

  // Running balance (from oldest to newest, then reverse for display)
  const entriesWithBalance = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    let balance = 0;
    const withBal = sorted.map((e) => {
      balance += e.direction === "entrata" ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
    return withBal.reverse();
  }, [entries]);

  // Monthly chart data (last 6 months) — single O(n) pass
  const chartData = useMemo(() => {
    const buckets = new Map<string, { month: string; entrate: number; uscite: number }>();
    const now = new Date();

    // Initialize 6 month buckets
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy", { locale: it });
      buckets.set(key, { month: label, entrate: 0, uscite: 0 });
    }

    // Single O(n) pass
    for (const e of entries) {
      const key = e.entry_date.slice(0, 7); // "yyyy-MM"
      const bucket = buckets.get(key);
      if (bucket) {
        if (e.direction === "entrata") bucket.entrate += e.amount;
        else bucket.uscite += e.amount;
      }
    }

    return Array.from(buckets.values());
  }, [entries]);

  const exportCSV = () => {
    const header = "Data,Direzione,Categoria,Descrizione,Importo,Metodo,Riferimento,Note,Auto\n";
    const rows = entries.map((e) =>
      [
        e.entry_date,
        e.direction,
        e.category,
        `"${e.description.replace(/"/g, '""')}"`,
        e.direction === "uscita" ? `-${e.amount}` : e.amount,
        e.payment_method || "",
        e.reference_number || "",
        `"${(e.notes || "").replace(/"/g, '""')}"`,
        e.is_auto ? "Sì" : "No",
      ].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prima-nota-${fromDate}-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Prima Nota</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <PrimaNotaXBRL
            entries={entries.map(e => ({
              data: e.entry_date,
              descrizione: e.description,
              importo_dare: e.direction === 'uscita' ? Number(e.amount) : 0,
              importo_avere: e.direction === 'entrata' ? Number(e.amount) : 0,
              conto: e.category,
            }))}
            anno={new Date(fromDate).getFullYear()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importMutation.mutate("both")}
            disabled={importMutation.isPending}
            title="Importa automaticamente da movimenti bancari riconciliati e fatture pagate"
          >
            {importMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-1" />}
            <span className="hidden sm:inline">Importa Auto</span>
            <span className="sm:hidden">Importa</span>
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nuova Registrazione</span>
            <span className="sm:hidden">Aggiungi</span>
          </Button>
        </div>
      </div>

      {/* Saldo Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Entrate</p>
            </div>
            <p className="text-xl font-bold text-green-600">
              {isSaldoLoading ? "..." : formatCurrency(saldo?.entrate || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <p className="text-xs text-muted-foreground">Uscite</p>
            </div>
            <p className="text-xl font-bold text-destructive">
              {isSaldoLoading ? "..." : formatCurrency(saldo?.uscite || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Saldo netto</p>
            </div>
            <p className={`text-xl font-bold ${(saldo?.saldo || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
              {isSaldoLoading ? "..." : formatCurrency(saldo?.saldo || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.some((d) => d.entrate > 0 || d.uscite > 0) && (
        <Card>
          <CardContent className="pt-4 pb-2">
            <p className="text-sm font-medium mb-3">Andamento ultimi 6 mesi</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyCompact} />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entrate" name="Entrate" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="uscite" name="Uscite" fill="hsl(0, 84%, 60%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {/* Search — full width on mobile, flexible on desktop */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-10"
          />
        </div>
        {/* Second row on mobile: toggles + direction */}
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup
            type="single"
            value={autoView}
            onValueChange={(v) => { if (v) { setAutoView(v as typeof autoView); setPage(1); } }}
            className="border rounded-md"
          >
            <ToggleGroupItem value="tutte" className="text-xs h-9 px-3">Tutte</ToggleGroupItem>
            <ToggleGroupItem value="auto" className="text-xs h-9 px-3">
              <Bot className="h-3 w-3 mr-1" /> Auto
            </ToggleGroupItem>
            <ToggleGroupItem value="manuali" className="text-xs h-9 px-3">Manuali</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={direction || "all"}
            onValueChange={(v) => {
              setDirection(v === "all" ? "" : (v as "entrata" | "uscita"));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Direzione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="entrata">Entrate</SelectItem>
              <SelectItem value="uscita">Uscite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
          <span className="text-muted-foreground text-sm shrink-0">→</span>
          <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-9 w-full sm:w-36" />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entriesWithBalance.length === 0 ? (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-muted-foreground">Nessun movimento trovato</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Prova a modificare i filtri o aggiungi la prima registrazione</p>
            <Button className="mt-4" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nuova Registrazione
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {entriesWithBalance.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className={`mt-0.5 shrink-0 ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                  {e.direction === "entrata"
                    ? <ArrowDownLeft className="h-4 w-4" />
                    : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium truncate">{e.description}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}</span>
                    {e.category && <span>· {CATEGORY_LABELS[e.category] || e.category}</span>}
                    {e.payment_method && <span>· {e.payment_method}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono font-medium text-sm ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                    {e.direction === "uscita" ? "-" : "+"}{formatCurrency(e.amount)}
                  </p>
                  {!e.is_auto && (
                    <button
                      className="text-muted-foreground hover:text-destructive mt-1"
                      onClick={() => remove.mutate(e.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Categoria</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="text-right p-3 font-medium hidden md:table-cell">Saldo</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Metodo</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {entriesWithBalance.map((e) => (
                <tr key={e.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {e.is_auto && <span title="Auto-generato"><Bot className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                      {format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <p className="font-medium truncate max-w-[260px]">{e.description}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {e.reference_number && (
                        <span className="text-xs text-muted-foreground">Rif: {e.reference_number}</span>
                      )}
                      {e.suppliers?.name && (
                        <span className="text-xs text-muted-foreground">{e.suppliers.name}</span>
                      )}
                      {e.is_auto && e.auto_source && (
                        <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-600">
                          {e.auto_source === "fattura_emessa" ? "Fattura" :
                           e.auto_source === "incasso_fattura" ? "Incasso" :
                           e.auto_source === "nota_credito" ? "Nota Credito" : e.auto_source}
                        </Badge>
                      )}
                      {e.documenti_fiscali?.id && (
                        <button
                          onClick={() => navigate(`/azienda/documenti/${e.documenti_fiscali!.id}`)}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          {e.documenti_fiscali.tipo === "nota_credito" ? "NC" : "Fatt."} #{e.documenti_fiscali.numero}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={`flex items-center justify-end gap-1 ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                      {e.direction === "entrata"
                        ? <ArrowDownLeft className="h-3.5 w-3.5" />
                        : <ArrowUpRight className="h-3.5 w-3.5" />
                      }
                      {e.direction === "uscita" ? "-" : "+"}{formatCurrency(e.amount)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono hidden md:table-cell">
                    <span className={e.runningBalance >= 0 ? "" : "text-destructive"}>
                      {formatCurrency(e.runningBalance)}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize hidden md:table-cell">
                    {e.payment_method || "—"}
                  </td>
                  <td className="p-3">
                    {!e.is_auto && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(e.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>{/* end hidden sm:block */}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && (
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}

      {/* Dialog */}
      <NewEntryDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={(p) => create.mutate(p, { onSuccess: () => setNewOpen(false) })}
        isPending={create.isPending}
      />
    </div>
  );
}

export default function PrimaNota() {
  return (
    <ErrorBoundary title="Errore nella prima nota">
      <PrimaNotaInner />
    </ErrorBoundary>
  );
}
