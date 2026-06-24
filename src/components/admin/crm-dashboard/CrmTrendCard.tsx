/**
 * CrmTrendCard — andamento settimanale (ultime 12 settimane) di Lead nuovi e
 * Opportunità create. Area chart Recharts, dati reali (created_at su
 * marketing_contacts / marketing_opportunities). Empty-state se non c'è storia.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Loader2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS = 12;

export function CrmTrendCard({ companyId }: { companyId: string }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - WEEKS * WEEK_MS).toISOString(), [nowMs]);

  const q = useQuery({
    queryKey: ["crm-dash", "trend", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, opps] = await Promise.all([
        supabase.from("marketing_contacts").select("created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(5000),
        supabase.from("marketing_opportunities").select("created_at").eq("company_id", companyId).gte("created_at", sinceIso).limit(5000),
      ]);
      return {
        contacts: (contacts.data ?? []) as { created_at: string }[],
        opps: (opps.data ?? []) as { created_at: string }[],
      };
    },
  });

  const data = useMemo(() => {
    const buckets = Array.from({ length: WEEKS }, (_, i) => ({
      // settimana i = la più vecchia; etichetta = settimane fa
      label: i === WEEKS - 1 ? "ora" : `-${WEEKS - 1 - i}s`,
      lead: 0,
      opp: 0,
    }));
    const idx = (iso: string) => {
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return -1;
      const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
      const i = WEEKS - 1 - weeksAgo;
      return i >= 0 && i < WEEKS ? i : -1;
    };
    for (const c of q.data?.contacts ?? []) {
      const i = idx(c.created_at);
      if (i >= 0) buckets[i].lead++;
    }
    for (const o of q.data?.opps ?? []) {
      const i = idx(o.created_at);
      if (i >= 0) buckets[i].opp++;
    }
    return buckets;
  }, [q.data, nowMs]);

  const total = data.reduce((s, d) => s + d.lead + d.opp, 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" aria-hidden="true" /> Andamento · ultime 12 settimane
          <span className="ml-auto flex items-center gap-3 text-[11px] font-normal text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--chart-1))" }} /> Lead</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--chart-2))" }} /> Opportunità</span>
          </span>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nessuna attività nelle ultime 12 settimane.
          </p>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLead" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOpp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="lead" name="Lead" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#gLead)" />
                <Area type="monotone" dataKey="opp" name="Opportunità" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gOpp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
