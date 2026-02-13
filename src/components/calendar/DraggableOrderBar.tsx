import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import { format, isSameDay, differenceInDays, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import type { CalendarOrder } from "@/types/calendar";

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
}

export function DraggableOrderBar({
  order,
  bar,
  dayWidth,
  color,
}: DraggableOrderBarProps) {
  const navigate = useNavigate();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    data: { order, bar },
  });

  const calculateLeadTime = () => {
    if (!order.work_end_date) return null;
    const contractDate = new Date(order.created_at);
    const endDate = parseISO(order.work_end_date);
    return differenceInDays(endDate, contractDate);
  };

  const leadTime = calculateLeadTime();

  const style = {
    left: bar.left + (transform?.x || 0),
    width: Math.max(bar.width, dayWidth),
    backgroundColor: color,
    opacity: isDragging ? 0.6 : 1,
    cursor: isDragging ? "grabbing" : "grab",
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only open dialog if not dragging
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
            className="absolute top-2 bottom-2 rounded shadow-sm hover:shadow-md transition-shadow flex items-center px-2 overflow-hidden touch-none"
            style={style}
            onClick={handleClick}
          >
            {bar.width > 60 && (
              <span className="text-xs text-white font-medium truncate">
                {order.order_code || order.description.slice(0, 20)}
              </span>
            )}
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
            {order.assigned_employees && order.assigned_employees.length > 0 ? (
              <p className="text-xs">
                Squadra: {order.assigned_employees.map(ae => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`).join(", ")}
              </p>
            ) : (
              <p className="text-xs text-amber-500">Nessuna squadra assegnata</p>
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
