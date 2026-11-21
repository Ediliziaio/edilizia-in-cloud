import { useMemo } from "react";
import { format, isSameMonth, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { UnifiedRow } from "./UnifiedPreventiviList";

export default function GraficiPreventivi({ righe, distribuzione, ricavoFirmato }: {
  righe: ReadonlyArray<Pick<UnifiedRow, "data" | "stato_unif">>;
  distribuzione: { name: string; value: number; color: string }[];
  ricavoFirmato: number;
}) {
  const trend = useMemo(() => {
    const oggi = new Date();
    return Array.from({ length: 6 }, (_, indice) => {
      const data = startOfMonth(subMonths(oggi, 5 - indice));
      const creati = righe.filter(riga => isSameMonth(new Date(riga.data), data));
      const vinti = creati.filter(riga => riga.stato_unif === "vinto").length;
      return { mese: format(data, "MMM", { locale: it }), creati: creati.length, vinti };
    });
  }, [righe]);

  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
    <Card className="lg:col-span-2">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="inline-block h-4 w-1 rounded bg-orange-500" />
              Trend ultimi 6 mesi
            </h3>
            <p className="text-[11px] text-muted-foreground">Preventivi creati vs vinti</p>
          </div>
          <span className="text-[11px] text-muted-foreground">{formatCurrency(ricavoFirmato)} firmato</span>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mese" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="creati" name="Creati" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="vinti" name="Vinti" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="inline-block h-4 w-1 rounded bg-orange-500" />
            Distribuzione per tipo
          </h3>
          <p className="text-[11px] text-muted-foreground">{righe.length} preventivi totali</p>
        </div>
        <div className="h-48">
          {distribuzione.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distribuzione} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                  {distribuzione.map(dato => <Cell key={dato.name} fill={dato.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Nessun dato</div>}
        </div>
      </CardContent>
    </Card>
  </div>;
}
