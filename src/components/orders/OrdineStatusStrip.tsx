import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/orderUtils";
import type { StatusHistoryItem } from "./OrderProgressTracker";

interface OrdineStatusStripProps {
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: StatusHistoryItem[];
  onStatusChange?: (statusId: string) => void;
}

export function OrdineStatusStrip({
  statuses,
  currentStatusId,
  statusHistory = [],
  onStatusChange,
}: OrdineStatusStripProps) {
  const sorted = [...statuses].sort((a, b) => a.position - b.position);
  const currentIndex = sorted.findIndex((s) => s.id === currentStatusId);

  const getDate = (statusId: string): string | null => {
    const h = statusHistory.find((h) => h.status_id === statusId);
    if (!h) return null;
    return new Date(h.changed_at).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-max px-1 py-2 gap-0">
        {sorted.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const date = getDate(status.id);

          return (
            <div key={status.id} className="flex items-center">
              {/* Step */}
              <div
                className="flex flex-col items-center gap-1 cursor-pointer group"
                onClick={() => onStatusChange?.(status.id)}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all text-xs font-medium",
                    isCompleted
                      ? "border-orange-500 bg-orange-500 text-white"
                      : isCurrent
                      ? "border-orange-500 bg-orange-50 text-orange-600"
                      : "border-gray-200 bg-white text-gray-400 group-hover:border-gray-400"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap max-w-[80px] text-center leading-tight",
                    isCurrent
                      ? "text-orange-600 font-medium"
                      : isCompleted
                      ? "text-gray-500"
                      : "text-gray-400"
                  )}
                >
                  {status.name}
                </span>
                {date && (
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {date}
                  </span>
                )}
              </div>

              {/* Connector */}
              {index < sorted.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-8 mx-1 mb-5 flex-shrink-0",
                    index < currentIndex ? "bg-orange-400" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
