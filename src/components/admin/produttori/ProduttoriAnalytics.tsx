import { useMemo } from "react";
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
// Barre custom in div (pattern ReferralMegaDashboard): recharts 3.x non disegna
// le Pie a fetta singola né i BarChart layout="vertical" di questo caso d'uso
// (settori senza path / barra orientata male e clippata).
const BAR_COLORS = [COLOR.blue, COLOR.violet, COLOR.emerald, COLOR.amber, COLOR.rose, COLOR.slate];

interface Riv { plan_name: string | null; plan_price: number; billing_comped: boolean | null; status: string | null }
interface Prod { id: string; name: string; rivenditori: Riv[]; rivenditori_count: number; comped_count: number; wholesale_pct: number }

/**
 * Analytics "mega dashboard" dell'area Produttori (stile ReferralMegaDashboard):
 * KPI ricchi (incl. incasso wholesale calcolato) + grafici recharts (distribuzione
 * piani, chi paga, top produttori). Tutto derivato dai dati già caricati.
 */
export function ProduttoriAnalytics({ produttori, inactiveCount, onInactiveClick }: { produttori: Prod[]; inactiveCount?: number; onInactiveClick?: () => void }) {
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
        <Kpi icon={<Clock className="h-5 w-5" />} value={inactiveCount === undefined ? "…" : inactiveCount} label="Inattivi / mai entrati" sub="oltre 30 giorni" tone="rose" onClick={inactiveCount ? onInactiveClick : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartCard title="Distribuzione piani">
          {m.planDist.length === 0 ? <Empty /> : <HBars items={m.planDist} />}
        </ChartCard>

        <ChartCard title="Chi paga">
          {billingPie.length === 0 ? <Empty /> : (
            <HBars items={[{ name: "Paghi tu", value: m.comped }, { name: "Pagano loro", value: m.paganoLoro }]} colors={[COLOR.amber, COLOR.blue]} />
          )}
        </ChartCard>

        <ChartCard title="Top produttori per rivenditori">
          {m.topProd.length === 0 ? <Empty /> : <HBars items={m.topProd.map((p) => ({ name: p.name, value: p.rivenditori }))} singleColor={COLOR.violet} />}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ icon, value, label, sub, tone, onClick }: {
  icon: React.ReactNode; value: React.ReactNode; label: string; sub?: string;
  tone: "violet" | "blue" | "emerald" | "amber" | "rose";
  onClick?: () => void;
}) {
  const toneCls =
    tone === "violet" ? "bg-violet-100 text-violet-700"
      : tone === "blue" ? "bg-blue-100 text-blue-700"
        : tone === "emerald" ? "bg-emerald-100 text-emerald-700"
          : tone === "rose" ? "bg-rose-100 text-rose-700"
            : "bg-amber-100 text-amber-700";
  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={onClick ? "cursor-pointer transition-colors hover:bg-muted/40" : undefined}
      title={onClick ? "Filtra: mostra solo gli inattivi" : undefined}
    >
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

/** Barre orizzontali deterministiche: etichetta, barra proporzionale, valore. */
function HBars({ items, singleColor, colors }: { items: { name: string; value: number }[]; singleColor?: string; colors?: string[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5 py-1">
      {items.map((it, i) => (
        <div key={it.name} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground" title={it.name}>{it.name}</span>
            <span className="shrink-0 font-semibold">{it.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max(3, (it.value / max) * 100)}%`, backgroundColor: singleColor ?? colors?.[i] ?? BAR_COLORS[i % BAR_COLORS.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">Nessun dato</div>;
}
