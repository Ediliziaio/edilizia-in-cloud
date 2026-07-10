import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, Inbox, AlarmClock, Clock4, TrendingUp, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRow {
  company_id: string;
  status: string;
  last_message_at?: string | null;
  created_at?: string | null;
}

interface MessageRow {
  company_id: string;
  sender_role: string;
  created_at: string;
}

/**
 * Hook condiviso: carica conversazioni aperte + ultimi messaggi, ricava
 * metriche aggregate per l'header KPI. Polling ogni 60s.
 */
function useSupportStats(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-support-stats-full"],
    queryFn: async () => {
      // RPC dedicata: ultimo messaggio per OGNI conversazione attiva (DISTINCT
      // ON lato DB). Prima si incrociavano le conversazioni con gli ultimi
      // 2000 messaggi globali: i ticket attivi più VECCHI della finestra
      // sparivano da "da rispondere" e gonfiavano il response rate.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sp = supabase as any;
      const [lastMsgRes, conversationsRes] = await Promise.all([
        sp.rpc("admin_support_last_message_by_company").limit(5000),
        supabase
          .from("support_conversations")
          .select("company_id, status, last_message_at, created_at")
          .in("status", ["open", "in_progress", "pending"])
          .limit(500),
      ]);
      if (conversationsRes.error) throw conversationsRes.error;

      const conversations = (conversationsRes.data ?? []) as ConversationRow[];
      const statusByCompany = new Map(conversations.map((c) => [c.company_id, c]));
      const latestByCompany = new Map<string, MessageRow>();

      if (!lastMsgRes.error) {
        for (const m of (lastMsgRes.data ?? []) as MessageRow[]) {
          latestByCompany.set(m.company_id, m);
        }
      } else {
        // Fallback (RPC non ancora migrata in questo ambiente): finestra 2000
        // messaggi recenti — meno accurata sui ticket vecchi.
        const messagesRes = await supabase
          .from("support_messages")
          .select("company_id, sender_role, created_at")
          .order("created_at", { ascending: false })
          .limit(2000);
        if (messagesRes.error) throw messagesRes.error;
        for (const m of (messagesRes.data ?? []) as MessageRow[]) {
          if (!latestByCompany.has(m.company_id)) {
            latestByCompany.set(m.company_id, m);
          }
        }
      }

      // Conversazioni "attive" = status open/in_progress/pending (già filtrate)
      const activeCount = conversations.length;
      const openCount = conversations.filter(c => c.status === "open").length;
      const inProgressCount = conversations.filter(c => c.status === "in_progress").length;
      const pendingCount = conversations.filter(c => c.status === "pending").length;

      // Unanswered: ultima msg NON da super_admin E conversazione ancora attiva
      let unansweredCount = 0;
      let totalResponseHours = 0;
      let responseSamples = 0;
      let oldestUnansweredHours = 0;

      const now = Date.now();
      for (const [companyId, msg] of latestByCompany) {
        const conv = statusByCompany.get(companyId);
        if (!conv) continue;
        if (msg.sender_role === "super_admin") continue;
        unansweredCount++;
        const ageMs = now - new Date(msg.created_at).getTime();
        const ageHours = ageMs / 3_600_000;
        totalResponseHours += ageHours;
        responseSamples++;
        if (ageHours > oldestUnansweredHours) oldestUnansweredHours = ageHours;
      }

      const avgWaitingHours = responseSamples > 0 ? totalResponseHours / responseSamples : 0;

      // Conversazioni chiuse oggi (approssimato dal last_message_at)
      // NOTE: senza colonna closed_at reale, usiamo last_message_at su convs closed.
      // Per semplicità, calcoliamo solo su quelle non-closed qui.
      return {
        activeCount,
        openCount,
        inProgressCount,
        pendingCount,
        unansweredCount,
        avgWaitingHours,
        oldestUnansweredHours,
      };
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    enabled,
  });
}

