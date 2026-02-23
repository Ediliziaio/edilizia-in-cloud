import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface FunnelData {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
}

interface EmailFunnelChartProps {
  data: FunnelData;
}

const COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(270, 70%, 55%)",
  "hsl(0, 84%, 60%)",
];

export function EmailFunnelChart({ data }: EmailFunnelChartProps) {
  const chartData = [
    { name: "Inviate", value: data.sent },
    { name: "Consegnate", value: data.delivered },
    { name: "Aperte", value: data.opened },
    { name: "Cliccate", value: data.clicked },
    { name: "Convertite", value: data.converted },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Funnel Email</CardTitle>
      </CardHeader>
      <CardContent>
        {data.sent === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Nessun dato disponibile. Invia la tua prima campagna per vedere il funnel.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 13 }} />
              <Tooltip formatter={(v: number) => v.toLocaleString("it-IT")} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
