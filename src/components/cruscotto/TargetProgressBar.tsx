import { memo } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { safeNumber } from "@/hooks/useCruscottoData";

interface Props {
  current: number;
  target: number;
  label: string;
}

export const TargetProgressBar = memo(function TargetProgressBar({ current, target, label }: Props) {
  const pct = target > 0 ? Math.min(100, (safeNumber(current) / target) * 100) : 0;
  const reached = current >= target;

  return (
    <div className="p-4 rounded-xl border bg-card space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold tabular-nums">
          {fmtCur(safeNumber(current))} / {fmtCur(target)}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn("h-3", reached && "[&>div]:bg-emerald-500")}
      />
      <div className="text-xs text-muted-foreground">
        {reached
          ? "🎉 Target raggiunto!"
          : `Mancano ${fmtCur(target - safeNumber(current))} — ${safeNumber(pct).toFixed(0)}% completato`}
      </div>
    </div>
  );
});
