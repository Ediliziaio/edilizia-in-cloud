import { memo, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLeadTemperature, type LeadTemperatureResult } from "@/lib/leadTemperature";
import { cn } from "@/lib/utils";

interface LeadTemperatureBadgeProps {
  lastActivityAt: string | null;
  lastContactedAt?: string | null;
  hasOpenOpportunity?: boolean;
  recentAppointment?: boolean;
  /** Show only emoji without text */
  compact?: boolean;
  className?: string;
}

export const LeadTemperatureBadge = memo(function LeadTemperatureBadge({
  lastActivityAt,
  lastContactedAt,
  hasOpenOpportunity = false,
  recentAppointment = false,
  compact = false,
  className,
}: LeadTemperatureBadgeProps) {
  const temp = useMemo((): LeadTemperatureResult => {
    const activityDate = lastActivityAt ? new Date(lastActivityAt) : null;
    const contactedDate = lastContactedAt ? new Date(lastContactedAt) : null;
    return getLeadTemperature(activityDate, contactedDate, hasOpenOpportunity, recentAppointment);
  }, [lastActivityAt, lastContactedAt, hasOpenOpportunity, recentAppointment]);

  const emoji =
    temp.temperature === 'hot' ? '🔥'
    : temp.temperature === 'warm' ? '🌤'
    : temp.temperature === 'cold' ? '❄️'
    : '🧊';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium cursor-default",
            temp.colorClass,
            compact && "px-0 py-0 bg-transparent",
            className
          )}
        >
          <span>{emoji}</span>
          {!compact && <span>{temp.label.replace(/\s*[🔥❄️]/, '')}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-semibold">{temp.label}</p>
        <p className="text-muted-foreground">{temp.reason}</p>
      </TooltipContent>
    </Tooltip>
  );
});
