import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, isWithinInterval, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Package,
  HardHat,
  TrendingDown,
  CalendarDays,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  fornitore: "Fornitore",
  misura: "Misura",
  quantita: "Quantità",
  lavorazione: "Lavorazione",
  comunicazione: "Comunicazione",
  altro: "Altro",
};

const TYPE_LABELS: Record<string, string> = {
  merce: "Merce",
  manodopera: "Manodopera",
};

const CATEGORY_COLORS: Record<string, string> = {
  fornitore: "hsl(var(--destructive))",
  misura: "hsl(var(--primary))",
  quantita: "hsl(220, 70%, 55%)",
  lavorazione: "hsl(35, 85%, 50%)",
  comunicazione: "hsl(280, 60%, 55%)",
  altro: "hsl(var(--muted-foreground))",
};

type OrderError = {
  id: string;
  error_date: string;
  error_type: string;
  error_category: string;
  amount: number;
  description: string;
  order_id: string;
  orders: { order_code: string | null; description: string };
};

export default function GlobalErrors() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ["global-errors", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("order_errors")
        .select("*, orders!inner(order_code, description)")
        .eq("company_id", companyId)
        .order("error_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as OrderError[];
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    return errors.filter((e) => {
      if (filterCategory !== "all" && e.error_category !== filterCategory) return false;
      if (filterType !== "all" && e.error_type !== filterType) return false;
      if (dateFrom || dateTo) {
        const d = parseISO(e.error_date);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      return true;
    });
  }, [errors, filterCategory, filterType, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const totalLoss = filtered.reduce((s, e) => s + Number(e.amount), 0);
    const merceTotal = filtered.filter((e) => e.error_type === "merce").reduce((s, e) => s + Number(e.amount), 0);
    const manodoperaTotal = filtered.filter((e) => e.error_type === "manodopera").reduce((s, e) => s + Number(e.amount), 0);

    const catCount: Record<string, number> = {};
    filtered.forEach((e) => {
      catCount[e.error_category] = (catCount[e.error_category] || 0) + 1;
    });
    const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];

    const now = new Date();
    const monthStart = startOfMonth(now);
    const thisMonth = errors.filter((e) => parseISO(e.error_date) >= monthStart).reduce((s, e) => s + Number(e.amount), 0);

    return { totalLoss, merceTotal, manodoperaTotal, topCategory, thisMonth };
  }, [filtered, errors]);

  // Chart: losses by category
  const categoryChart = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.error_category] = (map[e.error_category] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({ category: CATEGORY_LABELS[cat] || cat, amount, key: cat }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  // Chart: monthly trend (last 6 months, from ALL errors not filtered)
  const monthlyChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = startOfMonth(subMonths(now, i));
      const e = startOfMonth(subMonths(now, i - 1));
      months.push({ label: format(s, "MMM yy", { locale: it }), start: s, end: e });
    }
    return months.map((m) => {
      const inMonth = errors.filter((e) => {
        const d = parseISO(e.error_date);
        return d >= m.start && d < m.end;
      });
      return {
        month: m.label,
        merce: inMonth.filter((e) => e.error_type === "merce").reduce((s, e) => s + Number(e.amount), 0),
        manodopera: inMonth.filter((e) => e.error_type === "manodopera").reduce((s, e) => s + Number(e.amount), 0),
      };
    });
  }, [errors]);

  const fmt = (v: number) => `€ ${v.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento errori...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Errori Globali</h1>
        <p className="text-muted-foreground">Panoramica di tutti gli errori registrati sugli ordini</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totale Perdite</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{fmt(stats.totalLoss)}</div>
            <p className="text-xs text-muted-foreground">{filtered.length} errori totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errori Merce</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats.merceTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errori Manodopera</CardTitle>
            <HardHat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats.manodoperaTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats.thisMonth)}</div>
            {stats.topCategory && (
              <p className="text-xs text-muted-foreground">
                Categoria più frequente: <strong>{CATEGORY_LABELS[stats.topCategory[0]] || stats.topCategory[0]}</strong> ({stats.topCategory[1]})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perdite per Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                  <YAxis type="category" dataKey="category" width={100} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="amount" name="Importo" radius={[0, 4, 4, 0]}>
                    {categoryChart.map((entry) => (
                      <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key] || "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Andamento Mensile (ultimi 6 mesi)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="merce" name="Merce" stackId="a" fill="hsl(var(--destructive))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="manodopera" name="Manodopera" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Tutti gli errori
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-1", dateFrom && "text-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yy") : "Da"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("gap-1", dateTo && "text-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yy") : "A"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {(filterCategory !== "all" || filterType !== "all" || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterCategory("all"); setFilterType("all"); setDateFrom(undefined); setDateTo(undefined); }}>
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Descrizione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nessun errore trovato
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{format(parseISO(e.error_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Link to={`/azienda/ordini/${e.order_id}`} className="text-primary hover:underline font-medium">
                          {e.orders.order_code || e.orders.description?.slice(0, 30)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.error_type === "merce" ? "destructive" : "default"}>
                          {TYPE_LABELS[e.error_type] || e.error_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{CATEGORY_LABELS[e.error_category] || e.error_category}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(Number(e.amount))}</TableCell>
                      <TableCell className="max-w-[250px] truncate">{e.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
