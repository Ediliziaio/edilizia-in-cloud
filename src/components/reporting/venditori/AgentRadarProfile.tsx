import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend } from "recharts";
import type { VendorKPI } from "@/hooks/useVendorReport";
import { aggregateTeamKPI } from "@/lib/reporting/venditoriRegole";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  if (!selected || all.length < 2) return null;

  // Riferimento del team: i tassi e il deal medio del team intero (dai
  // conteggi, come la Panoramica), i conteggi per venditore medio.
  const team = aggregateTeamKPI(all);
  const PER_VENDITORE: (keyof VendorKPI)[] = ["opp_vinte", "nuovi_contatti"];
  const avg = (f: keyof VendorKPI) => {
    const v = Number(team?.[f]) || 0;
    return PER_VENDITORE.includes(f) ? v / all.length : v;
  };
  const maxVal = (f: keyof VendorKPI) => Math.max(...all.map(k => Number(k[f]) || 0)) || 1;

  const data = DIMS.map(d => ({
    subject: t(d.label),
    Agente: Math.round(((Number(selected[d.key]) || 0) / maxVal(d.key)) * 100),
    "Media Team": Math.round((avg(d.key) / maxVal(d.key)) * 100),
  }));

  // Telefono: il radar resta al computer.
  return (
    <Card className="max-sm:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("Profilo vs Media Team")}</CardTitle>
        <CardDescription className="text-xs">{t("Valori normalizzati 0–100 rispetto al migliore; i tassi non calcolabili valgono 0")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid strokeDasharray="4 6" stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Radar name={t("Agente")} dataKey="Agente" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="hsl(var(--primary))" fillOpacity={0.25} dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }} />
            <Radar name={t("Media Team")} dataKey="Media Team" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" fill="hsl(var(--muted-foreground))" fillOpacity={0.08} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
