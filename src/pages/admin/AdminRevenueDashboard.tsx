import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, Users, RefreshCw } from 'lucide-react';
import { Loader2 } from 'lucide-react';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
}

interface Subscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string | null;
  stripe_subscription_id: string | null;
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

export default function AdminRevenueDashboard() {
  const { permissions } = useSuperAdminPermissions();

  const { data, isLoading, refetch } = useQuery<RevenueData>({
    queryKey: ['admin-revenue-dashboard'],
    queryFn: async () => {
      const [plansRes, subsRes] = await Promise.all([
        supabase.from('subscription_plans').select('id,name,price_monthly,price_yearly'),
        supabase
          .from('company_subscriptions')
          .select('id,company_id,plan_id,status,billing_cycle,stripe_subscription_id')
          .eq('status', 'active'),
      ]);

      if (plansRes.error) throw plansRes.error;
      if (subsRes.error) throw subsRes.error;

      const plans = (plansRes.data ?? []) as Plan[];
      const subs = (subsRes.data ?? []) as Subscription[];
      const planMap = Object.fromEntries(plans.map((p) => [p.id, p]));

      const mrr = subs.reduce((sum, s) => {
        const plan = planMap[s.plan_id];
        if (!plan) return sum;
        const monthly =
          s.billing_cycle === 'yearly'
            ? ((plan.price_yearly ?? (plan.price_monthly ?? 0) * 12) / 12)
            : (plan.price_monthly ?? 0);
        return sum + monthly;
      }, 0);

      const byPlan: PlanBreakdown[] = plans
        .map((p) => ({
          name: p.name,
          count: subs.filter((s) => s.plan_id === p.id).length,
          mrr: subs
            .filter((s) => s.plan_id === p.id)
            .reduce((sum, s) => {
              const monthly =
                s.billing_cycle === 'yearly'
                  ? ((p.price_yearly ?? (p.price_monthly ?? 0) * 12) / 12)
                  : (p.price_monthly ?? 0);
              return sum + monthly;
            }, 0),
        }))
        .filter((p) => p.count > 0);

      return { mrr, arr: mrr * 12, byPlan, activeCount: subs.length };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!permissions.billing_read) return <AccessDenied />;

  const kpis = [
    { label: 'MRR Corrente', value: formatCurrency(data?.mrr ?? 0), icon: DollarSign, color: 'text-emerald-600' },
    { label: 'ARR Proiettato', value: formatCurrency(data?.arr ?? 0), icon: TrendingUp, color: 'text-blue-600' },
    { label: 'Abbonamenti Attivi', value: String(data?.activeCount ?? 0), icon: Users, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revenue Platform</h1>
          <p className="text-muted-foreground">Dati finanziari aggregati in tempo reale</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Aggiorna
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
                        <td className="py-2 text-right font-mono">{formatCurrency(p.mrr)}</td>
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
