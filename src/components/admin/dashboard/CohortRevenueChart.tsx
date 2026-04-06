import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, BarChart3 } from "lucide-react";
import { useCohortRevenue } from "@/hooks/useCohortRevenue";

// Palette 12 colori distinti
const COHORT_COLORS = [
  "#2563EB", "#16A34A", "#DC2626", "#9333EA",
  "#F59E0B", "#0891B2", "#BE185D", "#4338CA",
  "#059669", "#B45309", "#7C3AED", "#0F172A",
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold mb-2">Mese {label}</p>
      {payload
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium">{p.value}%</span>
          </div>
        ))}
    </div>
  );
}

export function CohortRevenueChart() {
  const { chartData, cohortLabels, isLoading, isError } = useCohortRevenue();
  const [maxCohorts, setMaxCohorts] = useState(6);

  const visibleCohorts = cohortLabels.slice(-maxCohorts);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Impossibile caricare i dati cohort</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0 || cohortLabels.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Dati insufficienti per l'analisi cohort
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sono necessari almeno 2 mesi di dati di abbonamento
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-medium">Cohort Retention</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              % aziende attive per mese di iscrizione
            </p>
          </div>
          <div className="flex gap-1">
            {[3, 6, 12].map((n) => (
              <Button
                key={n}
                variant={maxCohorts === n ? "default" : "outline"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMaxCohorts(n)}
              >
                {n} cohort
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="mesi_dalla_iscrizione"
              tickFormatter={(v: number) => `M${v}`}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11 }}
              domain={[0, 100]}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
            />
            {visibleCohorts.map((cohort, idx) => (
              <Line
                key={cohort}
                type="monotone"
                dataKey={cohort}
                name={cohort}
                stroke={COHORT_COLORS[idx % COHORT_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
