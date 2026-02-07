import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarOrder } from "@/types/calendar";

interface LeadTimeStatsProps {
  orders: CalendarOrder[];
}

export function LeadTimeStats({ orders }: LeadTimeStatsProps) {
  const stats = useMemo(() => {
    const leadTimes = orders
      .filter(order => order.work_end_date && order.created_at)
      .map(order => {
        const contractDate = new Date(order.created_at);
        const endDate = parseISO(order.work_end_date!);
        return differenceInDays(endDate, contractDate);
      })
      .filter(days => days >= 0);

    if (leadTimes.length === 0) return null;

    const sum = leadTimes.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / leadTimes.length),
      min: Math.min(...leadTimes),
      max: Math.max(...leadTimes),
      count: leadTimes.length,
    };
  }, [orders]);

  if (!stats) return null;

  return (
    <div className="mt-4 p-3 bg-muted/50 rounded-lg flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Lead Time Medio:</span>
        <span className="font-semibold">{stats.avg}g</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Min:</span>
        <span className="font-medium text-primary">
          {stats.min}g
        </span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Max:</span>
        <span className="font-medium text-destructive">
          {stats.max}g
        </span>
      </div>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Ordini con dati:</span>
        <span className="font-medium">{stats.count}</span>
      </div>
    </div>
  );
}

export function getLeadTimeColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 30) return "text-green-600";
  if (days <= 60) return "text-yellow-600";
  return "text-red-600";
}

export function calculateLeadTime(order: CalendarOrder): number | null {
  if (!order.work_end_date) return null;
  const contractDate = new Date(order.created_at);
  const endDate = parseISO(order.work_end_date);
  const days = differenceInDays(endDate, contractDate);
  return days >= 0 ? days : null;
}
