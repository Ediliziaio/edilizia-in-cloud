import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/metaInsightsNormalizer";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  dailySeries: DailyPoint[];
  isLoading: boolean;
}

const TrendChart = ({ dailySeries, isLoading }: Props) => {
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[250px] w-full" />
      </Card>
    );
  }

  if (dailySeries.length === 0) {
    return (
      <Card className="p-6 flex items-center justify-center h-[300px]">
        <p className="text-sm text-muted-foreground">Nessun dato nel periodo selezionato</p>
      </Card>
    );
  }

  const formatted = dailySeries.map((d) => ({
    ...d,
    label: format(parseISO(d.date), "dd MMM", { locale: it }),
  }));

  return (
    <Card className="p-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Trend giornaliero</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gImpressions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
            formatter={(value: number, name: string) => [
              new Intl.NumberFormat("it-IT").format(value),
              name === "clicks" ? "Clic" : name === "impressions" ? "Impressioni" : "Conversioni",
            ]}
          />
          <Area type="monotone" dataKey="impressions" stroke="hsl(217, 91%, 60%)" fill="url(#gImpressions)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="clicks" stroke="hsl(142, 71%, 45%)" fill="url(#gClicks)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="conversions" stroke="hsl(262, 83%, 58%)" fill="none" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default TrendChart;
