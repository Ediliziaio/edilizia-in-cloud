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
  lastCalculatedAt: string | null;
  healthAgeHours: number | null;
  atRiskList: Array<{ company_id: string; name: string; score: number; health: string }>;
}

export default function AdminCSDashboard() {
  const { permissions } = useSuperAdminPermissions();

  const { data, isLoading } = useQuery<CSData>({
    queryKey: ['admin-cs-dashboard'],
    queryFn: async () => {
      // UNA SOLA FONTE per «a rischio»: la vista customer_profile (is_at_risk),
      // la stessa del Cockpit. È quella che guida gli avvisi: l'agente
      // elena-cs-health-daily scrive ogni giorno customer_health_history e manda
      // la notifica cs_at_risk quando l'etichetta passa ad at_risk/churned; la
      // vista legge proprio quell'etichetta (più pagamenti in sospeso e messaggi
      // arrabbiati). Prima qui si contava company_health_scores (cron
      // compute-health-scores, altro modello di punteggio): 13 contro i 29 del
      // Cockpit per gli stessi clienti.
      // Lo stato reale dei ticket è `open` (inglese), NON 'aperto'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const [companiesRes, profilesRes, ticketsRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id,name,status')
          .eq('is_platform_admin_company', false),
        sp
          .from('customer_profile')
          .select('company_id,is_at_risk,health_label_latest,health_score_latest,health_snapshot_date')
          .limit(5000),
        supabase
          .from('support_conversations')
          .select('id,status,created_at,first_response_at')
          .in('status', ['open', 'in_progress'])
          .limit(1000),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const companies = companiesRes.data ?? [];
      const tickets = (ticketsRes.data ?? []) as Array<{
        id: string;
        status: string;
        created_at: string;
        first_response_at: string | null;
      }>;

      const activeCompanies = companies.filter((c) => c.status === 'active').length;
      const trialCompanies = companies.filter((c) => c.status === 'trial').length;

      // Stesso perimetro del Cockpit: niente azienda della piattaforma.
      const nameById = new Map(companies.map((c) => [c.id, c.name]));
      const profiles = ((profilesRes.data ?? []) as Array<{
        company_id: string;
        is_at_risk: boolean;
        health_label_latest: string | null;
        health_score_latest: number | null;
        health_snapshot_date: string | null;
      }>).filter((p) => nameById.has(p.company_id));

      const atRiskRows = profiles.filter((p) => p.is_at_risk);
      const atRisk = atRiskRows.length;
      const scored = profiles.filter((p) => p.health_label_latest != null).length;
      const healthy = profiles.filter((p) => p.health_label_latest != null && !p.is_at_risk).length;
      const healthRate = scored > 0 ? Math.round((healthy / scored) * 100) : 0;
      // NB: first_response_at oggi non viene ancora popolato da nessun flusso →
      // il KPI è "in attesa da >4h" (età conversazione), non un vero SLA di
      // prima risposta. Quando first_response_at verrà scritto, il filtro
      // escluderà automaticamente le conversazioni già risposte.
      const slaViolations = tickets.filter(
        (t) => (Date.now() - new Date(t.created_at).getTime()) / 3600000 > 4 && !t.first_response_at
      ).length;

      const atRiskList = atRiskRows
        .slice()
        .sort((a, b) => (a.health_score_latest ?? 0) - (b.health_score_latest ?? 0))
        .slice(0, 10)
        .map((p) => ({
          company_id: p.company_id,
          name: nameById.get(p.company_id) ?? 'Azienda',
          score: p.health_score_latest ?? 0,
          health: p.health_label_latest ?? 'at_risk',
        }));

      // Freschezza: la data dell'ultimo giro dell'agente giornaliero.
      const lastCalculatedAt = profiles.reduce<string | null>(
        (max, p) => (p.health_snapshot_date && (!max || p.health_snapshot_date > max) ? p.health_snapshot_date : max),
        null,
      );

      return {
        activeCompanies,
        trialCompanies,
        atRisk,
        healthRate,
        openTickets: tickets.length,
        slaViolations,
        lastCalculatedAt,
        healthAgeHours: lastCalculatedAt
          ? (Date.now() - new Date(lastCalculatedAt + 'T23:59:59').getTime()) / 3600000
          : null,
        atRiskList,
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
        <h1 className="text-2xl font-bold">Riepilogo assistenza</h1>
        <p className="text-muted-foreground">Clienti, salute e ticket — numeri in tempo reale</p>
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
              <span className="text-muted-foreground">Clienti non a rischio</span>
              <span className="font-bold">{data?.healthRate ?? 0}%</span>
            </div>
            <Progress value={data?.healthRate ?? 0} className="h-2" />
            {(data?.atRisk ?? 0) > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {data?.atRisk} a rischio — azione richiesta
              </Badge>
            )}
            {/* Freschezza: se il cron compute-health-scores non gira, i numeri
                sopra sono stantii — prima non c'era alcun indicatore. */}
            {data?.lastCalculatedAt ? (
              <p className={`text-[11px] ${(data.healthAgeHours ?? 0) > 24 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
                Ultimo calcolo: {new Date(data.lastCalculatedAt + 'T12:00:00').toLocaleDateString('it-IT')}
                {(data.healthAgeHours ?? 0) > 24 ? ' — dati vecchi, verifica il giro giornaliero elena-cs-health-daily' : ''}
              </p>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Nessuna salute calcolata — il giro giornaliero elena-cs-health-daily non è mai partito.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ticket & SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">In attesa da &gt;4h (senza prima risposta)</span>
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

      {/* Drill-down: chi sono le aziende a rischio (prima solo un numero) */}
      {(data?.atRiskList?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Aziende a rischio (peggiori {data!.atRiskList.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {data!.atRiskList.map((c) => (
              <a key={c.company_id} href={`/admin/aziende/${c.company_id}`}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">
                <span className="truncate font-medium">{c.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant={c.health === 'churned' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {c.health === 'churned' ? 'perso' : 'a rischio'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">punteggio {c.score}</span>
                </span>
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
