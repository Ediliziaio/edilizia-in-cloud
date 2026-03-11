import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { calculateDealHealth, buildDealHealthInput, type DealHealth } from "@/lib/dealHealthScore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DealHealthBadgeProps {
  opportunity: {
    updated_at?: string | null;
    next_action?: string | null;
    expected_close_date?: string | null;
    probability?: number | null;
    notes_count?: number | null;
    created_at?: string | null;
  };
  /** Show only the dot without text */
  compact?: boolean;
  className?: string;
}

export const DealHealthBadge = memo(function DealHealthBadge({
  opportunity,
  compact = false,
  className,
}: DealHealthBadgeProps) {
  const health = useMemo((): DealHealth => {
    const input = buildDealHealthInput(opportunity);
    return calculateDealHealth(input);
  }, [opportunity]);

  const dotColor =
    health.status === 'healthy' ? 'bg-emerald-500'
    : health.status === 'at_risk' ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-default",
            health.color,
            compact && "px-0 py-0",
            className
          )}
        >
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
          {!compact && <span>{health.score}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] space-y-1">
        <p className="font-semibold text-xs">
          {health.badge} — {health.score}/100
        </p>
        {health.reasons.length > 0 && (
          <ul className="text-[10px] space-y-0.5">
            {health.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
