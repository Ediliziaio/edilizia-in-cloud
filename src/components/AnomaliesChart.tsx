import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCurrencyCompact } from "@/lib/formatters";

export interface AnomalyChartDataPoint {
  date: string;
  mezzo: number;
  manodopera: number;
}

interface AnomaliesChartProps {
  data: AnomalyChartDataPoint[];
  isLoading: boolean;
}

export function AnomaliesChart({ data, isLoading }: AnomaliesChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-80 flex items-center justify-center mb-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
      <h3 className="text-base font-semibold text-gray-900 mb-6">
        Andamento anomalie (ultimi 6 mesi)
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            tick={{ fill: "#6b7280" }}
          />
          <YAxis
            tickFormatter={formatCurrencyCompact}
            label={{
              value: "Importo (€)",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: "11px", fill: "#6b7280" },
            }}
            stroke="#6b7280"
            style={{ fontSize: "12px" }}
            tick={{ fill: "#6b7280" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f3f4f6",
            }}
            formatter={(value: number) => [`€${value.toLocaleString("it-IT")}`, undefined]}
            labelStyle={{ color: "#f3f4f6" }}
          />
          <Legend
            wrapperStyle={{ paddingTop: "20px" }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="mezzo"
            stroke="#378ADD"
            strokeWidth={2}
            name="Mezzo"
            dot={{ fill: "#378ADD", r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="manodopera"
            stroke="#639922"
            strokeWidth={2}
            name="Manodopera"
            dot={{ fill: "#639922", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
