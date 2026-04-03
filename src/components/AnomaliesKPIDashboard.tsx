import { AlertCircle, CheckCircle, Clock, TrendingUp } from "lucide-react";

export interface AnomalyKPIData {
  pending_total: number;
  pending_count: number;
  urgent_total: number;
  urgent_count: number;
  in_review_total: number;
  in_review_count: number;
  resolved_today_total: number;
  resolved_today_count: number;
  resolution_rate_percent: number;
  trend_pending: number;
}

interface AnomaliesKPIDashboardProps {
  data: AnomalyKPIData;
  isLoading: boolean;
}

export function AnomaliesKPIDashboard({ data, isLoading }: AnomaliesKPIDashboardProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      title: "Totale Pendente",
      value: `€${data.pending_total.toLocaleString("it-IT")}`,
      count: data.pending_count,
      icon: <Clock className="w-6 h-6 text-blue-600" />,
      color: "bg-blue-50 border-blue-200",
      trend: data.trend_pending,
      tooltip: `${data.pending_count} anomalie in sospeso · ${data.resolution_rate_percent}% risolte`,
    },
    {
      title: "Errori Urgenti",
      value: `€${data.urgent_total.toLocaleString("it-IT")}`,
      count: data.urgent_count,
      icon: <AlertCircle className="w-6 h-6 text-red-600" />,
      color: "bg-red-50 border-red-200",
      trend: 0,
      tooltip: `${data.urgent_count} anomalie urgenti · Richiedono attenzione immediata`,
    },
    {
      title: "In Revisione",
      value: `€${data.in_review_total.toLocaleString("it-IT")}`,
      count: data.in_review_count,
      icon: <TrendingUp className="w-6 h-6 text-yellow-600" />,
      color: "bg-yellow-50 border-yellow-200",
      trend: 0,
      tooltip: `${data.in_review_count} anomalie sotto revisione`,
    },
    {
      title: "Risolti Oggi",
      value: `€${data.resolved_today_total.toLocaleString("it-IT")}`,
      count: data.resolved_today_count,
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      color: "bg-green-50 border-green-200",
      trend: 0,
      tooltip: `${data.resolved_today_count} anomalie risolte nelle ultime 24h`,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {kpis.map((kpi) => (
        <div
          key={kpi.title}
          className={`p-6 rounded-lg border-2 ${kpi.color} group relative cursor-help transition-shadow hover:shadow-md`}
          title={kpi.tooltip}
        >
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{kpi.title}</h3>
            {kpi.icon}
          </div>
          <div className="mb-2">
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-600 mt-1">{kpi.count} anomalie</p>
          </div>
          {kpi.trend !== 0 && (
            <div
              className={`text-xs font-semibold ${
                kpi.trend > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {kpi.trend > 0 ? "↑" : "↓"} {Math.abs(kpi.trend)} rispetto a ieri
            </div>
          )}
          {/* Tooltip hover */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity pointer-events-none z-10">
            {kpi.tooltip}
          </div>
        </div>
      ))}
    </div>
  );
}
