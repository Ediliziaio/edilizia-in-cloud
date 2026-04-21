import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useSaasMetrics } from "@/hooks/useSaasMetrics";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, DollarSign, Users, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, ArrowUpDown, BarChart3, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RenderEconomicsTab } from "@/components/admin/RenderEconomicsTab";
import { getCompanyMonthlyRevenue, isRevenueEligibleCompany } from "@/lib/adminRevenue";

function fmt(value: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
}

// ─── Types ────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
}

interface RevenueCompany {
  id: string;
  name: string | null;
  subscription_plan_id: string | null;
  status: string;
  payment_method: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_status: string | null;
  is_platform_admin_company: boolean | null;
  subscription_plans: Plan | null;
  company_subscriptions?: Array<{
    status: string | null;
    stripe_subscription_id: string | null;
    billing_period: string | null;
  }> | null;
}

interface PlanBreakdown {
  name: string;
  count: number;
  mrr: number;
}

interface RevenueData {
  mrr: number;
  arr: number;
  byPlan: PlanBreakdown[];
  activeCount: number;
}

interface MrrSnapshot {
  id?: string;
  data: string;
  mrr_stripe_cents: number;
  mrr_interno_cents: number;
  aziende_attive_stripe: number;
  aziende_attive_interno: number;
  breakdown_per_piano: Record<string, number>;
  created_at?: string;
}

// ─── Hooks ────────────────────────────────────────────────

