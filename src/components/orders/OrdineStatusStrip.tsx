import { Check } from "lucide-react";
import type { OrderStatus } from "@/lib/orderUtils";
import type { StatusHistoryItem } from "./OrderProgressTracker";

interface OrdineStatusStripProps {
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: StatusHistoryItem[];
  onStatusChange?: (statusId: string) => void;
}

/** Converts a hex color to an rgba string with the given opacity */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function OrdineStatusStrip({
  statuses,
  currentStatusId,
  statusHistory = [],
  onStatusChange,
}: OrdineStatusStripProps) {
  const sorted = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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
    <div className="w-full overflow-x-auto scrollbar-hide">
      <div className="flex items-center min-w-max px-1 py-2 gap-0">
        {sorted.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const date = getDate(status.id);
          const color = status.color || "#6b7280";

          // Circle styles driven by the status's own color
          const circleStyle: React.CSSProperties = isCompleted
            ? { backgroundColor: color, borderColor: color, color: "#fff" }
            : isCurrent
            ? { backgroundColor: hexToRgba(color, 0.12), borderColor: color, color }
            : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#9ca3af" };

          // Label color
          const labelStyle: React.CSSProperties = isCompleted
            ? { color: "#6b7280" }
            : isCurrent
            ? { color, fontWeight: 600 }
            : { color: "#9ca3af" };

          // Connector color
          const connectorStyle: React.CSSProperties = {
            backgroundColor: index < currentIndex ? color : "#e5e7eb",
          };

          return (
            <div key={status.id} className="flex items-center">
              {/* Step */}
              <div
                className="flex flex-col items-center gap-1 cursor-pointer group"
                onClick={() => onStatusChange?.(status.id)}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all text-xs font-medium"
                  style={circleStyle}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span
                  className="text-xs whitespace-nowrap max-w-[80px] text-center leading-tight transition-colors"
                  style={labelStyle}
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
                  className="h-0.5 w-8 mx-1 mb-5 flex-shrink-0 transition-colors"
                  style={connectorStyle}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
