import { useState, useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen, Plus, Loader2, Search, Download, ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, Wallet, Bot, Trash2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";

const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

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

export default function PrimaNota() {
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [direction, setDirection] = useState<"entrata" | "uscita" | "">("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const { entries, isLoading, saldo, isSaldoLoading, create, remove } = usePrimaNota({
    fromDate,
    toDate,
    direction: direction || undefined,
    search,
  });

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

  // Monthly chart data (last 6 months)
  const chartData = useMemo(() => {
    const months: { month: string; entrate: number; uscite: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy", { locale: it });
      months.push({ month: label, entrate: 0, uscite: 0 });
      entries.forEach((e) => {
        if (e.entry_date.startsWith(key)) {
          if (e.direction === "entrata") months[months.length - 1].entrate += e.amount;
          else months[months.length - 1].uscite += e.amount;
        }
      });
    }
    return months;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Prima Nota</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Registrazione
          </Button>
        </div>
      </div>

      {/* Saldo Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Entrate</p>
            </div>
            <p className="text-xl font-bold text-green-600">
              {isSaldoLoading ? "..." : fmtEur(saldo?.entrate || 0)}
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
              {isSaldoLoading ? "..." : fmtEur(saldo?.uscite || 0)}
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
              {isSaldoLoading ? "..." : fmtEur(saldo?.saldo || 0)}
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
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => fmtEur(value)}
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
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
        <span className="text-muted-foreground text-sm">→</span>
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
        <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Direzione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tutte</SelectItem>
            <SelectItem value="entrata">Entrate</SelectItem>
            <SelectItem value="uscita">Uscite</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entriesWithBalance.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessun movimento trovato.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Categoria</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="text-right p-3 font-medium">Saldo</th>
                <th className="text-left p-3 font-medium">Metodo</th>
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
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABELS[e.category] || e.category}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <p className="font-medium truncate max-w-[220px]">{e.description}</p>
                    {e.reference_number && (
                      <p className="text-xs text-muted-foreground">Rif: {e.reference_number}</p>
                    )}
                    {e.suppliers?.name && (
                      <p className="text-xs text-muted-foreground">{e.suppliers.name}</p>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={`flex items-center justify-end gap-1 ${e.direction === "entrata" ? "text-green-700" : "text-destructive"}`}>
                      {e.direction === "entrata"
                        ? <ArrowDownLeft className="h-3.5 w-3.5" />
                        : <ArrowUpRight className="h-3.5 w-3.5" />
                      }
                      {e.direction === "uscita" ? "-" : "+"}{fmtEur(e.amount)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={e.runningBalance >= 0 ? "" : "text-destructive"}>
                      {fmtEur(e.runningBalance)}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize">
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
        </div>
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
