import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, RefreshCw, Heart } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  mrr: number;
  arr: number;
  nrr: number;
  avgLtv: number;
}

export function AdminRevenueKPIs({ mrr, arr, nrr, avgLtv }: Props) {
  const kpis = [
    {
      title: "MRR",
      value: formatCurrency(mrr),
      description: "Monthly Recurring Revenue",
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
    {
      title: "ARR",
      value: formatCurrency(arr),
      description: "Annual Recurring Revenue",
      icon: Target,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "NRR",
      value: `${nrr}%`,
      description: "Net Revenue Retention (6m)",
      icon: RefreshCw,
      color: nrr >= 100 ? "text-emerald-600" : "text-amber-600",
      bgColor: nrr >= 100 ? "bg-emerald-100" : "bg-amber-100",
    },
    {
      title: "LTV Medio",
      value: formatCurrency(avgLtv),
      description: "Lifetime Value stimato",
      icon: Heart,
      color: "text-violet-600",
      bgColor: "bg-violet-100",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {kpi.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpi.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
