import { PartnerPageHeading, PartnerPageLink, PartnerLoadError } from "@/components/partner/PartnerPageHeading";
import { useState } from "react";
import { leggiTutteLeRighe } from "@/lib/impostazioni/usoTag";
import {
  monthlyReferralCommissionSeries, referralCommissionMonths, referralCommissionPeriod, sumBookedReferralCommissions,
} from "@/lib/referralCommissionTotals";
import { useReferralBalance } from "@/lib/referralPayouts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { escapeCsvCell } from "@/lib/csvExport";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, TrendingUp, Wallet, CheckCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MONTHS = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

type ReferrerCommissionSummary = {
  id: string;
};

type CommissionLedgerRow = {
  id: string;
  subscription_plan_name: string | null;
  plan_mrr: number | null;
  commission_type: string | null;
  commission_rate: number | null;
  tier_multiplier: number | null;
  commission_amount: number | null;
  status: string | null;
};

export default function PartnerCommissions() {
  const { user } = useAuth();
  const currentPeriod = referralCommissionPeriod();
  const [month, setMonth] = useState(currentPeriod.month);
  const [year, setYear] = useState(currentPeriod.year);

  const { data: referrer, isLoading: isReferrerLoading, isError: referrerError, refetch: reloadReferrer } = useQuery<ReferrerCommissionSummary | null>({
    queryKey: ["partner-commission-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("referrers").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: ledger = [], isLoading, isError: ledgerError, refetch: reloadLedger } = useQuery<CommissionLedgerRow[]>({
    queryKey: ["my-ledger", referrer?.id, month, year],
    enabled: !!referrer?.id,
    queryFn: () => leggiTutteLeRighe<CommissionLedgerRow>((from, to) => supabase
      .from("referral_commission_ledger")
      .select("id, subscription_plan_name, plan_mrr, commission_type, commission_rate, tier_multiplier, commission_amount, status")
      .eq("referrer_id", referrer!.id)
      .eq("period_month", month)
      .eq("period_year", year)
      .order("commission_amount", { ascending: false })
      .order("id")
      .range(from, to)),
  });

  const { data: monthlyTotals = [], isError: chartError, refetch: reloadChart } = useQuery({
    queryKey: ["my-monthly-totals", referrer?.id, month, year],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const periods = referralCommissionMonths({ month, year });
      const first = periods[0];
      const rows = await leggiTutteLeRighe((from, to) => supabase
        .from("referral_commission_ledger")
        .select("period_month, period_year, commission_amount, status")
        .eq("referrer_id", referrer!.id)
        .gte("period_year", first.year)
        .lte("period_year", year)
        .order("id")
        .range(from, to));
      return monthlyReferralCommissionSeries(rows, periods);
    },
  });

  const subtotal = sumBookedReferralCommissions(ledger);

  const exportCsvCommissions = () => {
    if (ledger.length === 0) { toast.error("Nessuna commissione da esportare"); return; }
    const monthName = MONTHS[month - 1];
    const esc = (v: string | number | null | undefined) => escapeCsvCell(v, ",");
    const csv = [
      ["Movimento", "Base netta", "Tipo", "Aliquota", "Moltipl.", "Commissione", "Stato"].join(","),
      ...ledger.map((l) => [
        esc(l.subscription_plan_name || "---"),
        esc(l.plan_mrr?.toFixed(2) || "0"),
        esc(l.commission_type || "---"),
        esc(l.commission_type === "percentage" || l.commission_type?.startsWith("stripe_") ? `${l.commission_rate}%` : `${l.commission_rate} €`),
        esc(`x${l.tier_multiplier}`),
        esc(l.commission_amount?.toFixed(2) || "0"),
        esc(l.status || "pending"),
      ].join(",")),
    ].join("\n");
    const bom  = "\uFEFF"; // BOM per Excel italiano
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `commissioni-${monthName.toLowerCase()}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Export ${monthName} ${year} scaricato`);
  };
  const { data: payoutBalance } = useReferralBalance(referrer?.id);

  const statusBadge = (row: CommissionLedgerRow) => {
    if (row.status === "cancelled") return <Badge variant="destructive">Annullato</Badge>;
    if (row.commission_type === "stripe_refund") return <Badge variant="outline">Storno</Badge>;
    if (row.commission_type === "stripe_refund_reversal") return <Badge variant="outline">Rettifica</Badge>;
    if (row.commission_type === "stripe_receipt" && row.status === "pending") {
      return <Badge variant="secondary">Incassato</Badge>;
    }
    switch (row.status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      default: return <Badge variant="secondary">In attesa</Badge>;
    }
  };

  if (isReferrerLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (referrerError) {
    return <PartnerLoadError message="Impossibile caricare il profilo partner." retry={() => void reloadReferrer()} />;
  }

  if (!referrer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <h1 className="text-xl font-semibold text-foreground">Commissioni non disponibili</h1>
            <p className="mt-2 text-sm">Il tuo account non è ancora associato a un profilo partner attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <PartnerPageHeading title="Commissioni" description="Consulta incassi, storni e rettifiche del periodo selezionato." actions={<PartnerPageLink to="/partner/payout">Vedi saldo e pagamenti</PartnerPageLink>} />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Maturato nel mese</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{isLoading || ledgerError ? "—" : formatCurrency(subtotal)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Commissioni nette storiche</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{payoutBalance ? formatCurrency(payoutBalance.earned + (payoutBalance.unvested ?? 0)) : "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Liquidato</span>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{payoutBalance ? formatCurrency(payoutBalance.paid) : "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Saldo disponibile</span>
          </CardHeader>
          <CardContent><p className={`text-xl font-bold ${payoutBalance && payoutBalance.available > 0 ? "text-green-600" : ""}`}>{payoutBalance ? formatCurrency(payoutBalance.available) : "—"}</p></CardContent>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex gap-3 items-center flex-wrap">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentPeriod.year, currentPeriod.year - 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsvCommissions} disabled={ledger.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> Esporta CSV
        </Button>
      </div>

      {/* Ledger table */}
      <Card>
        <CardContent className="p-0">
          {ledgerError ? (
            <PartnerLoadError message="Impossibile caricare i movimenti del periodo." retry={() => void reloadLedger()} />
          ) : isLoading ? (
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
                  <TableHead>Movimento</TableHead>
                  <TableHead className="text-right">Base netta</TableHead>
                  <TableHead className="text-right">Aliquota</TableHead>
                  <TableHead className="text-right">Moltipl.</TableHead>
                  <TableHead className="text-right">Commissione</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.subscription_plan_name || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(l.plan_mrr)}</TableCell>
                    <TableCell className="text-right">
                      {l.commission_type === "percentage" || l.commission_type?.startsWith("stripe_") ? `${l.commission_rate}%` : formatCurrency(l.commission_rate)}
                    </TableCell>
                    <TableCell className="text-right">×{l.tier_multiplier}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(l.commission_amount)}</TableCell>
                    <TableCell>{statusBadge(l)}</TableCell>
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
      {chartError ? (
        <PartnerLoadError message="Impossibile caricare lo storico mensile." retry={() => void reloadChart()} />
      ) : monthlyTotals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Commissioni nei sei mesi fino al periodo selezionato</CardTitle></CardHeader>
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
