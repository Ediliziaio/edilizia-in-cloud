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

const eur = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `€${v}`;
};
const isHot = (t: string | null) => /hot|cald|high|alto|^a$/i.test(t || "");

function Shell({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof Building2;
  isLoading: boolean;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" aria-hidden="true" /> {title}
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
  const q = useQuery({
    queryKey: ["crm-dash", "accounts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, opps] = await Promise.all([
        supabase
          .from("marketing_contacts")
          .select("id,company_name,first_name,last_name,is_decision_maker,ai_score_tier,tipo")
          .eq("company_id", companyId)
          .limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("contact_id,value,status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(5000),
      ]);
      if (contacts.error) throw contacts.error;
      return {
        contacts: (contacts.data ?? []) as {
          id: string;
          company_name: string | null;
          first_name: string;
          last_name: string | null;
          is_decision_maker: boolean | null;
          ai_score_tier: string | null;
          tipo: string | null;
        }[],
        opps: (opps.data ?? []) as { contact_id: string | null; value: number | null; status: string | null }[],
      };
    },
  });

  const rows = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const pipelineByContact = new Map<string, number>();
    for (const o of d.opps) {
      if (o.contact_id && (o.status ?? "open") === "open") {
        pipelineByContact.set(o.contact_id, (pipelineByContact.get(o.contact_id) ?? 0) + (o.value ?? 0));
      }
    }
    const byCompany = new Map<
      string,
      { contacts: number; dm: string | null; pipeline: number; hot: number; trade: string | null }
    >();
    for (const c of d.contacts) {
      const name = (c.company_name || "").trim();
      if (!name) continue;
      const cur = byCompany.get(name) ?? { contacts: 0, dm: null, pipeline: 0, hot: 0, trade: null };
      cur.contacts += 1;
      cur.pipeline += pipelineByContact.get(c.id) ?? 0;
      if (isHot(c.ai_score_tier)) cur.hot += 1;
      if (!cur.trade && c.tipo) cur.trade = c.tipo;
      if (c.is_decision_maker && !cur.dm) {
        cur.dm = `${c.first_name} ${c.last_name ?? ""}`.trim();
      }
      byCompany.set(name, cur);
    }
    return [...byCompany.entries()]
      .map(([company, v]) => ({ company, ...v }))
      .sort((a, b) => b.pipeline - a.pipeline || b.contacts - a.contacts)
      .slice(0, 8);
  }, [q.data]);

  return (
    <Shell
      title="Aziende / Account"
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
export function CrmTeamCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "team", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const [acts, opps] = await Promise.all([
        supabase.from("marketing_contact_activities").select("created_by").eq("company_id", companyId).limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("assigned_to,status,value")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(5000),
      ]);
      if (acts.error) throw acts.error;
      const a = (acts.data ?? []) as { created_by: string | null }[];
      const o = (opps.data ?? []) as { assigned_to: string | null; status: string | null; value: number | null }[];
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
  const q = useQuery({
    queryKey: ["crm-dash", "alerts", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, opps, stages] = await Promise.all([
        supabase
          .from("marketing_contacts")
          .select("ai_score_tier,last_activity_at,is_decision_maker,company_name")
          .eq("company_id", companyId)
          .limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("status,stage_changed_at,next_action_date,stage_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(5000),
        supabase.from("marketing_pipeline_stages").select("id,stalled_threshold_days").eq("company_id", companyId),
      ]);
      if (contacts.error) throw contacts.error;
      return {
        contacts: (contacts.data ?? []) as {
          ai_score_tier: string | null;
          last_activity_at: string | null;
          is_decision_maker: boolean | null;
          company_name: string | null;
        }[],
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
    const fiveDays = nowMs - 5 * 86_400_000;

    const hotCold = d.contacts.filter(
      (c) => isHot(c.ai_score_tier) && (!c.last_activity_at || new Date(c.last_activity_at).getTime() < fiveDays),
    ).length;
    if (hotCold > 0)
      out.push({ tone: "warn", icon: Flame, text: `${hotCold} lead caldi senza follow-up da 5+ giorni` });

    const dmByCompany = new Map<string, boolean>();
    for (const c of d.contacts) {
      const k = (c.company_name || "").trim();
      if (!k) continue;
      if (c.is_decision_maker) dmByCompany.set(k, true);
      else if (!dmByCompany.has(k)) dmByCompany.set(k, false);
    }
    const hotCompaniesNoDm = new Set(
      d.contacts
        .filter((c) => isHot(c.ai_score_tier) && (c.company_name || "").trim())
        .map((c) => (c.company_name || "").trim())
        .filter((k) => dmByCompany.get(k) === false),
    ).size;
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
  }, [q.data, nowMs]);

  return (
    <Shell
      title="Alert intelligenti"
      icon={Bell}
      isLoading={q.isLoading}
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
