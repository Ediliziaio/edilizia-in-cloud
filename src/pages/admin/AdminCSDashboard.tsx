import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Clock, Users, Loader2 } from 'lucide-react';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';

interface CSData {
  activeCompanies: number;
  trialCompanies: number;
  atRisk: number;
  healthRate: number;
  openTickets: number;
  slaViolations: number;
  pendingTasks: number;
  overdueTasks: number;
}

export default function AdminCSDashboard() {
  const { permissions } = useSuperAdminPermissions();

  const { data, isLoading } = useQuery<CSData>({
    queryKey: ['admin-cs-dashboard'],
    queryFn: async () => {
      const [companiesRes, healthRes, ticketsRes] = await Promise.all([
        supabase.from('companies').select('id,status,created_at'),
        supabase
          .from('company_health_scores' as never)
          .select('company_id,health_status,score' as never)
          .limit(500),
        supabase
          .from('support_conversations' as never)
          .select('id,status,created_at,first_response_at' as never)
          .eq('status' as never, 'aperto' as never),
      ]);

      const companies = companiesRes.data ?? [];
      const health = (healthRes.data ?? []) as Array<{
        company_id: string;
        health_status: string;
        score: number;
      }>;
      const tickets = (ticketsRes.data ?? []) as Array<{
        id: string;
        status: string;
        created_at: string;
        first_response_at: string | null;
      }>;

      const activeCompanies = companies.filter((c) => c.status === 'active').length;
      const trialCompanies = companies.filter((c) => c.status === 'trial').length;
      const atRisk = health.filter(
        (h) => h.health_status === 'at_risk' || h.health_status === 'critical'
      ).length;
      const healthy = health.filter((h) => h.health_status === 'healthy').length;
      const healthRate = health.length > 0 ? Math.round((healthy / health.length) * 100) : 0;
      const slaViolations = tickets.filter(
        (t) => (Date.now() - new Date(t.created_at).getTime()) / 3600000 > 4 && !t.first_response_at
      ).length;

      return {
        activeCompanies,
        trialCompanies,
        atRisk,
        healthRate,
        openTickets: tickets.length,
        slaViolations,
        pendingTasks: 0,
        overdueTasks: 0,
      };
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: permissions.impersonation,
  });

  if (!permissions.impersonation) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const kpis = [
    { label: 'Aziende Attive', value: data?.activeCompanies ?? 0, icon: Users, color: 'text-primary' },
    { label: 'In Trial', value: data?.trialCompanies ?? 0, icon: Clock, color: 'text-amber-600' },
    {
      label: 'A Rischio',
      value: data?.atRisk ?? 0,
      icon: AlertTriangle,
      color: (data?.atRisk ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
    { label: 'Ticket Aperti', value: data?.openTickets ?? 0, icon: CheckCircle2, color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CS Dashboard</h1>
        <p className="text-muted-foreground">Customer Success — KPI in tempo reale</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="bg-muted rounded-lg p-2.5">
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Salute Clienti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Clienti in buona salute</span>
              <span className="font-bold">{data?.healthRate ?? 0}%</span>
            </div>
            <Progress value={data?.healthRate ?? 0} className="h-2" />
            {(data?.atRisk ?? 0) > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {data?.atRisk} a rischio — azione richiesta
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ticket & SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Violazioni SLA</span>
              <Badge variant={(data?.slaViolations ?? 0) > 0 ? 'destructive' : 'secondary'}>
                {data?.slaViolations ?? 0}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Ticket aperti totali</span>
              <span className="font-bold">{data?.openTickets ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
