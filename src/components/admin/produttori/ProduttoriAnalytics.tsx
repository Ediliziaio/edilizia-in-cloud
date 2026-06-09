import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/formatEuro";
import { Factory, Users, BadgeEuro, CreditCard, Clock } from "lucide-react";

const COLOR = {
  blue: "hsl(214 80% 50%)",
  emerald: "hsl(160 84% 39%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(262 83% 58%)",
  rose: "hsl(347 77% 50%)",
  slate: "hsl(215 16% 55%)",
};
const PIE_COLORS = [COLOR.blue, COLOR.violet, COLOR.emerald, COLOR.amber, COLOR.rose, COLOR.slate];

interface Riv { plan_name: string | null; plan_price: number; billing_comped: boolean | null; status: string | null }
interface Prod { id: string; name: string; rivenditori: Riv[]; rivenditori_count: number; comped_count: number; wholesale_pct: number }

/**
 * Analytics "mega dashboard" dell'area Produttori (stile ReferralMegaDashboard):
 * KPI ricchi (incl. incasso wholesale calcolato) + grafici recharts (distribuzione
 * piani, chi paga, top produttori). Tutto derivato dai dati già caricati.
 */
export function ProduttoriAnalytics({ produttori, inactiveCount }: { produttori: Prod[]; inactiveCount?: number }) {
  const m = useMemo(() => {
    const allRivs = produttori.flatMap((p) => p.rivenditori);
    const totRiv = allRivs.length;
    const attivi = allRivs.filter((r) => r.status === "active").length;
    const sospesi = allRivs.filter((r) => r.status === "suspended").length;
    const comped = allRivs.filter((r) => r.billing_comped).length;

    let wholesaleMrr = 0, listMrr = 0, selfMrr = 0;
    produttori.forEach((p) => {
      const factor = 1 - Math.min(100, Math.max(0, p.wholesale_pct)) / 100;
      p.rivenditori.forEach((r) => {
        if (r.billing_comped) { listMrr += r.plan_price; wholesaleMrr += r.plan_price * factor; }
        else selfMrr += r.plan_price;
      });
    });

    const planMap = new Map<string, number>();
    allRivs.forEach((r) => { const k = r.plan_name ?? "Senza piano"; planMap.set(k, (planMap.get(k) ?? 0) + 1); });
    const planDist = [...planMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const topProd = [...produttori]
      .sort((a, b) => b.rivenditori_count - a.rivenditori_count)
      .slice(0, 6)
      .map((p) => ({ name: p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name, rivenditori: p.rivenditori_count }));

    return {
      totRiv, attivi, sospesi, comped, paganoLoro: totRiv - comped,
      wholesaleMrr: Math.round(wholesaleMrr * 100) / 100,
      listMrr: Math.round(listMrr * 100) / 100,
      selfMrr: Math.round(selfMrr * 100) / 100,
      planDist, topProd,
    };
  }, [produttori]);

  const billingPie = [
    { name: "Paghi tu", value: m.comped },
    { name: "Pagano loro", value: m.paganoLoro },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Factory className="h-5 w-5" />} value={produttori.length} label="Produttori" tone="violet" />
        <Kpi icon={<Users className="h-5 w-5" />} value={m.totRiv} label="Rivenditori" sub={`${m.attivi} attivi · ${m.sospesi} sospesi`} tone="blue" />
        <Kpi icon={<BadgeEuro className="h-5 w-5" />} value={formatEuro(m.wholesaleMrr)} label="Incasso wholesale/mese" sub={m.listMrr > m.wholesaleMrr ? `listino ${formatEuro(m.listMrr)}` : "al listino"} tone="emerald" />
        <Kpi icon={<CreditCard className="h-5 w-5" />} value={formatEuro(m.selfMrr)} label="Pagano loro/mese" sub={`${m.paganoLoro} rivenditori`} tone="amber" />
        <Kpi icon={<Clock className="h-5 w-5" />} value={inactiveCount === undefined ? "…" : inactiveCount} label="Inattivi / mai entrati" sub="oltre 30 giorni" tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard title="Distribuzione piani">
          {m.planDist.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={m.planDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {m.planDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={m.planDist.map((d, i) => ({ label: d.name, value: d.value, color: PIE_COLORS[i % PIE_COLORS.length] }))} />
            </>
          )}
        </ChartCard>

        <ChartCard title="Chi paga">
          {billingPie.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={billingPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {billingPie.map((d) => <Cell key={d.name} fill={d.name === "Paghi tu" ? COLOR.amber : COLOR.blue} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={[{ label: "Paghi tu", value: m.comped, color: COLOR.amber }, { label: "Pagano loro", value: m.paganoLoro, color: COLOR.blue }]} />
            </>
          )}
        </ChartCard>

        <ChartCard title="Top produttori per rivenditori">
          {m.topProd.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={m.topProd} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(215 16% 90%)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="rivenditori" fill={COLOR.violet} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ icon, value, label, sub, tone }: {
  icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string;
  tone: "violet" | "blue" | "emerald" | "amber" | "rose";
}) {
  const toneCls =
    tone === "violet" ? "bg-violet-100 text-violet-700"
      : tone === "blue" ? "bg-blue-100 text-blue-700"
        : tone === "emerald" ? "bg-emerald-100 text-emerald-700"
          : tone === "rose" ? "bg-rose-100 text-rose-700"
            : "bg-amber-100 text-amber-700";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneCls)}>{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-xl font-bold leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          {sub && <div className="text-[11px] leading-tight text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Legend2({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-xs">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: it.color }} />
          <span className="text-muted-foreground">{it.label}</span>
          <span className="font-medium">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">Nessun dato</div>;
}
