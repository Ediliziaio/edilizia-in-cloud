import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Calculator, Building2, CheckCircle2, Users, Clock } from "lucide-react";

const COLOR = {
  blue: "hsl(214 80% 50%)",
  emerald: "hsl(160 84% 39%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(262 83% 58%)",
  rose: "hsl(347 77% 50%)",
  slate: "hsl(215 16% 55%)",
};
const PIE_COLORS = [COLOR.blue, COLOR.violet, COLOR.emerald, COLOR.amber, COLOR.rose, COLOR.slate];

const MODE_LABEL: Record<string, string> = {
  operational: "Operativo",
  read_only: "Sola lettura",
  approval_required: "Con approvazione",
};

interface StudioLite { id: string; name: string; status: string | null; members_count: number; companies: { access_mode: string | null }[] }

/** Analytics "mega dashboard" dell'area Commercialisti (stile ProduttoriAnalytics). */
export function CommercialistiAnalytics({ studi, inactiveCount }: { studi: StudioLite[]; inactiveCount?: number }) {
  const m = useMemo(() => {
    const totStudi = studi.length;
    const attivi = studi.filter((s) => s.status === "active").length;
    const aziendeGestite = studi.reduce((sum, s) => sum + s.companies.length, 0);
    const membri = studi.reduce((sum, s) => sum + s.members_count, 0);

    const modeMap = new Map<string, number>();
    studi.forEach((s) => s.companies.forEach((c) => {
      const k = MODE_LABEL[c.access_mode ?? ""] ?? (c.access_mode || "—");
      modeMap.set(k, (modeMap.get(k) ?? 0) + 1);
    }));
    const modeDist = [...modeMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const topStudi = [...studi]
      .sort((a, b) => b.companies.length - a.companies.length)
      .slice(0, 6)
      .map((s) => ({ name: s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name, aziende: s.companies.length }));

    return { totStudi, attivi, aziendeGestite, membri, modeDist, topStudi };
  }, [studi]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Calculator className="h-5 w-5" />} value={m.totStudi} label="Studi" tone="violet" />
        <Kpi icon={<CheckCircle2 className="h-5 w-5" />} value={m.attivi} label="Attivi" tone="emerald" />
        <Kpi icon={<Building2 className="h-5 w-5" />} value={m.aziendeGestite} label="Aziende gestite" tone="blue" />
        <Kpi icon={<Users className="h-5 w-5" />} value={m.membri} label="Membri" tone="amber" />
        <Kpi icon={<Clock className="h-5 w-5" />} value={inactiveCount === undefined ? "…" : inactiveCount} label="Inattivi / mai entrati" tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Aziende per modalità di accesso">
          {m.modeDist.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={m.modeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {m.modeDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <Legend2 items={m.modeDist.map((d, i) => ({ label: d.name, value: d.value, color: PIE_COLORS[i % PIE_COLORS.length] }))} />
            </>
          )}
        </ChartCard>

        <ChartCard title="Top studi per aziende gestite">
          {m.topStudi.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={m.topStudi} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(215 16% 90%)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="aziende" fill={COLOR.violet} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ icon, value, label, tone }: {
  icon: React.ReactNode; value: React.ReactNode; label: string;
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
