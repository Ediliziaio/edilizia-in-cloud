import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/metaInsightsNormalizer";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  dailySeries: DailyPoint[];
  isLoading: boolean;
}

type Vista = "spesa" | "traffico";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const num = (v: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(v);

const NOMI: Record<string, string> = {
  spend: "Spesa",
  conversions: "Lead",
  cpl: "Costo per lead",
  impressions: "Impressioni",
  clicks: "Clic sul link",
};

const TrendChart = ({ dailySeries, isLoading }: Props) => {
  const [vista, setVista] = useState<Vista>("spesa");

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
    cpl: d.conversions > 0 ? d.spend / d.conversions : null,
    label: format(parseISO(d.date), "dd MMM", { locale: it }),
  }));

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Andamento giornaliero</h3>
          <p className="text-xs text-muted-foreground">Tutto l'account, giorno per giorno</p>
        </div>
        <ToggleGroup type="single" size="sm" value={vista} onValueChange={(v) => v && setVista(v as Vista)}>
          <ToggleGroupItem value="spesa" className="text-xs px-2.5">Spesa e lead</ToggleGroupItem>
          <ToggleGroupItem value="traffico" className="text-xs px-2.5">Impressioni e clic</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          {vista === "spesa" ? (
            <>
              <YAxis yAxisId="sx" tick={{ fontSize: 11 }} tickFormatter={eur} width={60} />
              <YAxis yAxisId="dx" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} width={36} />
              <Bar yAxisId="sx" dataKey="spend" fill="hsl(217, 91%, 60%)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
              <Line yAxisId="dx" type="monotone" dataKey="conversions" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 2 }} />
              <Line yAxisId="sx" type="monotone" dataKey="cpl" stroke="hsl(24, 95%, 53%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
            </>
          ) : (
            <>
              <YAxis yAxisId="sx" tick={{ fontSize: 11 }} tickFormatter={num} width={60} />
              <YAxis yAxisId="dx" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
              <Bar yAxisId="sx" dataKey="impressions" fill="hsl(217, 91%, 60%)" fillOpacity={0.3} radius={[3, 3, 0, 0]} />
              <Line yAxisId="dx" type="monotone" dataKey="clicks" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 2 }} />
            </>
          )}
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
            formatter={(value: number, name: string) => [
              name === "spend" || name === "cpl" ? eur(value) : num(value),
              NOMI[name] ?? name,
            ]}
          />
          <Legend formatter={(name: string) => NOMI[name] ?? name} wrapperStyle={{ fontSize: 12 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default TrendChart;
