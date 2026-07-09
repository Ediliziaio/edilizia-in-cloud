import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Send,
  MailOpen,
  MessageSquareReply,
  Sparkles,
  Inbox,
  Users,
  TrendingUp,
  Filter,
  PieChart as PieIcon,
  Server,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MigrationGate } from "./_shared";
import { useOutreachStats, type OutreachStats } from "./useOutreachStats";

/** Percentuale sicura n/d → stringa "xx.x%" oppure "—" se denominatore 0/assente. */
function safePct(n: number | null | undefined, d: number | null | undefined): string {
  if (n == null || d == null || d === 0) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

/**
 * Dashboard "Statistiche" dell'Outreach Engine cold: KPI headline + grafici
 * recharts (andamento giornaliero, funnel, stato coda, salute caselle, per
 * sequenza). Hub a sola lettura, alimentato da useOutreachStats (aggregazioni
 * client-side). Pensata per restare leggibile anche con dataset quasi vuoto:
 * empty-state onesti, nessuna percentuale /0, scheletri in caricamento.
 */

// Palette recharts del progetto: token --chart-1..5 definiti in index.css.
const CH = (n: number) => `hsl(var(--chart-${n}))`;
const FUNNEL_COLORS = [CH(1), CH(2), CH(4), CH(3), CH(5)];
const QUEUE_COLORS: Record<string, string> = {
  sent: CH(2),
  queued: CH(1),
  sending: CH(4),
  skipped: "hsl(215 16% 60%)",
  failed: CH(5),
  cancelled: "hsl(215 16% 45%)",
  canceled: "hsl(215 16% 45%)",
  unknown: "hsl(215 16% 70%)",
};

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
} as const;

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("it-IT"));

export function OutreachStatsDashboard({ companyId }: { companyId: string }) {
  const { data, isLoading, error } = useOutreachStats(companyId);

  if (isLoading) return <StatsSkeleton />;

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          Impossibile caricare le statistiche in questo momento. Riprova tra poco.
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  if (data.migrationNeeded) {
    return (
      <MigrationGate
        title="Statistiche outreach"
        unlocks={[
          "Andamento giornaliero invii, aperture e risposte",
          "Funnel cold completo con tassi di conversione",
          "Salute delle caselle e performance per sequenza",
        ]}
      />
    );
  }

  return <StatsContent data={data} />;
}