function useRevenueDashboard() {
  return useQuery<RevenueData>({
    queryKey: ["admin-revenue-dashboard"],
    queryFn: async () => {
      const [plansRes, subsRes] = await Promise.all([
        supabase.from("subscription_plans").select("id,name,price_monthly,price_yearly"),
        supabase
          .from("companies")
          .select("id,name,status,payment_method,stripe_customer_id,stripe_subscription_status,is_platform_admin_company,subscription_plan_id,subscription_plans:subscription_plan_id(id,name,price_monthly,price_yearly),company_subscriptions(status,stripe_subscription_id,billing_period)")
          .eq("is_platform_admin_company", false),
      ]);

      if (plansRes.error) throw plansRes.error;
      if (subsRes.error) throw subsRes.error;

      const plans = (plansRes.data ?? []) as Plan[];
      const paidCompanies = ((subsRes.data ?? []) as RevenueCompany[]).filter(isRevenueEligibleCompany);

      const mrr = paidCompanies.reduce((sum, company) => sum + getCompanyMonthlyRevenue(company), 0);

      const byPlan: PlanBreakdown[] = plans
        .map((p) => {
          const companiesForPlan = paidCompanies.filter((c) => c.subscription_plan_id === p.id);
          return {
            name: p.name,
            count: companiesForPlan.length,
            mrr: companiesForPlan.reduce((sum, company) => sum + getCompanyMonthlyRevenue(company), 0),
          };
        })
        .filter((p) => p.count > 0);

      return { mrr, arr: mrr * 12, byPlan, activeCount: paidCompanies.length };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useMrrSnapshots() {
  return useQuery({
    queryKey: ["admin", "mrr-snapshots"],
    queryFn: async (): Promise<MrrSnapshot[]> => {
      const { data, error } = await (supabase
        .from("mrr_snapshots" as never)
        .select("*")
        .order("data" as never, { ascending: false })
        .limit(30) as unknown as Promise<{ data: MrrSnapshot[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Revenue Tab ──────────────────────────────────────────

function RevenueTab() {
  const { data, isLoading, refetch, isFetching } = useRevenueDashboard();

  const kpis = [
    { label: "MRR Corrente Pagante", value: fmt(data?.mrr ?? 0), icon: DollarSign, color: "text-emerald-600" },
    { label: "ARR Proiettato", value: fmt(data?.arr ?? 0), icon: TrendingUp, color: "text-blue-600" },
    { label: "Abbonamenti Paganti", value: String(data?.activeCount ?? 0), icon: Users, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="rounded-full bg-muted p-3">
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{k.label}</p>
                    <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Breakdown per Piano</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.byPlan ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessun abbonamento attivo</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Piano</th>
                      <th className="text-right py-2">Aziende</th>
                      <th className="text-right py-2">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byPlan ?? []).map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.name}</td>
                        <td className="py-2 text-right">{p.count}</td>
                        <td className="py-2 text-right font-mono">{fmt(p.mrr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Reconciliation Tab ───────────────────────────────────

function ReconciliationTab() {
  const qc = useQueryClient();
  const { data: snapshots = [], isLoading } = useMrrSnapshots();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-stripe-mrr`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{
        mrr_stripe: number;
        mrr_interno: number;
        discrepanza: number;
        aziende_stripe: number;
        data: string;
      }>;
    },
    onSuccess: (result) => {
      const disc = result.discrepanza / 100;
      toast.success(
        `Sincronizzazione completata. Stripe: ${fmt(result.mrr_stripe / 100)} · DB: ${fmt(result.mrr_interno / 100)} · Discrepanza: ${fmt(Math.abs(disc))}`
      );
      void qc.invalidateQueries({ queryKey: ["admin", "mrr-snapshots"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const latest = snapshots[0];
  const discrepancyCents = latest
    ? Math.abs(latest.mrr_stripe_cents - latest.mrr_interno_cents)
    : 0;
  const discrepancyPct = latest && latest.mrr_stripe_cents > 0
    ? (discrepancyCents / latest.mrr_stripe_cents) * 100
    : 0;
  const isAligned = discrepancyCents < 100; // < €1 diff = aligned

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Confronto MRR tra Stripe (fonte veritiera) e database interno
          </p>
          {latest && (
            <p className="text-xs text-muted-foreground">
              Ultimo snapshot: {format(new Date(latest.data), "dd MMMM yyyy", { locale: it })}
            </p>
          )}
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Sincronizzazione..." : "Sincronizza ora"}
        </Button>
      </div>

      {/* Alignment Status */}
      {latest && (
        isAligned ? (
          <Alert className="border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-700">
              Dati allineati — discrepanza inferiore a €1
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Discrepanza rilevata: {fmt(discrepancyCents / 100)} ({discrepancyPct.toFixed(1)}% del MRR Stripe).
              Verifica abbonamenti non sincronizzati.
            </AlertDescription>
          </Alert>
        )
      )}

      {/* Latest snapshot KPIs */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "MRR Stripe", value: fmt(latest.mrr_stripe_cents / 100), color: "text-emerald-600" },
            { label: "MRR DB Pagante", value: fmt(latest.mrr_interno_cents / 100), color: "" },
            { label: "Discrepanza", value: fmt(discrepancyCents / 100), color: discrepancyCents > 100 ? "text-destructive" : "text-muted-foreground" },
            { label: "Aziende Stripe", value: latest.aziende_attive_stripe.toString(), color: "" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Breakdown per piano from latest snapshot */}
      {latest && Object.keys(latest.breakdown_per_piano ?? {}).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown Stripe per Piano</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Piano</th>
                  <th className="text-right py-2">MRR Stripe</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(latest.breakdown_per_piano)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, cents]) => (
                    <tr key={name} className="border-b last:border-0">
                      <td className="py-2 font-medium">{name}</td>
                      <td className="py-2 text-right font-mono">{fmt(cents / 100)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Historical snapshots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Storico Snapshot MRR
          </CardTitle>
          <CardDescription>Ultimi 30 giorni di riconciliazione</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : snapshots.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nessuno snapshot disponibile. Clicca "Sincronizza ora" per creare il primo.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-right px-4 py-2">Stripe MRR</th>
                  <th className="text-right px-4 py-2">DB MRR</th>
                  <th className="text-right px-4 py-2">Discrepanza</th>
                  <th className="text-right px-4 py-2">Aziende Stripe</th>
                  <th className="text-center px-4 py-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const diff = Math.abs(s.mrr_stripe_cents - s.mrr_interno_cents);
                  const ok = diff < 100;
                  return (
                    <tr key={s.data} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {format(new Date(s.data), "dd/MM/yyyy", { locale: it })}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(s.mrr_stripe_cents / 100)}</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(s.mrr_interno_cents / 100)}</td>
                      <td className={`px-4 py-2 text-right font-mono ${!ok ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {fmt(diff / 100)}
                      </td>
                      <td className="px-4 py-2 text-right">{s.aziende_attive_stripe}</td>
                      <td className="px-4 py-2 text-center">
                        {ok ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300 text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Gap</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── LTV / CAC Tab ───────────────────────────────────────

const MESI_IT = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

function LTVCACTab() {
  const { metrics, cacInputs, isLoading, salvaInputCac } = useSaasMetrics();
  const [formAnno, setFormAnno] = useState(new Date().getFullYear());
  const [formMese, setFormMese] = useState(new Date().getMonth() + 1);
  const [formSpesa, setFormSpesa] = useState("");
  const [formNuove, setFormNuove] = useState("");
  const [formNote, setFormNote] = useState("");

  const ltvCacRatio = metrics.cac > 0 ? metrics.ltv / metrics.cac : 0;
  const ratioColor =
    ltvCacRatio >= 3 ? "text-emerald-600" :
    ltvCacRatio >= 1 ? "text-yellow-600" :
    "text-destructive";
  const ratioLabel =
    ltvCacRatio >= 3 ? "✅ Ottimo (≥3x)" :
    ltvCacRatio >= 1 ? "⚠️ Accettabile (1–3x)" :
    ltvCacRatio > 0 ? "🔴 Critico (<1x)" : "—";

  const handleSave = () => {
    const spesaEur = parseFloat(formSpesa);
    const nuoveN = parseInt(formNuove);
    if (isNaN(spesaEur) || isNaN(nuoveN) || nuoveN < 0 || spesaEur < 0) {
      toast.error("Inserisci valori numerici validi");
      return;
    }
    salvaInputCac.mutate(
      { anno: formAnno, mese: formMese, spesa_marketing_cents: Math.round(spesaEur * 100), nuove_aziende: nuoveN, note: formNote || undefined },
      { onSuccess: () => { setFormSpesa(""); setFormNuove(""); setFormNote(""); } }
    );
  };

  const kpis = [
    { label: "LTV Medio", value: fmt(metrics.ltv), sub: "Lifetime Value stimato", color: "text-emerald-600" },
    { label: "CAC", value: fmt(metrics.cac), sub: "Media ultimi 3 mesi", color: "text-blue-600" },
    { label: "Payback Period", value: metrics.paybackPeriod > 0 ? `${metrics.paybackPeriod.toFixed(1)} mesi` : "—", sub: "Mesi per recuperare CAC", color: "" },
    { label: "LTV : CAC", value: ltvCacRatio > 0 ? `${ltvCacRatio.toFixed(1)}x` : "—", sub: ratioLabel, color: ratioColor },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Secondary metrics */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "ARPU", value: `${fmt(metrics.arpu)}/mese`, sub: "Ricavo medio per azienda" },
            { label: "Churn Rate", value: `${metrics.churnRate.toFixed(2)}%`, sub: "Tasso abbandono mensile", alert: metrics.churnRate > 5 },
            { label: "Aziende Paganti", value: metrics.activeCompanies.toLocaleString("it-IT"), sub: "Su Stripe" },
          ].map(m => (
            <div key={m.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`text-xl font-semibold mt-1 ${m.alert ? "text-destructive" : ""}`}>{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* CAC Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inserisci Dati Marketing</CardTitle>
          <CardDescription>Registra spesa marketing mensile e nuove aziende per il calcolo CAC</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs mb-1 block">Anno</Label>
              <Input
                type="number"
                value={formAnno}
                onChange={e => setFormAnno(parseInt(e.target.value))}
                className="h-8 text-sm"
                min={2020} max={2030}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Mese</Label>
              <Select value={String(formMese)} onValueChange={v => setFormMese(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESI_IT.map((m, i) => (
                    <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Spesa Marketing (€)</Label>
              <Input
                type="number"
                value={formSpesa}
                onChange={e => setFormSpesa(e.target.value)}
                placeholder="0.00"
                className="h-8 text-sm"
                min={0}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Nuove Aziende</Label>
              <Input
                type="number"
                value={formNuove}
                onChange={e => setFormNuove(e.target.value)}
                placeholder="0"
                className="h-8 text-sm"
                min={0}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={salvaInputCac.isPending || !formSpesa || !formNuove}
              size="sm" className="h-8"
            >
              {salvaInputCac.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salva"}
            </Button>
          </div>
          <div className="mt-3">
            <Label className="text-xs mb-1 block">Note (opzionale)</Label>
            <Input
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              placeholder="Es. campagna Google Ads, fiera di settore..."
              className="h-8 text-sm max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* CAC History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storico CAC per Mese</CardTitle>
          <CardDescription>Ultimi 12 mesi · usato per calcolo CAC (media 3 mesi recenti)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : cacInputs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nessun dato inserito. Usa il form sopra per iniziare.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium">Periodo</th>
                  <th className="text-right px-4 py-2 font-medium">Spesa Marketing</th>
                  <th className="text-right px-4 py-2 font-medium">Nuove Aziende</th>
                  <th className="text-right px-4 py-2 font-medium">CAC</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody>
                {cacInputs.map(row => {
                  const cac = row.nuove_aziende > 0 ? (row.spesa_marketing_cents / 100) / row.nuove_aziende : 0;
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-accent/20">
                      <td className="px-4 py-2 font-medium">{MESI_IT[row.mese-1]} {row.anno}</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(row.spesa_marketing_cents / 100)}</td>
                      <td className="px-4 py-2 text-right">{row.nuove_aziende}</td>
                      <td className="px-4 py-2 text-right font-mono font-medium">{cac > 0 ? fmt(cac) : "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{row.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────

export default function AdminRevenueDashboard() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.billing_read) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold">Revenue Platform</h1>
        <p className="text-muted-foreground">Dati finanziari aggregati e riconciliazione Stripe</p>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="revenue" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2">
            <ArrowUpDown className="h-4 w-4" />
            Riconciliazione Stripe
          </TabsTrigger>
          <TabsTrigger value="ltv-cac" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            LTV / CAC
          </TabsTrigger>
          <TabsTrigger value="render-economics" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Render Economics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <RevenueTab />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationTab />
        </TabsContent>

        <TabsContent value="ltv-cac" className="mt-4">
          <LTVCACTab />
        </TabsContent>

        <TabsContent value="render-economics" className="mt-4">
          <RenderEconomicsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
