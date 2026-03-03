import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3, Zap, Clock, ArrowRightLeft } from "lucide-react";
import type { KpiData } from "@/hooks/useMarketingDashboard";

interface Props {
  kpi: KpiData | undefined;
  isLoading: boolean;
}

const fmtCur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DashboardForecast({ kpi, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Forecast & Pipeline</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const pipeline = Number(kpi?.pipeline_active_value ?? 0);
  const forecast = Number(kpi?.forecast_30d ?? 0);
  const forecastMin = Number(kpi?.forecast_min ?? 0);
  const forecastMax = Number(kpi?.forecast_max ?? 0);
  const avgFirstContact = Number(kpi?.avg_time_to_first_contact ?? 0);
  const avgClose = Number(kpi?.avg_time_to_close ?? 0);
  const leadToAppt = Number(kpi?.lead_to_appointment_rate ?? 0);
  const apptToContract = Number(kpi?.appointment_to_contract_rate ?? 0);
  const leadToContract = Number(kpi?.lead_to_contract_rate ?? 0);

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-500" />
            <CardTitle className="text-base">Forecast & Pipeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Pipeline + Forecast */}
          <div className="grid grid-cols-2 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg border p-4 cursor-default">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Pipeline Attiva</span>
                  </div>
                  <div className="text-2xl font-black">{fmtCur(pipeline)}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent><p>Somma valore opportunità aperte</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg border p-4 cursor-default">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-violet-500" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Forecast 30gg</span>
                  </div>
                  <div className="text-2xl font-black">{fmtCur(forecast)}</div>
                  {forecast > 0 && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Range: {fmtCur(forecastMin)} – {fmtCur(forecastMax)}
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent><p>Tasso chiusura × Ticket medio × Opportunità avanzate (±20%)</p></TooltipContent>
            </Tooltip>
          </div>

          {/* Conversion Rates */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <ArrowRightLeft className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">{leadToAppt}%</div>
              <div className="text-[10px] text-muted-foreground">Lead → App.</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <ArrowRightLeft className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">{apptToContract}%</div>
              <div className="text-[10px] text-muted-foreground">App. → Contratto</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <ArrowRightLeft className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-bold">{leadToContract}%</div>
              <div className="text-[10px] text-muted-foreground">Lead → Contratto</div>
            </div>
          </div>

          {/* Timing KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Clock className="h-4 w-4 text-orange-500 shrink-0" />
              <div>
                <div className="text-sm font-bold">{avgFirstContact}h</div>
                <div className="text-[10px] text-muted-foreground">Tempo medio 1° contatto</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Clock className="h-4 w-4 text-green-500 shrink-0" />
              <div>
                <div className="text-sm font-bold">{avgClose}gg</div>
                <div className="text-[10px] text-muted-foreground">Tempo medio chiusura</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
