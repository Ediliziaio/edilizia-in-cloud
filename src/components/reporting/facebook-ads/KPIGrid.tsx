import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { KPISummary, DailyPoint } from "@/lib/metaInsightsNormalizer";

const fmtNum = (n: number) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n);
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + "%";

interface Props {
  kpis: KPISummary;
  dailySeries: DailyPoint[];
  isLoading: boolean;
}

interface BigCardProps {
  label: string;
  value: string;
  data: { v: number }[];
  color: string;
  isLoading: boolean;
}

const MiniSparkline = ({ data, color }: { data: { v: number }[]; color: string }) => (
  <ResponsiveContainer width="100%" height={40}>
    <AreaChart data={data}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} fill={`url(#grad-${color})`} strokeWidth={1.5} dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

const BigCard = ({ label, value, data, color, isLoading }: BigCardProps) => (
  <Card className="p-4 flex flex-col gap-2">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    {isLoading ? (
      <Skeleton className="h-8 w-24" />
    ) : (
      <span className="text-2xl font-semibold">{value}</span>
    )}
    {data.length > 1 && !isLoading && <MiniSparkline data={data} color={color} />}
  </Card>
);

const SmallCard = ({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) => (
  <Card className="p-3 flex flex-col gap-1">
    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    {isLoading ? <Skeleton className="h-6 w-16" /> : <span className="text-lg font-semibold">{value}</span>}
  </Card>
);

const KPIGrid = ({ kpis, dailySeries, isLoading }: Props) => {
  const impressionsData = dailySeries.map((d) => ({ v: d.impressions }));
  const clicksData = dailySeries.map((d) => ({ v: d.clicks }));
  const conversionsData = dailySeries.map((d) => ({ v: d.conversions }));

  return (
    <div className="space-y-4">
      {/* Big cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BigCard label="Impressioni" value={fmtNum(kpis.impressions)} data={impressionsData} color="hsl(217, 91%, 60%)" isLoading={isLoading} />
        <BigCard label="Clic" value={fmtNum(kpis.clicks)} data={clicksData} color="hsl(142, 71%, 45%)" isLoading={isLoading} />
        <BigCard label="Conversioni" value={fmtNum(kpis.conversions)} data={conversionsData} color="hsl(262, 83%, 58%)" isLoading={isLoading} />
      </div>

      {/* Small cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <SmallCard label="Spesa totale" value={fmtCurrency(kpis.spend)} isLoading={isLoading} />
        <SmallCard label="CPC medio" value={fmtCurrency(kpis.cpc)} isLoading={isLoading} />
        <SmallCard label="Costo per conversione" value={fmtCurrency(kpis.cost_per_conversion)} isLoading={isLoading} />
        <SmallCard label="CPL" value={fmtCurrency(kpis.cpl)} isLoading={isLoading} />
        <SmallCard label="ROAS" value={kpis.revenue > 0 ? `${fmtPct(kpis.roas * 100).replace('%','')}x` : "N/D"} isLoading={isLoading} />
        <SmallCard label="Copertura" value={fmtNum(kpis.reach)} isLoading={isLoading} />
        <SmallCard label="Frequenza" value={kpis.reach > 0 ? fmtPct(kpis.frequency).replace('%','') : "N/D"} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default KPIGrid;
