import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, subDays, startOfDay, isSameDay, differenceInHours } from "date-fns";
import { it } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";
import { CheckCircle2, Clock, TrendingUp, ListTodo } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  da_fare:    "#94a3b8",
  in_corso:   "#3b82f6",
  completata: "#22c55e",
};
const PRIORITY_COLORS: Record<string, string> = {
  bassa:   "#94a3b8",
  normale: "#3b82f6",
  alta:    "#f97316",
  urgente: "#ef4444",
};
const CATEGORY_LABELS: Record<string, string> = {
  generale:    "Generale",
  ordini:      "Ordini",
  magazzino:   "Magazzino",
  pagamenti:   "Pagamenti",
  costi:       "Costi",
  marketing:   "Marketing",
  contatti:    "Contatti",
  opportunita: "Opportunità",
};

interface StatsTask {
  id: string;
  status: string;
  priority: string;
  category?: string;
  created_at?: string;
  completed_at?: string;
}

interface TaskStatsViewProps {
  tasks: StatsTask[];
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg p-2 bg-muted text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function HorizontalBar({ label, count, total, color }: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{count} <span className="text-muted-foreground">({pct}%)</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function TaskStatsView({ tasks }: TaskStatsViewProps) {
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "completata").length;
    const inProgress = tasks.filter((t) => t.status === "in_corso").length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Avg hours to complete (only completed tasks with both created_at and completed_at)
    const completionTimes = tasks
      .filter((t) => t.status === "completata" && t.created_at && t.completed_at)
      .map((t) => differenceInHours(new Date(t.completed_at!), new Date(t.created_at!)));
    const avgHours = completionTimes.length > 0
      ? Math.round(completionTimes.reduce((s, h) => s + h, 0) / completionTimes.length)
      : null;

    // Last 14 days completions
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const day = subDays(startOfDay(new Date()), 13 - i);
      const count = tasks.filter(
        (t) => t.status === "completata" && t.completed_at && isSameDay(new Date(t.completed_at), day)
      ).length;
      return { day: format(day, "dd/MM"), count };
    });

    // By status
    const byStatus = Object.entries(STATUS_COLORS).map(([s, color]) => ({
      name: s === "da_fare" ? "Da fare" : s === "in_corso" ? "In corso" : "Completate",
      value: tasks.filter((t) => t.status === s).length,
      color,
    })).filter((e) => e.value > 0);

    // By priority
    const byPriority = Object.entries(PRIORITY_COLORS).map(([p, color]) => ({
      key: p,
      label: p.charAt(0).toUpperCase() + p.slice(1),
      count: tasks.filter((t) => t.priority === p).length,
      color,
    }));

    // By category (top 6)
    const catMap = new Map<string, number>();
    for (const t of tasks) {
      const cat = t.category ?? "generale";
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
    }
    const byCategory = Array.from(catMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([cat, count]) => ({ label: CATEGORY_LABELS[cat] ?? cat, count }));

    return { total, completed, inProgress, completionRate, avgHours, last14, byStatus, byPriority, byCategory };
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ListTodo}      label="Totale attività"       value={stats.total} />
        <StatCard icon={CheckCircle2}  label="Completate"            value={stats.completed} sub={`${stats.completionRate}% del totale`} />
        <StatCard icon={TrendingUp}    label="Tasso completamento"   value={`${stats.completionRate}%`} />
        <StatCard
          icon={Clock}
          label="Tempo medio chiusura"
          value={stats.avgHours != null
            ? stats.avgHours < 24
              ? `${stats.avgHours}h`
              : `${Math.round(stats.avgHours / 24)}g`
            : "—"}
          sub={stats.avgHours != null ? "dalla creazione" : "nessun dato"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Completions trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Completamenti — ultimi 14 giorni</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.last14} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number) => [v, "Completate"]}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuzione per stato</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna attività</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie
                      data={stats.byStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={65}
                      dataKey="value"
                      strokeWidth={2}
                    >
                      {stats.byStatus.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {stats.byStatus.map((e) => (
                    <div key={e.name} className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="flex-1 text-muted-foreground">{e.name}</span>
                      <span className="font-medium">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By priority */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuzione per priorità</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.byPriority.map((p) => (
              <HorizontalBar key={p.key} label={p.label} count={p.count} total={stats.total} color={p.color} />
            ))}
          </CardContent>
        </Card>

        {/* By category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuzione per categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.byCategory.length === 0
              ? <p className="text-sm text-muted-foreground">Nessun dato</p>
              : stats.byCategory.map((c) => (
                  <HorizontalBar
                    key={c.label}
                    label={c.label}
                    count={c.count}
                    total={stats.total}
                    color="hsl(var(--primary))"
                  />
                ))
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