function StatsContent({ data }: { data: OutreachStats }) {
  const { totals, daily, funnel, queue, senders, sequences } = data;

  const openRate = safePct(totals.opened, totals.sent);
  const replyRate = safePct(totals.replied, totals.sent);

  // Il grafico giornaliero ha sempre 30 punti (scaffold), ma mostriamo l'empty
  // hint solo se nessun giorno ha attività: niente assi vuoti ingannevoli.
  const dailyHasActivity = useMemo(
    () => daily.some((d) => d.sent > 0 || d.opened > 0 || d.replied > 0),
    [daily],
  );
  const funnelHasData = funnel.some((f) => f.value > 0);
  const queueTotal = queue.reduce((s, q) => s + q.value, 0);

  return (
    <div className="space-y-6">
      {/* Banner "pochi dati": guida onesta finché la cadenza non gira. */}
      {!data.hasAnyData && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-orange-300 bg-orange-50/40 px-4 py-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
          <div className="text-sm">
            <p className="font-medium text-orange-800">I grafici si popolano appena la cadenza inizia a inviare.</p>
            <p className="text-orange-700/80">
              Arruola una lista in una sequenza (scheda <strong>Sequenze</strong>): qui vedrai invii, aperture,
              risposte e salute delle caselle aggiornarsi giorno per giorno.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI headline ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Send} label="Inviate totali" value={fmt(totals.sent)} hint="messaggi spediti" />
        <Kpi icon={MailOpen} label="Tasso apertura" value={openRate} hint={`${fmt(totals.opened)} aperte`} tone="good" />
        <Kpi
          icon={MessageSquareReply}
          label="Tasso risposta"
          value={replyRate}
          hint={`${fmt(totals.replied)} risposte`}
          tone="good"
        />
        <Kpi icon={Inbox} label="Interessati" value={fmt(totals.interested)} hint="opportunità calde" tone="good" />
        <Kpi icon={Server} label="Caselle attive" value={fmt(totals.activeSenders)} hint="sender pronti / in warm-up" />
        <Kpi icon={Users} label="Contattabili" value={fmt(totals.contactable)} hint="con email, al netto degli opt-out" />
      </div>

      {/* ── Andamento giornaliero (grafico principale) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-orange-500" /> Attività giornaliera (ultimi 30 giorni)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={daily} margin={{ left: -16, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CH(1)} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={CH(1)} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CH(2)} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CH(2)} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CH(3)} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CH(3)} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                <RTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="sent"
                  name="Inviate"
                  stroke={CH(1)}
                  strokeWidth={2}
                  fill="url(#gSent)"
                />
                <Area
                  type="monotone"
                  dataKey="opened"
                  name="Aperte"
                  stroke={CH(2)}
                  strokeWidth={2}
                  fill="url(#gOpened)"
                />
                <Area
                  type="monotone"
                  dataKey="replied"
                  name="Risposte"
                  stroke={CH(3)}
                  strokeWidth={2}
                  fill="url(#gReplied)"
                />
              </AreaChart>
            </ResponsiveContainer>
            {!dailyHasActivity && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                  Nessuna attività negli ultimi 30 giorni — comparirà qui appena partono gli invii.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Funnel cold ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-5 w-5 text-orange-500" /> Funnel cold
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!funnelHasData ? (
              <EmptyHint>Il funnel si disegna appena viene spedito il primo messaggio.</EmptyHint>
            ) : (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={84} tick={{ fontSize: 12 }} />
                    <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmt(v), "Conteggio"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnel.map((entry, i) => (
                        <Cell key={entry.key} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {funnel.slice(1).map((stage) => (
                    <div key={stage.key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{stage.label} / inviate</span>
                      <span className="font-semibold tabular-nums">{safePct(stage.value, funnel[0].value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Stato coda (donut) ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-5 w-5 text-orange-500" /> Stato coda invii
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queueTotal === 0 ? (
              <EmptyHint>La coda è vuota: nessun messaggio ancora accodato o spedito.</EmptyHint>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={queue}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {queue.map((slice) => (
                      <Cell key={slice.status} fill={QUEUE_COLORS[slice.status] ?? QUEUE_COLORS.unknown} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, n) => [`${fmt(v)} (${safePct(v, queueTotal)})`, n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Salute per casella ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-5 w-5 text-orange-500" /> Salute per casella
          </CardTitle>
        </CardHeader>
        <CardContent>
          {senders.length === 0 ? (
            <EmptyHint>
              Nessuna casella configurata. Aggiungi un sender nella scheda <strong>Deliverability</strong> per
              iniziare a spedire.
            </EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Casella</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Inviate</TableHead>
                    <TableHead className="text-right">Bounce</TableHead>
                    <TableHead className="text-right">Lamentele</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {senders.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{s.email}</span>
                          {s.atRisk && (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              <AlertTriangle className="mr-1 h-3 w-3" /> a rischio
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.sent)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${s.bounce > 0 ? "text-amber-600" : ""}`}>
                        {fmt(s.bounce)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${s.complaint > 0 ? "text-destructive" : ""}`}>
                        {fmt(s.complaint)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per sequenza ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-orange-500" /> Performance per sequenza
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sequences.length === 0 ? (
            <EmptyHint>
              Nessuna sequenza creata. Costruiscine una nella scheda <strong>Sequenze</strong> e arruola i contatti.
            </EmptyHint>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sequenza</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Iscritti</TableHead>
                    <TableHead className="text-right">Inviate</TableHead>
                    <TableHead className="text-right">Risposte</TableHead>
                    <TableHead className="text-right">Reply rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sequences.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.enrolled)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.sent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(s.replied)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {safePct(s.replied, s.sent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Send;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneCls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className={`text-2xl font-bold leading-tight ${toneCls}`}>{value}</div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-start gap-3 p-4">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[220px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
