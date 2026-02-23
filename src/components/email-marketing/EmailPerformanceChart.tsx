import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useState } from "react";

type ChartDataPoint = { date: string; all: number; broadcast: number; automation: number; bulk: number };

interface EmailPerformanceChartProps {
  datasets: {
    open_rate: ChartDataPoint[];
    click_rate: ChartDataPoint[];
    delivery_rate: ChartDataPoint[];
  };
}

const METRICS = [
  { value: "open_rate", label: "Tasso di apertura" },
  { value: "click_rate", label: "Tasso di clic" },
  { value: "delivery_rate", label: "Tasso di consegna" },
] as const;

type MetricKey = typeof METRICS[number]["value"];

export function EmailPerformanceChart({ datasets }: EmailPerformanceChartProps) {
  const [metric, setMetric] = useState<MetricKey>("open_rate");

  const data = datasets[metric] || [];
  const hasData = data.length > 0 && data.some(d => d.all > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">
            {METRICS.find(m => m.value === metric)?.label || "Tasso di apertura"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">Andamento nel tempo per tipo di campagna</p>
        </div>
        <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {METRICS.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Nessun dato disponibile. Invia campagne per visualizzare l'andamento.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Legend />
              <Line type="monotone" dataKey="all" name="Tutte le campagne" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="broadcast" name="Campagna Email" stroke="hsl(142, 76%, 36%)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="automation" name="Campagna Flusso" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="bulk" name="Azione in blocco" stroke="hsl(270, 70%, 55%)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
