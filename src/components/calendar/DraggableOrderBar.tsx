import { useDraggable } from "@dnd-kit/core";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { canMoveCalendarWorkPeriod } from "@/lib/calendar/planningTools";
import { calendarEventStatus } from "@/lib/calendar/eventDetails";
import type { CalendarOrder, CalendarWorkPeriod } from "@/types/calendar";

export function DraggableOrderBar({
  order,
  period,
  bar,
  dayWidth,
  minBarWidth = 0,
  color,
  progress,
  onSelect,
  top = 10,
  height = 24,
}: {
  order: CalendarOrder;
  period: CalendarWorkPeriod;
  bar: { left: number; width: number; orderStart: Date; orderEnd: Date };
  dayWidth: number;
  minBarWidth?: number;
  color: string;
  progress?: number;
  onSelect: () => void;
  top?: number;
  height?: number;
}) {
  const p = usePermissions();
  const canDrag =
    !p.isLoading &&
    p.canEditOrders &&
    !p.solaLettura &&
    canMoveCalendarWorkPeriod(order, period);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: order.id + ":" + period.id,
      disabled: !canDrag,
      data: { order, period, bar },
    });
  const percent =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress))
      : undefined;
  const status = calendarEventStatus({
    type: "lavoro",
    order,
    work: period,
    color,
  });
  const names = [
    ...new Set(
      period.resources
        .filter(
          (b) =>
            b.start_date <= period.end_date && b.end_date >= period.start_date,
        )
        .map((b) => b.resourceName),
    ),
  ];
  const width = Math.max(bar.width, dayWidth, minBarWidth);
  const duration = differenceInDays(bar.orderEnd, bar.orderStart) + 1;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          ref={setNodeRef}
          {...(canDrag ? attributes : {})}
          {...(canDrag ? listeners : {})}
          aria-label={"Dettagli " + period.name + " · " + order.order_code}
          title={period.name + " · " + order.order_code}
          className="absolute flex items-center gap-2 overflow-hidden rounded-md border-l-[3px] border-black/15 px-2 text-left text-[11px] text-white shadow-sm hover:brightness-110 focus:ring-2 focus:ring-primary touch-none"
          style={{
            top,
            height,
            left: bar.left + (transform?.x || 0),
            width,
            backgroundColor: color,
            opacity: isDragging ? 0.6 : 1,
            cursor: canDrag ? "grab" : "pointer",
          }}
          onClick={(e) => {
            if (!isDragging && !transform?.x) {
              e.stopPropagation();
              onSelect();
            }
          }}
        >
          {percent !== undefined && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 bg-black/15"
              style={{ width: percent + "%" }}
            />
          )}
          {width >= 60 && (
            <span className="relative min-w-0 flex-1 truncate font-medium">
              {period.phase_id ? period.name : order.order_code}
            </span>
          )}
          {width >= 150 && percent !== undefined && (
            <span className="relative shrink-0 text-[10px]">{percent}%</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] space-y-1">
        <p className="font-semibold">{period.name}</p>
        <p className="text-xs">{order.order_code}</p>
        <p className="text-xs">
          {format(bar.orderStart, "d MMM", { locale: it })} —{" "}
          {format(bar.orderEnd, "d MMM yyyy", { locale: it })} · {duration}{" "}
          giorni di calendario
        </p>
        {status && <p className="text-xs">{status}</p>}
        {percent !== undefined && (
          <p className="text-xs">Avanzamento registrato: {percent}%</p>
        )}
        <p className="text-xs">{names.join(", ") || "Risorse da assegnare"}</p>
        <p className="text-xs">
          {canDrag
            ? "Trascina per spostare le date della commessa. Clicca per i dettagli."
            : "Clicca per i dettagli. Le date delle fasi si gestiscono nelle lavorazioni."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
