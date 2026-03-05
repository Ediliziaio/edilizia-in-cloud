import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import { format, isSameDay, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UsersRound } from "lucide-react";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import { hasLogisticRisk } from "@/lib/calendarUtils";
import { calculateLeadTime } from "./LeadTimeStats";
import type { CalendarOrder } from "@/types/calendar";

function darkenColor(hex: string): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 40);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface BarInfo {
  left: number;
  width: number;
  orderStart: Date;
  orderEnd: Date;
}

interface DraggableOrderBarProps {
  order: CalendarOrder;
  bar: BarInfo;
  dayWidth: number;
  color: string;
  progress?: number; // 0-100
}

export function DraggableOrderBar({
  order,
  bar,
  dayWidth,
  color,
  progress,
}: DraggableOrderBarProps) {
  const navigate = useNavigate();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { order, bar },
  });

  const leadTime = calculateLeadTime(order);
  const duration = differenceInDays(bar.orderEnd, bar.orderStart) + 1;

  const logisticRisk = hasLogisticRisk(order);
  const externalTeamNames = order.order_external_teams
    ?.map((aet) => aet.external_team.name)
    .join(", ");

  const style = {
    left: bar.left + (transform?.x || 0),
    width: Math.max(bar.width, dayWidth),
    backgroundColor: color,
    borderLeftColor: darkenColor(color),
    opacity: isDragging ? 0.6 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    ...(logisticRisk ? {
      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 8px)`,
    } : {}),
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging && !transform?.x) {
      e.preventDefault();
      e.stopPropagation();
      setEditDialogOpen(true);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className="absolute top-2 bottom-2 rounded-md shadow-sm hover:shadow-lg transition-all flex items-center px-2 overflow-hidden touch-none border-l-[3px]"
            style={style}
            onClick={handleClick}
          >
            {/* Progress overlay */}
            {progress !== undefined && progress > 0 && progress < 100 && (
              <div
                className="absolute inset-0 rounded-md"
                style={{
                  width: `${progress}%`,
                  backgroundColor: "rgba(0,0,0,0.15)",
                }}
              />
            )}
            <div className="relative z-10 flex items-center gap-1 text-xs text-white truncate w-full">
              {bar.width > 120 ? (
                <>
                  <span className="font-semibold">{order.order_code || "N/A"}</span>
                  <span className="opacity-75">- {order.customer.last_name}</span>
                  {bar.width > 200 && (
                    <span className="ml-auto opacity-60 text-[10px]">{duration}g</span>
                  )}
                </>
              ) : bar.width > 60 ? (
                <span className="font-medium truncate">
                  {order.order_code || order.description.slice(0, 20)}
                </span>
              ) : null}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <div className="space-y-1">
            <p className="font-medium">{order.order_code || "Ordine"}</p>
            <p className="text-sm text-muted-foreground">
              {order.customer.first_name} {order.customer.last_name}
            </p>
            <p className="text-sm truncate">{order.description}</p>
            <p className="text-xs text-muted-foreground">
              {format(bar.orderStart, "d MMM", { locale: it })}
              {!isSameDay(bar.orderStart, bar.orderEnd) && (
                <> - {format(bar.orderEnd, "d MMM", { locale: it })}</>
              )}
            </p>
            {order.status && (
              <p className="text-xs">
                Stato: <span style={{ color: order.status.color }}>{order.status.name}</span>
              </p>
            )}
            {order.order_employees && order.order_employees.length > 0 ? (
              <p className="text-xs">
                Squadra: {order.order_employees.map(ae => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`).join(", ")}
              </p>
            ) : (
              <p className="text-xs text-amber-500">Nessuna squadra assegnata</p>
            )}
            {externalTeamNames && (
              <div className="flex items-center gap-1 text-xs">
                <UsersRound className="h-3 w-3" />
                <span>{externalTeamNames}</span>
              </div>
            )}
            {leadTime !== null && (
              <p className="text-xs font-medium">
                Lead Time: {leadTime} giorni
              </p>
            )}
            <p className="text-xs text-primary mt-1">Clicca per modificare le date</p>
          </div>
        </TooltipContent>
      </Tooltip>

      <EditOrderDatesDialog
        order={order}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}
