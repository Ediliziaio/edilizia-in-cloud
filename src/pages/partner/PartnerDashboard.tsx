import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MousePointerClick, Users, TrendingUp, DollarSign, Wallet, Copy, Check, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PartnerOnboardingModal } from "./PartnerOnboardingModal";

export default function PartnerDashboard() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: referrer, isLoading: loadingReferrer } = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrers")
        .select("*, referral_tiers(*)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: referredCompanies = [] } = useQuery({
    queryKey: ["my-referral-companies", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_companies")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .order("referred_at", { ascending: false });
      if (error) throw error;
      if (data.length === 0) return [];
      const companyIds = data.map((rc: any) => rc.company_id);
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, status, subscription_plan_id")
        .in("id", companyIds);
      const planIds = [...new Set((companies || []).filter((c: any) => c.subscription_plan_id).map((c: any) => c.subscription_plan_id!))];
      const { data: plans } = planIds.length > 0
        ? await supabase.from("subscription_plans").select("id, name, price_monthly").in("id", planIds)
        : { data: [] as any[] };
      return data.map((rc: any) => {
        const company = companies?.find((c: any) => c.id === rc.company_id);
        const plan = company?.subscription_plan_id ? plans?.find((p: any) => p.id === company.subscription_plan_id) : null;
        return { ...rc, company, plan };
      });
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ["my-commission-ledger", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from("referral_commission_ledger")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .eq("period_month", now.getMonth() + 1)
        .eq("period_year", now.getFullYear());
      if (error) throw error;
      return data;
    },
  });

  const { data: clicks = [] } = useQuery({
    queryKey: ["my-referral-clicks-30d", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from("referral_clicks")
        .select("created_at, converted")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: nextTier } = useQuery({
    queryKey: ["next-tier", referrer?.referral_tiers?.position],
    enabled: !!referrer?.referral_tiers,
    queryFn: async () => {
      const { data } = await supabase
        .from("referral_tiers")
        .select("*")
        .gt("position", referrer!.referral_tiers?.position ?? 0)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  if (loadingReferrer) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!referrer) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center space-y-4">
        <Users className="h-16 w-16 mx-auto text-muted-foreground" />
        <h2 className="text-2xl font-bold">Portale Partner non disponibile</h2>
        <p className="text-muted-foreground">Il tuo account non è associato a un profilo partner.</p>
      </div>
    );
  }

  const tier = referrer.referral_tiers;
  const activeCompanies = referredCompanies.filter((rc: any) => rc.is_active).length;
  const totalEarned = referrer.total_earned || 0;
  const totalPaid = referrer.total_paid || 0;
  const balance = totalEarned - totalPaid;
  const monthlyCommission = ledger.reduce((sum: number, l: any) => sum + (l.commission_amount || 0), 0);

  const tierProgress = nextTier
    ? Math.min(100, (activeCompanies / nextTier.min_active_companies) * 100)
    : 100;

  // Build chart data for last 30 days
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), 29 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayClicks = clicks.filter((c: any) => c.created_at?.startsWith(dateStr));
    return {
      date: format(date, "dd/MM"),
      click: dayClicks.length,
      conversioni: dayClicks.filter((c: any) => c.converted).length,
    };
  });

  const copyLink = () => {
    const link = `${window.location.origin}/login?ref=${referrer.referral_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiato!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Onboarding modal */}
      {!referrer.has_accepted_terms && (
        <PartnerOnboardingModal referrer={referrer} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portale Partner</h1>
          <p className="text-muted-foreground">Benvenuto, {referrer.name}</p>
        </div>
        {tier && (
          <Badge className="text-sm px-3 py-1" style={{ backgroundColor: tier.color, color: "#fff" }}>
            {tier.icon} {tier.name}
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <MousePointerClick className="h-3.5 w-3.5" /> Click Totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{referrer.total_clicks || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" /> Conversioni
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{referrer.total_conversions || 0}</p>
            <p className="text-xs text-muted-foreground">{referrer.conversion_rate || 0}% rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Aziende Attive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeCompanies}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" /> Commissioni Mese
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(monthlyCommission)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5" /> Saldo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balance > 0 ? "text-green-600" : ""}`}>{formatCurrency(balance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Progress */}
      {nextTier && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {tier?.icon} {tier?.name} ({activeCompanies} aziende)
              </span>
              <span className="text-sm text-muted-foreground">
                {nextTier.icon} {nextTier.name} ({nextTier.min_active_companies} aziende)
              </span>
            </div>
            <Progress value={tierProgress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              Ancora {nextTier.min_active_companies - activeCompanies} aziende per raggiungere {nextTier.icon} {nextTier.name} (+{Math.round((nextTier.commission_multiplier - 1) * 100)}% commissioni!)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Referral Link */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <ExternalLink className="h-5 w-5 text-muted-foreground shrink-0" />
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
              {window.location.origin}/login?ref={referrer.referral_code}
            </code>
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Copia</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Click vs Conversioni (30gg)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="click" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.1)" name="Click" />
                <Area type="monotone" dataKey="conversioni" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2)/0.1)" name="Conversioni" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Companies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultime Aziende Portate</CardTitle>
          </CardHeader>
          <CardContent>
            {referredCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna azienda ancora</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Piano</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referredCompanies.slice(0, 5).map((rc: any) => (
                    <TableRow key={rc.id}>
                      <TableCell className="font-medium">{rc.company?.name || "—"}</TableCell>
                      <TableCell className="text-sm">{rc.plan?.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={rc.is_active ? "default" : "secondary"}>
                          {rc.is_active ? "Attiva" : "Inattiva"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
