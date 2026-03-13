import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { TrendGiornaliero } from "@/hooks/useCallCenterReport";

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
  const [vista, setVista] = useState<Vista>("volumi");

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
      giorno: DAY_MAP[g] ?? g,
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
            {v === "volumi" ? "Volumi assoluti" : "Tassi (%)"}
          </Button>
        ))}
      </div>

      {/* Daily trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Andamento Giornaliero</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nessun dato disponibile</p>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="giorno_label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                {vista === "volumi" ? (
                  <>
                    <YAxis yAxisId="left" className="fill-muted-foreground" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} className="fill-muted-foreground" />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="nr_chiamate" name="Chiamate" fill="hsl(var(--primary))" opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="nr_contatti" name="Contatti" fill="hsl(142, 71%, 45%)" opacity={0.8} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="nr_appuntamenti" name="Appuntamenti" fill="hsl(38, 92%, 50%)" opacity={0.8} radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="tasso_contatto" name="Tasso Contatto %" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={false} />
                  </>
                ) : (
                  <>
                    <YAxis tickFormatter={v => `${v}%`} domain={[0, 100]} className="fill-muted-foreground" />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} formatter={(v: number) => [`${v}%`]} />
                    <Legend />
                    <Line type="monotone" dataKey="tasso_contatto" name="Tasso Contatto %" stroke="hsl(262, 83%, 58%)" strokeWidth={2} />
                    <Line type="monotone" dataKey="tasso_appuntamento" name="Tasso App. %" stroke="hsl(38, 92%, 50%)" strokeWidth={2} />
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
            <CardTitle className="text-base">Performance per Giorno della Settimana</CardTitle>
            <p className="text-sm text-muted-foreground">Media giornaliera — utile per pianificare i turni</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={perGiornoSettimana}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="giorno" className="fill-muted-foreground" />
                <YAxis yAxisId="left" className="fill-muted-foreground" />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} domain={[0, 100]} className="fill-muted-foreground" />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Legend />
                <Bar yAxisId="left" dataKey="avg_chiamate" name="Avg Chiamate" fill="hsl(var(--primary))" opacity={0.7} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="avg_contatti" name="Avg Contatti" fill="hsl(142, 71%, 45%)" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_contatto" name="Tasso Contatto %" stroke="hsl(262, 83%, 58%)" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dettaglio Giornaliero</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Giorno</TableHead>
                    <TableHead>Gg.</TableHead>
                    <TableHead className="text-right">Chiamate</TableHead>
                    <TableHead className="text-right">Contatti</TableHead>
                    <TableHead className="text-right">App.</TableHead>
                    <TableHead className="text-right">% Contatto</TableHead>
                    <TableHead className="text-right">% App.</TableHead>
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
