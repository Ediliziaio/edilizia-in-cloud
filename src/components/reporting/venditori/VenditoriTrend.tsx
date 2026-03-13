import { useState } from "react";
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
  const [metrica, setMetrica] = useState<MetricaVisibile>("fatturato");
  const meseCorrente = new Date().getMonth() + 1;

  if (!trend.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">Nessun dato trend disponibile per l'anno corrente.</p>
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
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {agentId === "tutti" ? "Trend Team" : "Trend Agente"} — Anno {new Date().getFullYear()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            {metrica === "fatturato" ? (
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mese_label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tickFormatter={(v) => formatCurrencyCompact(v)} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="fatturato" name="Fatturato" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_chiusura" name="Chiusura %" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="tasso_show_up" name="Show-Up %" stroke="hsl(45 93% 47%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            ) : metrica === "tassi" ? (
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mese_label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="tasso_chiusura" name="Chiusura %" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="tasso_show_up" name="Show-Up %" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            ) : metrica === "volumi" ? (
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mese_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="opp_vinte" name="Opp. Vinte" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="opp_perse" name="Opp. Perse" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="appuntamenti_effettuati" name="App. Effettuati" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            ) : (
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mese_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="nuovi_contatti" name="Nuovi Contatti" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="appuntamenti_fissati" name="App. Fissati" fill="hsl(210 100% 50%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="appuntamenti_effettuati" name="App. Effettuati" stroke="hsl(142 76% 36%)" strokeWidth={2} dot={{ r: 3 }} />
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
                <TableHead>Mese</TableHead>
                <TableHead className="text-right">Fatturato</TableHead>
                <TableHead className="text-right">Chiusura%</TableHead>
                <TableHead className="text-right">Show-Up%</TableHead>
                <TableHead className="text-right">Vinte</TableHead>
                <TableHead className="text-right">Perse</TableHead>
                <TableHead className="text-right">App.</TableHead>
                <TableHead className="text-right">Contatti</TableHead>
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
                        <span className="ml-1.5 text-xs text-primary">← ora</span>
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
