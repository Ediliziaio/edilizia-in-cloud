import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Snowflake, Users, ClipboardList, UserPlus, Clock } from "lucide-react";
import type { TrialActivation } from "@/hooks/useAdminRevenueData";

interface Props {
  data: TrialActivation;
}

export function AdminTrialIntelligence({ data }: Props) {
  const pctOrders = data.total > 0 ? Math.round((data.withOrders / data.total) * 100) : 0;
  const pctCustomers = data.total > 0 ? Math.round((data.withCustomers / data.total) * 100) : 0;
  const pctStaff = data.total > 0 ? Math.round((data.withStaff / data.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Trial Intelligence</CardTitle>
          <Badge variant="outline" className="text-xs">
            {data.total} in trial
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Conversion rate */}
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <span className="text-sm font-medium">Conversion Rate</span>
          <span
            className={`text-xl font-bold ${
              data.conversionRate >= 50
                ? "text-emerald-600"
                : data.conversionRate >= 25
                ? "text-amber-600"
                : "text-red-600"
            }`}
          >
            {data.conversionRate}%
          </span>
        </div>

        {/* Time to first order */}
        {data.avgDaysToFirstOrder !== null && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Tempo medio attivazione:</span>
            <span className="font-medium">{data.avgDaysToFirstOrder} giorni</span>
          </div>
        )}

        {/* Trial scoring */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
            <Zap className="h-4 w-4 text-orange-600" />
            <div>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{data.hot}</p>
              <p className="text-xs text-muted-foreground">Trial caldi</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-sky-50 dark:bg-sky-950/20">
            <Snowflake className="h-4 w-4 text-sky-600" />
            <div>
              <p className="text-lg font-bold text-sky-700 dark:text-sky-400">{data.cold}</p>
              <p className="text-xs text-muted-foreground">Trial freddi</p>
            </div>
          </div>
        </div>

        {/* Activation milestones */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Milestone Attivazione
          </p>
          <div className="space-y-2">
            <MilestoneBar
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Primo ordine"
              value={data.withOrders}
              total={data.total}
              pct={pctOrders}
            />
            <MilestoneBar
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Clienti aggiunti"
              value={data.withCustomers}
              total={data.total}
              pct={pctCustomers}
            />
            <MilestoneBar
              icon={<Users className="h-3.5 w-3.5" />}
              label="Staff invitato"
              value={data.withStaff}
              total={data.total}
              pct={pctStaff}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MilestoneBar({
  icon,
  label,
  value,
  total,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-xs font-medium">
          {value}/{total} ({pct}%)
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}
