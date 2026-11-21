import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Users, Loader2 } from 'lucide-react';
import { useSuperAdminPermissions } from '@/hooks/useSuperAdminPermissions';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { CustomerSuccessSectionHeader } from '@/components/admin/support/CustomerSuccessSection';
import { queryKeys } from '@/lib/queryKeys';

interface CSData {
  activeCompanies: number;
  trialCompanies: number;
  atRisk: number;
  healthRate: number | null;
  lastCalculatedAt: string | null;
  healthAgeHours: number | null;
  atRiskList: Array<{ company_id: string; name: string; score: number; health: string }>;
}

export default function AdminCSDashboard() {
  const { permissions } = useSuperAdminPermissions();

  const { data, isLoading, isError, refetch } = useQuery<CSData>({
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
      const [companiesRes, profilesRes] = await Promise.all([
        supabase
          .from('companies')
          .select('id,name,status')
          .eq('is_platform_admin_company', false),
        sp
          .from('customer_profile')
          .select('company_id,is_at_risk,health_label_latest,health_score_latest,health_snapshot_date')
          .limit(5000),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const companies = companiesRes.data ?? [];

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
      const healthRate = scored > 0 ? Math.round((healthy / scored) * 100) : null;

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
  const ticketStats = useQuery({
    queryKey: [...queryKeys.admin.supportConversations, 'indicators'],
    enabled: permissions.impersonation && permissions.can_manage_tickets,
    queryFn: async () => {
      const { data: conversations, error } = await supabase.from('support_conversations')
        .select('company_id')
        .in('status', ['open', 'in_progress', 'pending']);
      if (error) throw error;
      const active = new Set((conversations ?? []).map((conversation) => conversation.company_id));
      if (!permissions.super_admin) return { active: active.size, waiting: null, overdue: null };
      const activity = await supabase.rpc('admin_support_last_message_by_company');
      if (activity.error) return { active: active.size, waiting: null, overdue: null };
      const observedAt = Date.now();
      const waiting = (activity.data ?? []).filter((message) =>
        active.has(message.company_id) && message.sender_role !== 'super_admin',
      );
      return {
        active: active.size,
        waiting: waiting.length,
        overdue: waiting.filter((message) => observedAt - Date.parse(message.created_at) > 4 * 3_600_000).length,
      };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  if (!permissions.impersonation) return <AccessDenied />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4 text-sm">
        Impossibile caricare gli indicatori.
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }

  const kpis = [
    { label: 'Aziende attive', value: data.activeCompanies, icon: Users, color: 'text-primary' },
    { label: 'Aziende in prova', value: data.trialCompanies, icon: Clock, color: 'text-amber-600' },
    {
      label: 'Aziende a rischio',
      value: data.atRisk,
      icon: AlertTriangle,
      color: (data?.atRisk ?? 0) > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="space-y-3">
      <CustomerSuccessSectionHeader title="Indicatori" description="Controlla la coda di assistenza e l’andamento delle aziende." />

      {permissions.can_manage_tickets && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-4 py-3">
            <CardTitle className="text-base">Coda di assistenza</CardTitle>
            <Button asChild size="sm" variant="outline"><Link to="/admin/cs">Apri ticket</Link></Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {ticketStats.isError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm">
                Indicatori dei ticket non disponibili.
                <Button size="sm" variant="outline" onClick={() => void ticketStats.refetch()}>Riprova</Button>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                {[
                  ["Da gestire", ticketStats.data?.active],
                  ["Da rispondere", ticketStats.data?.waiting],
                  ["In attesa da oltre 4 ore", ticketStats.data?.overdue],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-3">
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

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Clienti monitorati</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Clienti non a rischio</span>
              <span className="font-bold">{data.healthRate !== null ? data.healthRate + '%' : '—'}</span>
            </div>
            {data.healthRate !== null && <Progress value={data.healthRate} className="h-2" />}
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
                {(data.healthAgeHours ?? 0) > 24 ? ' · dati da aggiornare' : ''}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Nessun punteggio disponibile.</p>
            )}
          </CardContent>
        </Card>

      {data.atRiskList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Aziende a rischio ({data.atRiskList.length} mostrate)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {data.atRiskList.map((c) => (
              <Link key={c.company_id} to={`/admin/aziende/${c.company_id}`}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors">
                <span className="truncate font-medium">{c.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant={c.health === 'churned' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {c.health === 'churned' ? 'perso' : 'a rischio'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">punteggio {c.score}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
