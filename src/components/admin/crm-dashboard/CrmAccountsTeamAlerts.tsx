/**
 * Blocco 3 della Dashboard commerciale (componenti indipendenti company-scoped):
 *  - CrmAccountsCard: vista per AZIENDA (raggruppa i contatti per company_name)
 *    con decision maker, pipeline e lead caldi — il cuore B2B.
 *  - CrmTeamCard: classifica agenti per conversione (non volume).
 *  - CrmAlertsCard: alert intelligenti calcolati live.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Trophy, Bell, Loader2, Flame, Hourglass, CalendarX, UserX, ShieldCheck } from "lucide-react";
import { useCrmSegmenti } from "./useCrmSegmenti";

const eur = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `€${v}`;
};

function Shell({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  emptyText,
  note,
  children,
}: {
  title: string;
  icon: typeof Building2;
  isLoading: boolean;
  isEmpty: boolean;
  emptyText: string;
  /** Nota a destra del titolo (es. «oggi, indipendente dal periodo»). */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" aria-hidden="true" /> {title}
          {note && <span className="ml-auto text-xs font-normal text-muted-foreground">{note}</span>}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : isEmpty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// ─── Aziende / Account ──────────────────────────────────────────────────────
export function CrmAccountsCard({ companyId }: { companyId: string }) {
  // Conta il database su TUTTI i contatti (prima: campione di 5.000).
  const q = useCrmSegmenti(companyId);
  const rows = useMemo(
    () =>
      (q.data?.aziende ?? []).map((a) => ({
        company: a.azienda,
        contacts: a.contatti,
        dm: a.decision_maker,
        pipeline: a.pipeline,
        hot: a.caldi,
        trade: a.mestiere,
      })),
    [q.data],
  );

  return (
    <Shell
      title="Aziende / Account"
      note={q.data?.approssimato ? "oggi · prime aziende scelte su un campione" : "oggi, indipendente dal periodo"}
      icon={Building2}
      isLoading={q.isLoading}
      isEmpty={rows.length === 0}
      emptyText="Nessun contatto con azienda associata."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-normal">Azienda</th>
              <th className="py-1.5 px-2 font-normal text-right">Contatti</th>
              <th className="py-1.5 px-2 font-normal">Decision maker</th>
              <th className="py-1.5 px-2 font-normal text-right">Pipeline</th>
              <th className="py-1.5 pl-2 font-normal text-right">Caldi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.company} className="border-t">
                <td className="py-2 pr-2">
                  <div className="font-medium leading-tight">{r.company}</div>
                  {r.trade && <div className="text-xs text-muted-foreground">{r.trade}</div>}
                </td>
                <td className="py-2 px-2 text-right">{r.contacts}</td>
                <td className="py-2 px-2">
                  {r.dm ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {r.dm}
                    </span>
                  ) : (
                    <span className="text-amber-600">da identificare</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right font-medium">{r.pipeline > 0 ? eur(r.pipeline) : "—"}</td>
                <td className="py-2 pl-2 text-right">{r.hot > 0 ? <span className="text-red-600">{r.hot}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

// ─── Classifica team ────────────────────────────────────────────────────────
export function CrmTeamCard({ companyId, days }: { companyId: string; days: number }) {
  const [nowMs] = useState(() => Date.now());
  const sinceIso = useMemo(() => new Date(nowMs - days * 86_400_000).toISOString(), [nowMs, days]);
  const q = useQuery({
    queryKey: ["crm-dash", "team", companyId, sinceIso],
    staleTime: 60_000,
    queryFn: async () => {
      // Tutto nel periodo scelto: attività fatte, vinte (won_at) e perse (lost_at).
      const [acts, won, lost] = await Promise.all([
        supabase
          .from("marketing_contact_activities")
          .select("created_by")
          .eq("company_id", companyId)
          .gte("created_at", sinceIso)
          .limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("assigned_to,status,value")
          .eq("company_id", companyId)
          .eq("status", "won")
          .is("deleted_at", null)
          .gte("won_at", sinceIso)
          .limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("assigned_to,status,value")
          .eq("company_id", companyId)
          .eq("status", "lost")
          .is("deleted_at", null)
          .gte("lost_at", sinceIso)
          .limit(5000),
      ]);
      if (acts.error) throw acts.error;
      const a = (acts.data ?? []) as { created_by: string | null }[];
      const o = [...(won.data ?? []), ...(lost.data ?? [])] as {
        assigned_to: string | null;
        status: string | null;
        value: number | null;
      }[];
      const ids = [
        ...new Set([...a.map((x) => x.created_by), ...o.map((x) => x.assigned_to)].filter(Boolean)),
      ] as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
        names = Object.fromEntries(
          (profs ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Agente"]),
        );
      }
      return { acts: a, opps: o, names };
    },
  });

  const rows = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const agg = new Map<string, { activities: number; won: number; closed: number; wonValue: number }>();
    const ensure = (id: string) => {
      if (!agg.has(id)) agg.set(id, { activities: 0, won: 0, closed: 0, wonValue: 0 });
      return agg.get(id)!;
    };
    for (const a of d.acts) if (a.created_by) ensure(a.created_by).activities += 1;
    for (const o of d.opps) {
      if (!o.assigned_to) continue;
      const r = ensure(o.assigned_to);
      if (o.status === "won") {
        r.won += 1;
        r.closed += 1;
        r.wonValue += o.value ?? 0;
      } else if (o.status === "lost") {
        r.closed += 1;
      }
    }
    return [...agg.entries()]
      .map(([id, v]) => ({ id, name: d.names[id] ?? "Agente", ...v, winRate: v.closed ? (v.won / v.closed) * 100 : 0 }))
      .filter((r) => r.activities > 0 || r.closed > 0 || r.won > 0)
      .sort((a, b) => b.winRate - a.winRate || b.wonValue - a.wonValue)
      .slice(0, 6);
  }, [q.data]);

  return (
    <Shell
      title="Classifica agenti (per conversione)"
      note={`ultimi ${days} giorni`}
      icon={Trophy}
      isLoading={q.isLoading}
      isEmpty={rows.length === 0}
      emptyText="Nessuna attività o trattativa assegnata."
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1.5 pr-2 font-normal">Agente</th>
            <th className="py-1.5 px-2 font-normal text-right">Attività</th>
            <th className="py-1.5 px-2 font-normal text-right">Vinti</th>
            <th className="py-1.5 pl-2 font-normal text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2 pr-2 font-medium">{r.name}</td>
              <td className="py-2 px-2 text-right">{r.activities}</td>
              <td className="py-2 px-2 text-right">{r.wonValue > 0 ? `${eur(r.wonValue)} · ${r.won}` : r.won}</td>
              <td className={"py-2 pl-2 text-right font-medium " + (r.winRate >= 25 ? "text-emerald-600" : "text-amber-600")}>
                {Math.round(r.winRate)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

// ─── Alert intelligenti ─────────────────────────────────────────────────────
type AlertTone = "warn" | "danger" | "info";
const TONE: Record<AlertTone, string> = {
  warn: "border-amber-200 bg-amber-50/50 text-amber-800",
  danger: "border-red-200 bg-red-50/50 text-red-800",
  info: "border-blue-200 bg-blue-50/50 text-blue-800",
};

export function CrmAlertsCard({ companyId }: { companyId: string }) {
  const [nowMs] = useState(() => Date.now());
  const seg = useCrmSegmenti(companyId);
  const q = useQuery({
    queryKey: ["crm-dash", "alerts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      // I contatti caldi li conta il database (useCrmSegmenti): qui servono
      // solo le opportunità aperte e le soglie di stallo.
      const [opps, stages] = await Promise.all([
        supabase
          .from("marketing_opportunities")
          .select("status,stage_changed_at,next_action_date,stage_id")
          .eq("company_id", companyId)
          .eq("status", "open")
          .is("deleted_at", null)
          .limit(5000),
        supabase.from("marketing_pipeline_stages").select("id,stalled_threshold_days").eq("company_id", companyId),
      ]);
      if (opps.error) throw opps.error;
      return {
        opps: (opps.data ?? []) as {
          status: string | null;
          stage_changed_at: string | null;
          next_action_date: string | null;
          stage_id: string | null;
        }[],
        stages: (stages.data ?? []) as { id: string; stalled_threshold_days: number | null }[],
      };
    },
  });

  const alerts = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const out: { tone: AlertTone; icon: typeof Flame; text: string }[] = [];

    const hotCold = seg.data?.caldi_senza_followup ?? 0;
    if (hotCold > 0)
      out.push({ tone: "warn", icon: Flame, text: `${hotCold} lead caldi senza follow-up da 5+ giorni` });

    const hotCompaniesNoDm = seg.data?.aziende_calde_senza_dm ?? 0;
    if (hotCompaniesNoDm > 0)
      out.push({ tone: "info", icon: UserX, text: `${hotCompaniesNoDm} aziende calde senza decision maker identificato` });

    const stalledMap = new Map(d.stages.map((s) => [s.id, s.stalled_threshold_days ?? 14]));
    const stalled = d.opps.filter((o) => {
      if ((o.status ?? "open") !== "open" || !o.stage_changed_at) return false;
      const thr = (o.stage_id && stalledMap.get(o.stage_id)) || 14;
      return nowMs - new Date(o.stage_changed_at).getTime() > thr * 86_400_000;
    }).length;
    if (stalled > 0)
      out.push({ tone: "danger", icon: Hourglass, text: `${stalled} trattative ferme oltre la soglia dello stadio` });

    const overdue = d.opps.filter(
      (o) => (o.status ?? "open") === "open" && o.next_action_date && new Date(o.next_action_date).getTime() <= nowMs,
    ).length;
    if (overdue > 0)
      out.push({ tone: "warn", icon: CalendarX, text: `${overdue} prossime azioni in scadenza o scadute` });

    return out;
  }, [q.data, seg.data, nowMs]);

  return (
    <Shell
      title="Alert intelligenti"
      note="oggi, indipendente dal periodo"
      icon={Bell}
      isLoading={q.isLoading || seg.isLoading}
      isEmpty={false}
      emptyText=""
    >
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 py-3 text-sm text-emerald-700">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Tutto sotto controllo: nessun alert.
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-[13px]">
          {alerts.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={i} className={"flex items-center gap-2.5 rounded-md border px-3 py-2 " + TONE[a.tone]}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> <span>{a.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
