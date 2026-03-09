import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign, TrendingUp, Wallet, CheckCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

export default function PartnerCommissions() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: referrer } = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("referrers").select("id, total_earned, total_paid").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: ledger = [], isLoading } = useQuery({
    queryKey: ["my-ledger", referrer?.id, month, year],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_commission_ledger")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .eq("period_month", month)
        .eq("period_year", year)
        .order("commission_amount", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: monthlyTotals = [] } = useQuery({
    queryKey: ["my-monthly-totals", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referral_commission_ledger")
        .select("period_month, period_year, commission_amount")
        .eq("referrer_id", referrer!.id)
        .gte("period_year", year - 1);
      if (!data) return [];
      const map: Record<string, number> = {};
      data.forEach((d: any) => {
        const key = `${d.period_year}-${String(d.period_month).padStart(2, "0")}`;
        map[key] = (map[key] || 0) + (d.commission_amount || 0);
      });
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([key, total]) => ({
          month: key.split("-")[1] + "/" + key.split("-")[0].slice(2),
          total,
        }));
    },
  });

  const subtotal = ledger.reduce((sum: number, l: any) => sum + (l.commission_amount || 0), 0);
  const totalEarned = referrer?.total_earned || 0;
  const totalPaid = referrer?.total_paid || 0;
  const balance = totalEarned - totalPaid;

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      case "cancelled": return <Badge variant="destructive">Annullato</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Commissioni</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Maturato Mese</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{formatCurrency(subtotal)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Totale Storico</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{formatCurrency(totalEarned)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Già Pagato</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{formatCurrency(totalPaid)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Da Ricevere</span>
          </CardHeader>
          <CardContent><p className={`text-xl font-bold ${balance > 0 ? "text-green-600" : ""}`}>{formatCurrency(balance)}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ledger table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : ledger.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nessuna commissione per questo periodo</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Piano</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Moltipl.</TableHead>
                  <TableHead className="text-right">Commissione</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.subscription_plan_name || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(l.plan_mrr)}</TableCell>
                    <TableCell className="text-right">
                      {l.commission_type === "percentage" ? `${l.commission_rate}%` : formatCurrency(l.commission_rate)}
                    </TableCell>
                    <TableCell className="text-right">×{l.tier_multiplier}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(l.commission_amount)}</TableCell>
                    <TableCell>{statusBadge(l.status)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={4} className="font-medium">Subtotale {MONTHS[month - 1]}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(subtotal)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Monthly chart */}
      {monthlyTotals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Commissioni Mensili (ultimi 6 mesi)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTotals}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => [formatCurrency(v), "Commissione"]} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Commissione" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
