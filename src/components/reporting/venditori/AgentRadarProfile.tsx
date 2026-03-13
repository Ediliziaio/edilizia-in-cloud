import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend } from "recharts";
import type { VendorKPI } from "@/hooks/useVendorReport";

interface Props { selected: VendorKPI | null; all: VendorKPI[]; }

const DIMS: { key: keyof VendorKPI; label: string }[] = [
  { key: "tasso_chiusura", label: "Chiusura" },
  { key: "tasso_show_up", label: "Show-Up" },
  { key: "tasso_app_to_close", label: "App→Close" },
  { key: "importo_medio_chiusura", label: "Deal Size" },
  { key: "opp_vinte", label: "Opp Vinte" },
  { key: "nuovi_contatti", label: "Contatti" },
];

export function AgentRadarProfile({ selected, all }: Props) {
  if (!selected || all.length < 2) return null;

  const avg = (f: keyof VendorKPI) => all.reduce((s, k) => s + (Number(k[f]) || 0), 0) / all.length;
  const maxVal = (f: keyof VendorKPI) => Math.max(...all.map(k => Number(k[f]) || 0)) || 1;

  const data = DIMS.map(d => ({
    subject: d.label,
    Agente: Math.round(((Number(selected[d.key]) || 0) / maxVal(d.key)) * 100),
    "Media Team": Math.round((avg(d.key) / maxVal(d.key)) * 100),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Profilo vs Media Team</CardTitle>
        <CardDescription className="text-xs">Valori normalizzati 0–100 rispetto al top performer</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
            <Radar name="Agente" dataKey="Agente" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
            <Radar name="Media Team" dataKey="Media Team" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
