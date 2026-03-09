import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfYear, endOfYear, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, BarChart3, PieChart, TrendingUp, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from "recharts";

const MONTHS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export default function BillingReports({ embedded = false }: { embedded?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["billing_reports", companyId, year],
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const { data, error } = await supabase
        .from("invoices")
        .select("id, status, document_type, issue_date, due_date, subtotal, tax_amount, total, paid_amount, client_company_name, invoice_number")
        .eq("company_id", companyId!)
        .gte("issue_date", from)
        .lte("issue_date", to)
        .neq("status", "cancelled")
        .order("issue_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Monthly revenue chart data
  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      name: MONTHS_IT[i],
      fatturato: 0,
      iva: 0,
      incassato: 0,
      count: 0,
    }));
    invoices.forEach((inv) => {
      if (!inv.issue_date || inv.document_type === "proforma") return;
      const m = parseInt(inv.issue_date.split("-")[1], 10) - 1;
      months[m].fatturato += Number(inv.subtotal);
      months[m].iva += Number(inv.tax_amount);
      months[m].incassato += Number(inv.paid_amount || 0);
      months[m].count += 1;
    });
    return months;
  }, [invoices]);

  // VAT breakdown
  const vatBreakdown = useMemo(() => {
    const totByStatus: Record<string, number> = {};
    invoices.forEach((inv) => {
      if (inv.document_type === "proforma") return;
      const label = inv.status === "paid" ? "Pagata" : inv.status === "overdue" ? "Scaduta" : "Da incassare";
      totByStatus[label] = (totByStatus[label] || 0) + Number(inv.total);
    });
    return Object.entries(totByStatus).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [invoices]);

  // Aging report
  const aging = useMemo(() => {
    const now = new Date();
    const buckets = { "0-30 gg": 0, "31-60 gg": 0, "61-90 gg": 0, "90+ gg": 0 };
    invoices.forEach((inv) => {
      if (inv.status === "paid" || !inv.due_date) return;
      const remaining = Number(inv.total) - Number(inv.paid_amount || 0);
      if (remaining <= 0) return;
      const due = new Date(inv.due_date);
      const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 0) return; // not yet due
      if (days <= 30) buckets["0-30 gg"] += remaining;
      else if (days <= 60) buckets["31-60 gg"] += remaining;
      else if (days <= 90) buckets["61-90 gg"] += remaining;
      else buckets["90+ gg"] += remaining;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [invoices]);

  // KPIs
  const kpis = useMemo(() => {
    const onlyInvoices = invoices.filter((i) => i.document_type === "invoice");
    const totalRevenue = onlyInvoices.reduce((s, i) => s + Number(i.subtotal), 0);
    const totalVat = onlyInvoices.reduce((s, i) => s + Number(i.tax_amount), 0);
    const totalCollected = onlyInvoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const avgInvoice = onlyInvoices.length > 0 ? totalRevenue / onlyInvoices.length : 0;
    return {
      totalRevenue,
      totalVat,
      totalCollected,
      avgInvoice,
      count: onlyInvoices.length,
      collectionRate: totalRevenue > 0 ? (totalCollected / (totalRevenue + totalVat)) * 100 : 0,
    };
  }, [invoices]);

  const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  const exportCsv = () => {
    const headers = ["Numero", "Data", "Cliente", "Imponibile", "IVA", "Totale", "Pagato", "Stato"];
    const rows = invoices.map((i) => [
      i.invoice_number || "",
      i.issue_date || "",
      i.client_company_name || "",
      Number(i.subtotal).toFixed(2),
      Number(i.tax_amount).toFixed(2),
      Number(i.total).toFixed(2),
      Number(i.paid_amount || 0).toFixed(2),
      i.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-fatturazione-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Report Fatturazione</h1>
          </div>
          <div className="flex items-center gap-3">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={invoices.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Esporta CSV
            </Button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-end gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} disabled={invoices.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Esporta CSV
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Fatturato netto</p>
                <p className="text-xl font-bold">{fmtEur(kpis.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">IVA totale</p>
                <p className="text-xl font-bold">{fmtEur(kpis.totalVat)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Incassato</p>
                <p className="text-xl font-bold">{fmtEur(kpis.totalCollected)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Fatture emesse</p>
                <p className="text-xl font-bold">{kpis.count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Media fattura</p>
                <p className="text-xl font-bold">{fmtEur(kpis.avgInvoice)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly bar chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Fatturato mensile {year}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => fmtEur(value)}
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }}
                    />
                    <Bar dataKey="fatturato" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Imponibile" />
                    <Bar dataKey="incassato" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Incassato" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status pie chart */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Ripartizione stato</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {vatBreakdown.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">Nessun dato</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <RechartsPie>
                      <Pie
                        data={vatBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {vatBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => fmtEur(value)} />
                    </RechartsPie>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aging report */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Aging Report — Crediti scaduti</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {aging.map((bucket) => (
                  <div key={bucket.name} className="text-center p-4 rounded-lg border">
                    <p className="text-sm text-muted-foreground mb-1">{bucket.name}</p>
                    <p className={`text-xl font-bold ${bucket.value > 0 ? "text-destructive" : ""}`}>
                      {fmtEur(bucket.value)}
                    </p>
                  </div>
                ))}
              </div>
              {aging.every((b) => b.value === 0) && (
                <p className="text-center text-muted-foreground mt-4 text-sm">🎉 Nessun credito scaduto!</p>
              )}
            </CardContent>
          </Card>

          {/* Collection rate */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tasso di incasso {year}</p>
                  <p className="text-3xl font-bold">{kpis.collectionRate.toFixed(1)}%</p>
                </div>
                <div className="w-48 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, kpis.collectionRate)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
