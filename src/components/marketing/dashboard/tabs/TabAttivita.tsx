import { memo } from "react";
import { Card } from "@/components/ui/card";
import { DashboardKPICards } from "@/components/marketing/dashboard/DashboardKPICards";
import { DashboardCallCenter } from "@/components/marketing/dashboard/DashboardCallCenter";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { Phone, CalendarCheck, Users, PhoneCall } from "lucide-react";
import { formatValue } from "@/components/marketing/dashboard/utils";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabAttivita = memo(function TabAttivita({ data, isLoading }: Props) {
  const kpi = data?.kpi;

  const activityCards = [
    { label: "Chiamate Totali", value: kpi?.calls_total ?? 0, icon: Phone, format: "number" as const },
    { label: "Chiamate Risposte", value: kpi?.calls_answered ?? 0, icon: PhoneCall, format: "number" as const },
    { label: "Tasso Contatto", value: kpi?.contact_rate ?? 0, icon: Phone, format: "percent" as const },
    { label: "Contatti Lavorati", value: kpi?.contacts_worked ?? 0, icon: Users, format: "number" as const },
    { label: "App. Fissati", value: kpi?.appointments_set ?? 0, icon: CalendarCheck, format: "number" as const },
    { label: "App. Svolti", value: kpi?.appointments_done ?? 0, icon: CalendarCheck, format: "number" as const },
  ];

  return (
    <div className="space-y-6">
      {/* Activity KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {activityCards.map(c => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium truncate">{c.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              </div>
              <div className="text-2xl font-bold tracking-tight">{formatValue(Number(c.value), c.format)}</div>
            </Card>
          );
        })}
      </div>

      {/* Call Center */}
      <DashboardCallCenter callCenter={data?.call_center} isLoading={isLoading} />
    </div>
  );
});