export default function GlobalTickets() {
  const { permissions } = useSuperAdminPermissions();
  const canView = permissions.can_manage_tickets;
  const { data: stats, isLoading } = useSupportStats(canView);

  if (!canView) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg md:text-2xl font-bold">Assistenza Aziende</h1>
            {stats && stats.unansweredCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {stats.unansweredCount} da rispondere
              </Badge>
            )}
          </div>
          <p className="hidden md:block text-muted-foreground text-sm mt-0.5">
            Gestisci le richieste di supporto diretto dalle aziende
          </p>
        </div>
      </div>

      {/* KPI overview */}
      <KpiOverview stats={stats} loading={isLoading} />

      {/* Chat list */}
      <AdminSupportChatList />
    </div>
  );
}

// ─── KPI cards ─────────────────────────────────────────────

function KpiOverview({
  stats, loading,
}: {
  stats: {
    activeCount: number;
    openCount: number;
    inProgressCount: number;
    pendingCount: number;
    unansweredCount: number;
    avgWaitingHours: number;
    oldestUnansweredHours: number;
  } | undefined;
  loading: boolean;
}) {
  const kpi = useMemo(() => {
    if (!stats) return null;
    return {
      active: stats.activeCount,
      open: stats.openCount,
      unanswered: stats.unansweredCount,
      avgWaiting: stats.avgWaitingHours,
      oldest: stats.oldestUnansweredHours,
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  if (!kpi) return null;

  const fmtHours = (h: number) => {
    if (h < 1) return `${Math.max(0, Math.round(h * 60))}m`;
    if (h < 24) return `${h.toFixed(1)}h`;
    const days = Math.floor(h / 24);
    const rem = Math.round(h % 24);
    return rem > 0 ? `${days}g ${rem}h` : `${days}g`;
  };

  const isSlaBreach = kpi.avgWaiting > 4;       // SLA 4h attesa media
  const isOldestCritical = kpi.oldest > 24;     // Oltre 1 giorno senza risposta

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        icon={<Inbox className="h-4 w-4" />}
        label="Conversazioni attive"
        value={kpi.active}
        subtitle={`${stats?.openCount ?? 0} aperte · ${stats?.inProgressCount ?? 0} in corso`}
        accent="bg-primary/10 text-primary"
      />
      <KpiCard
        icon={<AlertCircle className="h-4 w-4" />}
        label="Da rispondere"
        value={kpi.unanswered}
        subtitle={kpi.unanswered > 0 ? "Cliente in attesa" : "Tutto risposto"}
        accent={kpi.unanswered > 0
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}
        highlight={kpi.unanswered > 0}
      />
      <KpiCard
        icon={<Clock4 className="h-4 w-4" />}
        label="Attesa media"
        value={kpi.unanswered > 0 ? fmtHours(kpi.avgWaiting) : "—"}
        subtitle={isSlaBreach ? "⚠️ oltre SLA 4h" : "nei limiti"}
        accent={isSlaBreach
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}
      />
      <KpiCard
        icon={<AlarmClock className="h-4 w-4" />}
        label="Più vecchio"
        value={kpi.unanswered > 0 ? fmtHours(kpi.oldest) : "—"}
        subtitle={isOldestCritical ? "🔥 oltre 24h" : "in range"}
        accent={isOldestCritical
          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-muted text-muted-foreground"}
        highlight={isOldestCritical}
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Response rate"
        value={
          kpi.active > 0
            ? `${Math.round(((kpi.active - kpi.unanswered) / kpi.active) * 100)}%`
            : "—"
        }
        subtitle={
          kpi.active > 0
            ? `${kpi.active - kpi.unanswered}/${kpi.active} risposte`
            : "nessuna conv."
        }
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </div>
  );
}

function KpiCard({
  icon, label, value, subtitle, accent, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "ring-1 ring-rose-300 dark:ring-rose-800")}>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
