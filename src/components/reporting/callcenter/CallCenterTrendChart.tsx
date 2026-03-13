import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TrendGiornaliero } from "@/hooks/useCallCenterReport";

interface Props {
  data: TrendGiornaliero[];
  isLoading: boolean;
}

export function CallCenterTrendChart({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-72 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend Giornaliero Chiamate</CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nessun dato disponibile</p>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="giorno_label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis yAxisId="left" className="fill-muted-foreground" />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} className="fill-muted-foreground" />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="nr_chiamate" name="Chiamate" fill="hsl(var(--primary))" opacity={0.7} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="nr_contatti" name="Contatti" fill="hsl(142, 71%, 45%)" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="left" dataKey="nr_appuntamenti" name="Appuntamenti" fill="hsl(38, 92%, 50%)" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_contatto" name="Tasso Contatto %" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
