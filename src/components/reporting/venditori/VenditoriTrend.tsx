import { useId, useMemo, useState } from "react";
import { PillolaVariazione, StatGrafico, TESTO_ASSE, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import type { VendorTrend } from "@/hooks/useVendorReport";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type MetricaVisibile = "fatturato" | "tassi" | "volumi" | "contatti";

const METRICHE: { value: MetricaVisibile; label: string }[] = [
  { value: "fatturato", label: "Fatturato" },
  { value: "tassi", label: "Tassi (%)" },
  { value: "volumi", label: "Volumi (nr.)" },
  { value: "contatti", label: "Contatti & App" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium">
            {typeof p.value === "number" && p.dataKey === "fatturato"
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export function VenditoriTrend({ trend, agentId }: { trend: VendorTrend[]; agentId: string }) {
  const tr = useT();
  const [metrica, setMetrica] = useState<MetricaVisibile>("fatturato");
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  // Riga sopra il grafico: mese migliore, media mensile, ultimo mese contro la media (fatturato).
  const statMesi = useMemo(() => {
    const conFatt = trend.filter((t) => (Number(t.fatturato) || 0) > 0);
    if (conFatt.length === 0) return null;
    const migliore = conFatt.reduce((a, b) => ((Number(b.fatturato) || 0) > (Number(a.fatturato) || 0) ? b : a));
    const media = conFatt.reduce((s, t) => s + (Number(t.fatturato) || 0), 0) / conFatt.length;
    // Il mese scorso, l'ultimo finito: dicembre a novembre non è ancora
    // arrivato e quello in corso è a metà (darebbero sempre il segno meno).
    const meseScorso = new Date().getMonth(); // 1–12 del mese prima; 0 a gennaio
    const ultimo = trend.find((t) => Number(t.mese) === meseScorso) ?? trend[0];
    return { migliore, media, ultimo };
  }, [trend]);
  const meseCorrente = new Date().getMonth() + 1;

  if (!trend.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">{tr("Nessun dato trend disponibile per l'anno corrente.")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric toggle */}
      <div className="flex flex-wrap gap-2">
        {METRICHE.map((m) => (
          <button
            key={m.value}
            onClick={() => setMetrica(m.value)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
              metrica === m.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tr(m.label)}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {tr(agentId === "tutti" ? "Trend Team — Anno {anno}" : "Trend Agente — Anno {anno}", { anno: new Date().getFullYear() })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statMesi && (
            <div className="mb-3 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
              <StatGrafico etichetta={tr("Mese migliore")} valore={formatCurrencyCompact(Number(statMesi.migliore.fatturato) || 0)} nota={statMesi.migliore.mese_label} />
              <StatGrafico etichetta={tr("Media al mese")} valore={formatCurrencyCompact(statMesi.media)} nota={tr("mesi con fatturato")} />
              <StatGrafico
                etichetta={tr("Mese scorso")}
                valore={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {formatCurrencyCompact(Number(statMesi.ultimo.fatturato) || 0)}
                    <PillolaVariazione pct={statMesi.media > 0 ? (((Number(statMesi.ultimo.fatturato) || 0) - statMesi.media) / statMesi.media) * 100 : null} titolo={tr("Rispetto alla media dei mesi con fatturato")} />
                  </span>
                }
                nota={tr("{mese_label}, contro la media", { mese_label: String(statMesi.ultimo.mese_label ?? "") })}
              />
            </div>
          )}
          <ResponsiveContainer width="100%" height={300}>
            {metrica === "fatturato" ? (
              <ComposedChart data={trend}>
                {defsGrafico(id, { primario: "hsl(var(--primary))", verde: "hsl(142 76% 36%)", rosso: "hsl(0 84% 60%)", blu: "hsl(210 100% 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="mese_label" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tickFormatter={(v) => formatCurrencyCompact(v)} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                <Bar yAxisId="left" dataKey="fatturato" name={tr("Fatturato")} fill={`url(#${id}-barra-primario)`} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!fermo} animationDuration={700} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_chiusura" name={tr("Chiusura %")} stroke="hsl(142 76% 36%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_show_up" name={tr("Show-Up %")} stroke="hsl(45 93% 47%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
              </ComposedChart>
            ) : metrica === "tassi" ? (
              <ComposedChart data={trend}>
                {defsGrafico(id, { primario: "hsl(var(--primary))", verde: "hsl(142 76% 36%)", rosso: "hsl(0 84% 60%)", blu: "hsl(210 100% 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="mese_label" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                <Line type="monotone" dataKey="tasso_chiusura" name={tr("Chiusura %")} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
                <Line type="monotone" dataKey="tasso_show_up" name={tr("Show-Up %")} stroke="hsl(142 76% 36%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
              </ComposedChart>
            ) : metrica === "volumi" ? (
              <ComposedChart data={trend}>
                {defsGrafico(id, { primario: "hsl(var(--primary))", verde: "hsl(142 76% 36%)", rosso: "hsl(0 84% 60%)", blu: "hsl(210 100% 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="mese_label" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                <Bar dataKey="opp_vinte" name={tr("Opp. Vinte")} fill={`url(#${id}-barra-verde)`} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!fermo} animationDuration={700} />
                <Bar dataKey="opp_perse" name={tr("Opp. Perse")} fill={`url(#${id}-barra-rosso)`} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!fermo} animationDuration={700} />
                <Line type="monotone" dataKey="appuntamenti_effettuati" name={tr("App. Effettuati")} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
              </ComposedChart>
            ) : (
              <ComposedChart data={trend}>
                {defsGrafico(id, { primario: "hsl(var(--primary))", verde: "hsl(142 76% 36%)", rosso: "hsl(0 84% 60%)", blu: "hsl(210 100% 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="mese_label" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                <Bar dataKey="nuovi_contatti" name={tr("Nuovi Contatti")} fill={`url(#${id}-barra-primario)`} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!fermo} animationDuration={700} />
                <Bar dataKey="appuntamenti_fissati" name={tr("App. Fissati")} fill={`url(#${id}-barra-blu)`} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={!fermo} animationDuration={700} />
                <Line type="monotone" dataKey="appuntamenti_effettuati" name={tr("App. Effettuati")} stroke="hsl(142 76% 36%)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly summary table */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("Mese")}</TableHead>
                <TableHead className="text-right">{tr("Fatturato")}</TableHead>
                <TableHead className="text-right">{tr("Chiusura%")}</TableHead>
                <TableHead className="text-right">{tr("Show-Up%")}</TableHead>
                <TableHead className="text-right">{tr("Vinte")}</TableHead>
                <TableHead className="text-right">{tr("Perse")}</TableHead>
                <TableHead className="text-right">{tr("App.")}</TableHead>
                <TableHead className="text-right">{tr("Contatti")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trend.map((t) => {
                const isCurrent = t.mese === meseCorrente;
                return (
                  <TableRow key={t.mese} className={isCurrent ? "bg-primary/5 font-medium" : ""}>
                    <TableCell>
                      {t.mese_label}
                      {isCurrent && (
                        <span className="ml-1.5 text-xs text-primary">{tr("← ora")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(t.fatturato)}</TableCell>
                    <TableCell className={`text-right ${
                      (t.tasso_chiusura ?? 0) >= 35 ? "text-green-600" : (t.tasso_chiusura ?? 0) >= 20 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {t.tasso_chiusura ?? 0}%
                    </TableCell>
                    <TableCell className={`text-right ${
                      (t.tasso_show_up ?? 0) >= 70 ? "text-green-600" : (t.tasso_show_up ?? 0) >= 50 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {t.tasso_show_up ?? 0}%
                    </TableCell>
                    <TableCell className="text-right">{t.opp_vinte}</TableCell>
                    <TableCell className="text-right">{t.opp_perse}</TableCell>
                    <TableCell className="text-right">{t.appuntamenti_fissati}</TableCell>
                    <TableCell className="text-right">{t.nuovi_contatti}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
