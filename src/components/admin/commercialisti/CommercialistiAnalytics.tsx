import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Calculator, Building2, CheckCircle2, Users, Clock } from "lucide-react";

// Barre custom in div (pattern ReferralMegaDashboard): recharts 3.x non disegna
// le Pie a fetta singola né i BarChart layout="vertical" di questo caso d'uso
// (settori senza path / barra orientata male e clippata) — i div sono
// deterministici, accessibili e più leggeri.
const COLOR = {
  blue: "hsl(214 80% 50%)",
  emerald: "hsl(160 84% 39%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(262 83% 58%)",
  rose: "hsl(347 77% 50%)",
  slate: "hsl(215 16% 55%)",
};
const BAR_COLORS = [COLOR.blue, COLOR.violet, COLOR.emerald, COLOR.amber, COLOR.rose, COLOR.slate];

const MODE_LABEL: Record<string, string> = {
  operational: "Operativo",
  read_only: "Sola lettura",
  approval_required: "Con approvazione",
};

interface StudioLite { id: string; name: string; status: string | null; members_count: number; companies: { access_mode: string | null }[] }

/** Analytics "mega dashboard" dell'area Commercialisti (stile ProduttoriAnalytics). */
export function CommercialistiAnalytics({ studi, inactiveCount, onInactiveClick }: { studi: StudioLite[]; inactiveCount?: number; onInactiveClick?: () => void }) {
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
      .map((s) => ({ name: s.name, value: s.companies.length }));

    return { totStudi, attivi, aziendeGestite, membri, modeDist, topStudi };
  }, [studi]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<Calculator className="h-5 w-5" />} value={m.totStudi} label="Studi" tone="violet" />
        <Kpi icon={<CheckCircle2 className="h-5 w-5" />} value={m.attivi} label="Attivi" tone="emerald" />
        <Kpi icon={<Building2 className="h-5 w-5" />} value={m.aziendeGestite} label="Aziende gestite" tone="blue" />
        <Kpi icon={<Users className="h-5 w-5" />} value={m.membri} label="Membri" tone="amber" />
        <Kpi icon={<Clock className="h-5 w-5" />} value={inactiveCount === undefined ? "…" : inactiveCount} label="Inattivi / mai entrati" tone="rose" onClick={inactiveCount ? onInactiveClick : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Aziende per modalità di accesso">
          {m.modeDist.length === 0 ? <Empty /> : <HBars items={m.modeDist} />}
        </ChartCard>

        <ChartCard title="Top studi per aziende gestite">
          {m.topStudi.length === 0 ? <Empty /> : <HBars items={m.topStudi} singleColor={COLOR.violet} />}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ icon, value, label, tone, onClick }: {
  icon: React.ReactNode; value: React.ReactNode; label: string;
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
function HBars({ items, singleColor }: { items: { name: string; value: number }[]; singleColor?: string }) {
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
              style={{ width: `${Math.max(3, (it.value / max) * 100)}%`, backgroundColor: singleColor ?? BAR_COLORS[i % BAR_COLORS.length] }}
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
