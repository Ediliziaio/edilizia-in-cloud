import { memo } from "react";
import { DashboardTrendChart } from "@/components/marketing/dashboard/DashboardTrendChart";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabTrend = memo(function TabTrend({ data, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <DashboardTrendChart trend={data?.trend} isLoading={isLoading} />
    </div>
  );
});
