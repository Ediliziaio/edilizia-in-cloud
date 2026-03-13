import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import type { VendorKPI } from "@/hooks/useVendorReport";
import type { LucideIcon } from "lucide-react";

interface Props { kpi: VendorKPI | null; isLoading: boolean; }

export function AppuntamentiScorecard({ kpi, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const showUp = kpi?.tasso_show_up ?? 0;
  const showUpColor = showUp >= 70 ? "text-green-600 dark:text-green-400" : showUp >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  const rows: { label: string; value: string | number; icon: LucideIcon; color: string }[] = [
    { label: "Appuntamenti Fissati", value: kpi?.appuntamenti_fissati ?? 0, icon: Calendar, color: "text-blue-600" },
    { label: "Effettuati (Show-up)", value: kpi?.appuntamenti_effettuati ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "No-Show", value: kpi?.appuntamenti_no_show ?? 0, icon: XCircle, color: "text-red-500" },
    { label: "App → Opportunità", value: `${kpi?.tasso_app_to_opp ?? 0}%`, icon: ArrowRight, color: "text-indigo-600" },
    { label: "App → Chiusura", value: `${kpi?.tasso_app_to_close ?? 0}%`, icon: ArrowRight, color: "text-green-700" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Appuntamenti
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show-up rate prominente */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Show-Up Rate</span>
            <span className={`text-2xl font-bold ${showUpColor}`}>{showUp}%</span>
          </div>
          <Progress value={showUp} className="h-2" />
        </div>

        <div className="space-y-2 pt-2 border-t">
          {rows.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {label}
              </span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
