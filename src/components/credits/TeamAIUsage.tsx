/**
 * TeamAIUsage — Dashboard per il titolare azienda: chi del team sta consumando AI,
 * per quali task/personas, quanto sta spendendo. Aggrega da ai_call_ledger.
 *
 * Layout:
 *   - Periodo selector (7/30/90 giorni)
 *   - 3 KPI: spesa totale, calls totali, costo medio
 *   - Tabella top utenti per spesa
 *   - Tabella top task
 *   - Tabella top personas
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Users, Coins, Zap, Bot, Sparkles, Award, Activity } from "lucide-react";

interface LedgerRow {
  id: string;
  user_id: string | null;
  task_key: string;
  tier_key: string;
  persona_key: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_billed_eur: number;
  cost_real_eur: number;
  model_used: string;
  status: string;
  created_at: string;
}

interface ProfileMini {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const fmtEur = (n: number, decimals = 4) =>
  `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const TASK_LABELS: Record<string, string> = {
  persona_silvio: "Silvio (chat universale)",
  persona_cfo: "Silvio: CFO",
  persona_pm_cantiere: "Silvio: PM Cantiere",
  persona_sales: "Silvio: Sales",
  listino_extract: "Estrazione listino",
  customers_extract: "Estrazione anagrafiche",
  bank_categorize: "Categorizzazione banca",
  preventivo_genera: "Generazione preventivo",
  email_compose: "Generazione email",
  preventivo_analisi: "Analisi preventivo",
  rapportino_parse: "Parsing rapportino",
  computo_extract: "Estrazione computo",
  vision_cantiere: "Analisi foto cantiere",
};

function periodLabel(days: number) {
  return days === 7 ? "Ultimi 7 giorni" : days === 30 ? "Ultimi 30 giorni" : `Ultimi ${days} giorni`;
}

function userInitials(p: ProfileMini | undefined): string {
  if (!p) return "?";
  const fn = p.first_name?.[0] ?? "";
  const ln = p.last_name?.[0] ?? "";
  return (fn + ln) || p.email?.[0]?.toUpperCase() || "?";
}

function userName(p: ProfileMini | undefined): string {
  if (!p) return "Utente sconosciuto";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return full || p.email || "Utente";
}

export default function TeamAIUsage() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [days, setDays] = useState<number>(30);

  const sinceDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  // ─── Ledger entries ───────────────────────────────────────────────────
  const { data: ledger, isLoading } = useQuery({
    queryKey: ["team_ai_usage_ledger", companyId, days],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("ai_call_ledger" as never)
        .select("id, user_id, task_key, tier_key, persona_key, tokens_in, tokens_out, cost_billed_eur, cost_real_eur, model_used, status, created_at")
        .eq("company_id", companyId)
        .gte("created_at", sinceDate)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as LedgerRow[];
    },
    enabled: !!companyId,
  });

  // ─── Profili dell'azienda ─────────────────────────────────────────────
  const { data: profiles } = useQuery({
    queryKey: ["company_profiles_mini", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("profiles" as never)
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileMini[];
    },
    enabled: !!companyId,
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, ProfileMini>();
    (profiles ?? []).forEach(p => m.set(p.id, p));
    return m;
  }, [profiles]);

  // ─── Aggregazioni ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const rows = ledger ?? [];
    const successful = rows.filter(r => r.status === "success");

    const totalCost = successful.reduce((s, r) => s + Number(r.cost_billed_eur ?? 0), 0);
    const totalCalls = successful.length;
    const avgCost = totalCalls > 0 ? totalCost / totalCalls : 0;
    const totalTokensIn = successful.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
    const totalTokensOut = successful.reduce((s, r) => s + (r.tokens_out ?? 0), 0);

    // Per user
    const byUser = new Map<string, { calls: number; cost: number; tokens: number; userId: string | null }>();
    successful.forEach(r => {
      const key = r.user_id ?? "_system_";
      const cur = byUser.get(key) ?? { calls: 0, cost: 0, tokens: 0, userId: r.user_id };
      cur.calls += 1;
      cur.cost += Number(r.cost_billed_eur ?? 0);
      cur.tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
      byUser.set(key, cur);
    });

    // Per task
    const byTask = new Map<string, { calls: number; cost: number; tokens: number }>();
    successful.forEach(r => {
      const cur = byTask.get(r.task_key) ?? { calls: 0, cost: 0, tokens: 0 };
      cur.calls += 1;
      cur.cost += Number(r.cost_billed_eur ?? 0);
      cur.tokens += (r.tokens_in ?? 0) + (r.tokens_out ?? 0);
      byTask.set(r.task_key, cur);
    });

    // Per persona
    const byPersona = new Map<string, { calls: number; cost: number }>();
    successful.forEach(r => {
      if (!r.persona_key) return;
      const cur = byPersona.get(r.persona_key) ?? { calls: 0, cost: 0 };
      cur.calls += 1;
      cur.cost += Number(r.cost_billed_eur ?? 0);
      byPersona.set(r.persona_key, cur);
    });

    return {
      totalCost, totalCalls, avgCost, totalTokensIn, totalTokensOut,
      topUsers: Array.from(byUser.entries())
        .map(([k, v]) => ({ userId: v.userId, ...v }))
        .sort((a, b) => b.cost - a.cost),
      topTasks: Array.from(byTask.entries())
        .map(([k, v]) => ({ task: k, ...v }))
        .sort((a, b) => b.cost - a.cost),
      topPersonas: Array.from(byPersona.entries())
        .map(([k, v]) => ({ persona: k, ...v }))
        .sort((a, b) => b.cost - a.cost),
    };
  }, [ledger]);

  if (isLoading) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }

  if (!ledger || ledger.length === 0) {
    return (
      <Alert>
        <Bot className="h-4 w-4" />
        <AlertDescription>
          Nessun consumo AI registrato negli ultimi {days} giorni. I dati appariranno qui non appena
          il team inizierà a usare Silvio o gli altri strumenti AI.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header con period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Consumo AI del team</h3>
          <p className="text-sm text-muted-foreground">
            Chi sta usando l'AI, per cosa e quanto sta spendendo. {periodLabel(days)}.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Ultimi 7 giorni</SelectItem>
            <SelectItem value="30">Ultimi 30 giorni</SelectItem>
            <SelectItem value="90">Ultimi 90 giorni</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Coins className="h-3.5 w-3.5" /> Spesa AI totale
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtEur(stats.totalCost, 4)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalCalls.toLocaleString("it-IT")} chiamate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" /> Costo medio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtEur(stats.avgCost, 4)}</div>
            <p className="text-xs text-muted-foreground mt-1">per chiamata</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Utenti attivi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.topUsers.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              top: {userName(profileMap.get(stats.topUsers[0]?.userId ?? "")).split(" ")[0] ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" /> Token totali
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((stats.totalTokensIn + stats.totalTokensOut) / 1000).toFixed(1)}k
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(stats.totalTokensIn / 1000).toFixed(1)}k in / {(stats.totalTokensOut / 1000).toFixed(1)}k out
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top utenti */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-600" />
            Top consumatori del team
          </CardTitle>
          <CardDescription>Chi ha speso di più in AI nel periodo</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Utente</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Token</TableHead>
                <TableHead className="text-right">Spesa</TableHead>
                <TableHead className="text-right">% del totale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.topUsers.slice(0, 10).map((u, idx) => {
                const profile = u.userId ? profileMap.get(u.userId) : undefined;
                const pct = stats.totalCost > 0 ? (u.cost / stats.totalCost) * 100 : 0;
                return (
                  <TableRow key={u.userId ?? "system"}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px] bg-violet-100 text-violet-700">
                            {userInitials(profile)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{userName(profile)}</div>
                          {profile?.email && (
                            <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.calls.toLocaleString("it-IT")}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {(u.tokens / 1000).toFixed(1)}k
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {fmtEur(u.cost, 4)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="font-mono">
                        {pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top task */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Top funzionalità AI
            </CardTitle>
            <CardDescription>Per quali strumenti spendi di più</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Spesa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.topTasks.slice(0, 8).map((t) => (
                  <TableRow key={t.task}>
                    <TableCell>
                      <div className="text-sm font-medium">{TASK_LABELS[t.task] ?? t.task}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{t.task}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{t.calls}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-sm">
                      {fmtEur(t.cost, 4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top personas (Silvio sub-modes) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              Top personas AI
            </CardTitle>
            <CardDescription>Quali esperti AI il team interpella</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {stats.topPersonas.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nessun uso di personas nel periodo
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Spesa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topPersonas.slice(0, 8).map((p) => (
                    <TableRow key={p.persona}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {p.persona === "silvio" && <Sparkles className="h-3.5 w-3.5 text-violet-600" />}
                          <span className="text-sm font-medium capitalize">{p.persona.replace(/_/g, " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{p.calls}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-sm">
                        {fmtEur(p.cost, 4)}
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
