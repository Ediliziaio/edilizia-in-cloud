/**
 * Sezioni a barre della Dashboard commerciale (componenti indipendenti
 * company-scoped):
 *  - CrmFunnelCard:   funnel conversioni Lead → Opportunità → Vinti.
 *  - CrmChannelsCard: lead per fonte + costo-per-lead/ROI (campaign_costs) + win%.
 *  - CrmClustersCard: cluster per mestiere (tipo) e per zona (province).
 *
 * Barre in puro CSS con palette --chart-*, empty-state onesto.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, Radar, Wrench, MapPin, Loader2 } from "lucide-react";

const eur = (n: number) => {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `€${v}`;
};

interface BarRow {
  label: string;
  value: number;
  hint?: string;
}

function BarList({ rows, color }: { rows: BarRow[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 text-muted-foreground">{r.hint ?? r.value}</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof Filter;
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

// ─── Funnel conversioni ─────────────────────────────────────────────────────
export function CrmFunnelCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "funnel", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, opps] = await Promise.all([
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase
          .from("marketing_opportunities")
          .select("status,contact_id")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(5000),
      ]);
      if (opps.error) throw opps.error;
      return {
        leads: contacts.count ?? 0,
        opps: (opps.data ?? []) as { status: string | null; contact_id: string | null }[],
      };
    },
  });

  const rows = useMemo<BarRow[]>(() => {
    const leads = q.data?.leads ?? 0;
    const opps = q.data?.opps ?? [];
    const oppContacts = new Set(opps.map((o) => o.contact_id).filter(Boolean)).size;
    const won = opps.filter((o) => o.status === "won").length;
    const rate = (cur: number, prev: number) => (prev > 0 ? ` · ${Math.round((cur / prev) * 100)}%` : "");
    return [
      { label: "Lead", value: leads, hint: String(leads) },
      { label: "Opportunità", value: oppContacts, hint: `${oppContacts}${rate(oppContacts, leads)}` },
      { label: "Vinti", value: won, hint: `${won}${rate(won, oppContacts)}` },
    ];
  }, [q.data]);

  const empty = (q.data?.leads ?? 0) === 0 && (q.data?.opps.length ?? 0) === 0;
  return (
    <SectionCard title="Funnel conversioni" icon={Filter} isLoading={q.isLoading} isEmpty={empty} emptyText="Ancora nessun lead.">
      <BarList rows={rows} color="hsl(var(--chart-2))" />
    </SectionCard>
  );
}

// ─── Fonti + ROI ────────────────────────────────────────────────────────────
export function CrmChannelsCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "channels", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, costs, opps] = await Promise.all([
        supabase.from("marketing_contacts").select("source").eq("company_id", companyId).limit(5000),
        supabase.from("campaign_costs").select("source,spend_amount").eq("company_id", companyId).limit(5000),
        supabase
          .from("marketing_opportunities")
          .select("source,status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(5000),
      ]);
      if (contacts.error) throw contacts.error;
      return {
        contacts: (contacts.data ?? []) as { source: string | null }[],
        costs: (costs.data ?? []) as { source: string | null; spend_amount: number | null }[],
        opps: (opps.data ?? []) as { source: string | null; status: string | null }[],
      };
    },
  });

  const rows = useMemo<BarRow[]>(() => {
    const d = q.data;
    if (!d) return [];
    const leads = new Map<string, number>();
    for (const c of d.contacts) {
      const s = (c.source || "—").trim() || "—";
      leads.set(s, (leads.get(s) ?? 0) + 1);
    }
    const spend = new Map<string, number>();
    for (const c of d.costs) {
      const s = (c.source || "—").trim() || "—";
      spend.set(s, (spend.get(s) ?? 0) + (c.spend_amount ?? 0));
    }
    const won = new Map<string, number>();
    const oppCount = new Map<string, number>();
    for (const o of d.opps) {
      const s = (o.source || "—").trim() || "—";
      oppCount.set(s, (oppCount.get(s) ?? 0) + 1);
      if (o.status === "won") won.set(s, (won.get(s) ?? 0) + 1);
    }
    return [...leads.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([source, n]) => {
        const sp = spend.get(source) ?? 0;
        const w = won.get(source) ?? 0;
        const base = oppCount.get(source) ?? n;
        const wr = base > 0 ? Math.round((w / base) * 100) : 0;
        const parts = [String(n)];
        if (sp > 0) parts.push(`CPL ${eur(sp / n)}`);
        if (w > 0) parts.push(`${wr}%`);
        return { label: source, value: n, hint: parts.join(" · ") };
      });
  }, [q.data]);

  return (
    <SectionCard
      title="Fonti · costo-lead · win%"
      icon={Radar}
      isLoading={q.isLoading}
      isEmpty={rows.length === 0}
      emptyText="Nessuna fonte tracciata sui contatti."
    >
      <BarList rows={rows} color="hsl(var(--chart-4))" />
    </SectionCard>
  );
}

// ─── Cluster mestiere + zona ────────────────────────────────────────────────
export function CrmClustersCard({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["crm-dash", "clusters", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("tipo,province,ai_predicted_value_eur")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as { tipo: string | null; province: string | null; ai_predicted_value_eur: number | null }[];
    },
  });

  const { trades, regions } = useMemo(() => {
    const t = new Map<string, { n: number; val: number }>();
    const r = new Map<string, number>();
    for (const c of q.data ?? []) {
      const trade = (c.tipo || "").trim();
      if (trade) {
        const cur = t.get(trade) ?? { n: 0, val: 0 };
        cur.n += 1;
        cur.val += c.ai_predicted_value_eur ?? 0;
        t.set(trade, cur);
      }
      const prov = (c.province || "").trim();
      if (prov) r.set(prov, (r.get(prov) ?? 0) + 1);
    }
    const trades: BarRow[] = [...t.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 6)
      .map(([label, { n, val }]) => ({ label, value: n, hint: val > 0 ? `${n} · ${eur(val)}` : String(n) }));
    const regions: BarRow[] = [...r.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, n]) => ({ label, value: n }));
    return { trades, regions };
  }, [q.data]);

  const empty = trades.length === 0 && regions.length === 0;
  return (
    <SectionCard
      title="Segmentazione"
      icon={Wrench}
      isLoading={q.isLoading}
      isEmpty={empty}
      emptyText="Nessun mestiere o zona sui contatti."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Per mestiere
          </div>
          {trades.length ? <BarList rows={trades} color="hsl(var(--chart-2))" /> : <p className="text-xs text-muted-foreground">—</p>}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Per zona
          </div>
          {regions.length ? <BarList rows={regions} color="hsl(var(--chart-3))" /> : <p className="text-xs text-muted-foreground">—</p>}
        </div>
      </div>
    </SectionCard>
  );
}
