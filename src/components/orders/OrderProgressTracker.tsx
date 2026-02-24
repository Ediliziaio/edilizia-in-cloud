import React, { useMemo } from "react";
import { Check, icons } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailableIcon } from "@/lib/orderStatusTemplates";
import type { OrderStatus } from "@/lib/orderUtils";

export type { OrderStatus };

export interface StatusHistoryItem {
  status_id: string;
  changed_at: string;
}

export interface StatusHistoryItem {
  status_id: string;
  changed_at: string;
}

interface OrderProgressTrackerProps {
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: StatusHistoryItem[];
  onStatusChange?: (statusId: string) => void;
  interactive?: boolean;
  size?: "sm" | "md" | "lg";
}

export function OrderProgressTracker({
  statuses,
  currentStatusId,
  statusHistory = [],
  onStatusChange,
  interactive = false,
  size = "md",
}: OrderProgressTrackerProps) {
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position),
    [statuses]
  );

  const currentIndex = sortedStatuses.findIndex((s) => s.id === currentStatusId);

  const getStatusDate = (statusId: string): string | null => {
    const historyItem = statusHistory.find((h) => h.status_id === statusId);
    if (!historyItem) return null;
    return new Date(historyItem.changed_at).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
    });
  };

  const sizeClasses = {
    sm: {
      circle: "w-8 h-8",
      icon: "h-4 w-4",
      text: "text-xs",
      gap: "gap-1",
    },
    md: {
      circle: "w-10 h-10",
      icon: "h-5 w-5",
      text: "text-sm",
      gap: "gap-2",
    },
    lg: {
      circle: "w-12 h-12",
      icon: "h-6 w-6",
      text: "text-base",
      gap: "gap-3",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className="w-full">
      {/* Desktop horizontal layout */}
      <div className="hidden md:flex items-start justify-between">
        {sortedStatuses.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const statusDate = getStatusDate(status.id);

          // Get the icon component
          const IconComponent = icons[status.icon as keyof typeof icons] || icons.Circle;

          return (
            <div
              key={status.id}
              className={cn(
                "flex flex-col items-center flex-1",
                index < sortedStatuses.length - 1 && "relative"
              )}
            >
              {/* Connector line */}
              {index < sortedStatuses.length - 1 && (
                <div className="absolute top-5 left-1/2 w-full h-0.5 -z-10">
                  <div
                    className={cn(
                      "h-full transition-colors duration-300",
                      isCompleted || isCurrent ? "bg-success" : "bg-muted"
                    )}
                  />
                </div>
              )}

              {/* Circle with icon */}
              <button
                type="button"
                onClick={() => interactive && onStatusChange?.(status.id)}
                disabled={!interactive}
                className={cn(
                  classes.circle,
                  "rounded-full flex items-center justify-center transition-all duration-300 border-2",
                  interactive && "cursor-pointer hover:scale-110",
                  !interactive && "cursor-default",
                  isCompleted && "bg-success border-success text-white",
                  isCurrent && "border-primary bg-primary text-primary-foreground shadow-lg",
                  isFuture && "border-muted bg-muted/50 text-muted-foreground"
                )}
                style={isCurrent ? { borderColor: status.color, backgroundColor: status.color } : undefined}
              >
                {isCompleted ? (
                  <Check className={classes.icon} />
                ) : (
                  <IconComponent className={classes.icon} />
                )}
              </button>

              {/* Status name */}
              <div className={cn("mt-2 text-center max-w-[100px]", classes.text)}>
                <span
                  className={cn(
                    "font-medium block",
                    isCurrent && "text-foreground",
                    isCompleted && "text-success",
                    isFuture && "text-muted-foreground"
                  )}
                >
                  {status.name}
                </span>
                {statusDate && (
                  <span className="text-xs text-muted-foreground block mt-0.5">{statusDate}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile vertical layout */}
      <div className="md:hidden space-y-4">
        {sortedStatuses.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const statusDate = getStatusDate(status.id);

          const IconComponent = icons[status.icon as keyof typeof icons] || icons.Circle;

          return (
            <div key={status.id} className="flex items-start gap-4">
              {/* Circle and line */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => interactive && onStatusChange?.(status.id)}
                  disabled={!interactive}
                  className={cn(
                    classes.circle,
                    "rounded-full flex items-center justify-center transition-all duration-300 border-2 shrink-0",
                    interactive && "cursor-pointer hover:scale-110",
                    !interactive && "cursor-default",
                    isCompleted && "bg-success border-success text-white",
                    isCurrent && "border-primary bg-primary text-primary-foreground shadow-lg",
                    isFuture && "border-muted bg-muted/50 text-muted-foreground"
                  )}
                  style={isCurrent ? { borderColor: status.color, backgroundColor: status.color } : undefined}
                >
                  {isCompleted ? (
                    <Check className={classes.icon} />
                  ) : (
                    <IconComponent className={classes.icon} />
                  )}
                </button>
                {index < sortedStatuses.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 h-8 mt-2 transition-colors duration-300",
                      isCompleted || isCurrent ? "bg-success" : "bg-muted"
                    )}
                  />
                )}
              </div>

              {/* Status name and date */}
              <div className="pt-2">
                <span
                  className={cn(
                    "font-medium block",
                    classes.text,
                    isCurrent && "text-foreground",
                    isCompleted && "text-success",
                    isFuture && "text-muted-foreground"
                  )}
                >
                  {status.name}
                </span>
                {statusDate && (
                  <span className="text-xs text-muted-foreground">{statusDate}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
