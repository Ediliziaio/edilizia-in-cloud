import { useId, useMemo, useState } from "react";
import { StatGrafico, TESTO_ASSE, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { TrendGiornaliero } from "@/hooks/useCallCenterReport";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Vista = "volumi" | "tassi";

const DAY_MAP: Record<string, string> = {
  Mon: "Lun", Tue: "Mar", Wed: "Mer", Thu: "Gio", Fri: "Ven", Sat: "Sab", Sun: "Dom",
};
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  data: TrendGiornaliero[];
  isLoading: boolean;
}

export function CallCenterTrendChart({ data, isLoading }: Props) {
  const t = useT();
  const [vista, setVista] = useState<Vista>("volumi");
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  // Riga sopra il grafico: giorno con più chiamate, media sui giorni lavorati, tasso di contatto.
  const statGiorni = useMemo(() => {
    const attivi = data.filter((d) => d.nr_chiamate > 0);
    if (attivi.length === 0) return null;
    const chiamate = attivi.reduce((s, d) => s + d.nr_chiamate, 0);
    const contatti = attivi.reduce((s, d) => s + d.nr_contatti, 0);
    return {
      migliore: attivi.reduce((a, b) => (b.nr_chiamate > a.nr_chiamate ? b : a)),
      media: Math.round((chiamate / attivi.length) * 10) / 10,
      tasso: chiamate > 0 ? Math.round((contatti / chiamate) * 1000) / 10 : 0,
      attivi: attivi.length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-72 w-full" /></CardContent>
      </Card>
    );
  }

  // Day-of-week aggregation
  const perGiornoSettimana = DAY_ORDER.map(g => {
    const rows = data.filter(d => d.giorno_settimana === g);
    const len = rows.length || 1;
    return {
      giorno: t(DAY_MAP[g] ?? g),
      avg_chiamate: Math.round(rows.reduce((a, r) => a + r.nr_chiamate, 0) / len),
      avg_contatti: Math.round(rows.reduce((a, r) => a + r.nr_contatti, 0) / len),
      avg_appuntamenti: Math.round(rows.reduce((a, r) => a + r.nr_appuntamenti, 0) / len * 10) / 10,
      tasso_contatto: rows.length ? Math.round(rows.reduce((a, r) => a + r.tasso_contatto, 0) / len * 10) / 10 : 0,
    };
  });

  return (
    <div className="space-y-4">
      {/* Vista toggle */}
      <div className="flex gap-1">
        {(["volumi", "tassi"] as Vista[]).map(v => (
          <Button
            key={v}
            variant={vista === v ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => setVista(v)}
          >
            {v === "volumi" ? t("Volumi assoluti") : t("Tassi (%)")}
          </Button>
        ))}
      </div>

      {/* Daily trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Andamento Giornaliero")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length > 0 && statGiorni && (
            <div className="mb-3 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2">
              <StatGrafico etichetta={t("Giorno con più chiamate")} valore={String(statGiorni.migliore.nr_chiamate)} nota={`${statGiorni.migliore.giorno_settimana} ${statGiorni.migliore.giorno_label}`} />
              <StatGrafico etichetta={t("Chiamate al giorno")} valore={statGiorni.media.toLocaleString(intlCampo())} nota={t("media su {attivi} giorni con chiamate", { attivi: statGiorni.attivi })} />
              <StatGrafico etichetta={t("Tasso di contatto")} valore={`${statGiorni.tasso.toLocaleString(intlCampo())}%`} nota={t("contatti sulle chiamate")} tono={statGiorni.tasso >= 40 ? "buono" : "cattivo"} />
            </div>
          )}
          {data.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">{t("Nessun dato disponibile")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={data}>
                {defsGrafico(id, { chiamate: "hsl(var(--primary))", contatti: "hsl(142, 71%, 45%)", appuntamenti: "hsl(38, 92%, 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="giorno_label" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                {vista === "volumi" ? (
                  <>
                    <YAxis yAxisId="left" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                    <Bar yAxisId="left" dataKey="nr_chiamate" name={t("Chiamate")} fill={`url(#${id}-barra-chiamate)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} />
                    <Bar yAxisId="left" dataKey="nr_contatti" name={t("Contatti")} fill={`url(#${id}-barra-contatti)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} animationBegin={100} />
                    <Bar yAxisId="left" dataKey="nr_appuntamenti" name={t("Appuntamenti")} fill={`url(#${id}-barra-appuntamenti)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} animationBegin={200} />
                    <Line yAxisId="right" type="monotone" dataKey="tasso_contatto" name={t("Tasso Contatto %")} stroke="hsl(262, 83%, 58%)" strokeWidth={2.5} dot={false} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
                  </>
                ) : (
                  <>
                    <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} formatter={(v: number) => [`${v}%`]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                    <Line type="monotone" dataKey="tasso_contatto" name={t("Tasso Contatto %")} stroke="hsl(262, 83%, 58%)" strokeWidth={2.5} dot={false} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
                    <Line type="monotone" dataKey="tasso_appuntamento" name={t("Tasso App. %")} stroke="hsl(38, 92%, 50%)" strokeWidth={2.5} dot={false} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} animationBegin={150} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Day-of-week aggregation chart */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Performance per Giorno della Settimana")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("Media giornaliera — utile per pianificare i turni")}</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={perGiornoSettimana}>
                {defsGrafico(id, { chiamate: "hsl(var(--primary))", contatti: "hsl(142, 71%, 45%)", appuntamenti: "hsl(38, 92%, 50%)" })}
                <CartesianGrid fill={`url(#${id}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="giorno" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} domain={[0, 100]} tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                <Bar yAxisId="left" dataKey="avg_chiamate" name={t("Avg Chiamate")} fill={`url(#${id}-barra-chiamate)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} />
                <Bar yAxisId="left" dataKey="avg_contatti" name={t("Avg Contatti")} fill={`url(#${id}-barra-contatti)`} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!fermo} animationDuration={700} animationBegin={100} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_contatto" name={t("Tasso Contatto %")} stroke="hsl(262, 83%, 58%)" strokeWidth={2.5} dot={false} filter={`url(#${id}-ombra)`} isAnimationActive={!fermo} animationDuration={900} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Dettaglio Giornaliero")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Giorno")}</TableHead>
                    <TableHead>{t("Gg.")}</TableHead>
                    <TableHead className="text-right">{t("Chiamate")}</TableHead>
                    <TableHead className="text-right">{t("Contatti")}</TableHead>
                    <TableHead className="text-right">{t("App.")}</TableHead>
                    <TableHead className="text-right">{t("% Contatto")}</TableHead>
                    <TableHead className="text-right">{t("% App.")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.filter(d => d.nr_chiamate > 0).map(d => (
                    <TableRow key={d.giorno}>
                      <TableCell className="font-medium">{d.giorno_label}</TableCell>
                      <TableCell className="text-muted-foreground">{d.giorno_settimana}</TableCell>
                      <TableCell className="text-right">{d.nr_chiamate}</TableCell>
                      <TableCell className="text-right">{d.nr_contatti}</TableCell>
                      <TableCell className="text-right">{d.nr_appuntamenti}</TableCell>
                      <TableCell className={`text-right font-medium ${
                        (d.tasso_contatto ?? 0) >= 60 ? "text-green-600" : (d.tasso_contatto ?? 0) >= 40 ? "text-amber-600" : "text-red-500"
                      }`}>
                        {d.tasso_contatto ?? 0}%
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        (d.tasso_appuntamento ?? 0) >= 20 ? "text-green-600" : (d.tasso_appuntamento ?? 0) >= 10 ? "text-amber-600" : "text-red-500"
                      }`}>
                        {d.tasso_appuntamento ?? 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
