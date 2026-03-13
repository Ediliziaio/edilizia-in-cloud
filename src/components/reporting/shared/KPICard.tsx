import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

export type ColorKey = "green" | "yellow" | "red" | "blue";

export const colorStyles: Record<ColorKey, { bg: string; icon: string; val: string }> = {
  green: { bg: "bg-green-50 dark:bg-green-950/30", icon: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400", val: "text-green-700 dark:text-green-400" },
  yellow: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400", val: "text-amber-700 dark:text-amber-400" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", icon: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400", val: "text-red-700 dark:text-red-400" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400", val: "text-blue-700 dark:text-blue-400" },
};

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  colorKey: ColorKey;
  benchmark?: string;
  isLoading?: boolean;
}

export function KPICard({ title, value, subtitle, icon: Icon, colorKey, benchmark, isLoading }: KPICardProps) {
  const s = colorStyles[colorKey];
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className={s.bg}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-lg ${s.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-bold ${s.val}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {benchmark && (
          <p className="text-[11px] text-muted-foreground/70 mt-2 italic">Benchmark: {benchmark}</p>
        )}
      </CardContent>
    </Card>
  );
}
