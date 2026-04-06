import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: number; // percentuale, positivo = crescita, negativo = calo
  isLoading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  isLoading = false,
  className,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  const trendIsPositive = trend !== undefined && trend > 0;
  const trendIsNegative = trend !== undefined && trend < 0;
  const trendIsFlat = trend !== undefined && trend === 0;

  return (
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              {title}
            </p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <div className="rounded-lg bg-primary/10 p-2 ml-3 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
        {trend !== undefined && (
          <div className="mt-3 flex items-center gap-1 text-xs">
            {trendIsPositive && (
              <>
                <TrendingUp className="h-3 w-3 text-[#16A34A]" />
                <span className="text-[#16A34A] font-medium">
                  +{trend.toFixed(1)}%
                </span>
              </>
            )}
            {trendIsNegative && (
              <>
                <TrendingDown className="h-3 w-3 text-[#DC2626]" />
                <span className="text-[#DC2626] font-medium">
                  {trend.toFixed(1)}%
                </span>
              </>
            )}
            {trendIsFlat && (
              <>
                <Minus className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Stabile</span>
              </>
            )}
            <span className="text-muted-foreground ml-1">vs mese scorso</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
