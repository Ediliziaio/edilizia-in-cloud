import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  differenceInDays,
  format,
  getISOWeek,
  isSameDay,
  isWeekend,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { cn } from "@/lib/utils";
import { etichettaCommessa } from "@/lib/calendarUtils";
import { calendarPeriod } from "@/lib/calendar/planning";
import {
  canMoveCalendarWorkPeriod,
  planningGanttRows,
  planningWorkloadOnDay,
} from "@/lib/calendar/planningTools";
import { buildCalendarEvents, type CalendarEvent } from "@/lib/calendar/events";
import { calendarEventKey } from "@/lib/calendar/eventDetails";
import { calendarWorkLocation } from "@/lib/calendar/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DraggableOrderBar } from "./DraggableOrderBar";
import { CalendarDayDetailsDialog } from "./CalendarDayDetailsDialog";
import type {
  CalendarOrder,
  CalendarScope,
  CalendarWorkPeriod,
  GanttZoom,
} from "@/types/calendar";

interface Props {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  orderColorFn?: (order: CalendarOrder) => string;
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  calendarScope?: CalendarScope;
}
const CONFIG = {
  month: { width: 28, step: 1 },
  quarter: { width: 10, step: 3 },
  year: { width: 3.5, step: 12 },
};
const LEFT_WIDTH = 260;
const LANE_HEIGHT = 30;

export function CalendarGanttView({
  orders,
  currentDate,
  onDateChange,
  orderColorFn,
  zoom,
  onZoomChange,
  calendarScope = "personal",
}: Props) {
  const p = usePermissions();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const timeline = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [selected, setSelected] = useState<{
    date: Date;
    event: CalendarEvent;
  } | null>(null);
  const period = useMemo(
    () => calendarPeriod(currentDate, "gantt", zoom),
    [currentDate, zoom],
  );
  const start = parseISO(period.from),
    end = parseISO(period.to);
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: parseISO(period.from),
        end: parseISO(period.to),
      }),
    [period.from, period.to],
  );
  const months = useMemo(
    () =>
      eachMonthOfInterval({
        start: parseISO(period.from),
        end: parseISO(period.to),
      }),
    [period.from, period.to],
  );
  const rows = useMemo(
    () => planningGanttRows(orders, period.from, period.to),
    [orders, period.from, period.to],
  );
  const dayWidth = Math.max(CONFIG[zoom].width, viewportWidth / days.length);
  const width = days.length * dayWidth;
  const today = format(new Date(), "yyyy-MM-dd");
  const todayOffset =
    today >= period.from && today <= period.to
      ? differenceInDays(parseISO(today), start) * dayWidth
      : null;
  const workload = useMemo(
    () =>
      days.map(
        (day) =>
          planningWorkloadOnDay(orders, format(day, "yyyy-MM-dd")).length,
      ),
    [days, orders],
  );
  const peak = Math.max(0, ...workload);
  const phaseCount = rows.reduce((n, r) => n + r.bars.length, 0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    const node = timeline.current;
    if (!node) return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length, zoom]);
  useEffect(() => {
    if (timeline.current && todayOffset !== null)
      timeline.current.scrollLeft = Math.max(
        0,
        todayOffset - timeline.current.clientWidth / 2,
      );
  }, [todayOffset]);

  const openDetails = (order: CalendarOrder, work?: CalendarWorkPeriod) => {
    const at = work
      ? work.start_date < period.from
        ? period.from
        : work.start_date
      : order.expected_date!;
    setSelected({
      date: parseISO(at),
      event: work
        ? { type: "lavoro", order, work, color: "" }
        : { type: "posa", order, color: "" },
    });
  };
  const dragEnd = async (event: DragEndEvent) => {
    if (
      !user?.id ||
      !effectiveCompany?.id ||
      p.isLoading ||
      !p.canEditOrders ||
      p.solaLettura
    )
      return;
    const data = event.active.data.current as
      | { order: CalendarOrder; period?: CalendarWorkPeriod }
      | undefined;
    if (
      !data ||
      !canMoveCalendarWorkPeriod(data.order, data.period) ||
      !rows.some((r) => r.order.id === data.order.id)
    )
      return;
    const moved = Math.round(event.delta.x / dayWidth);
    if (!moved) return;
    const { order } = data;
    try {
      const result = await supabase
        .from("orders")
        .update({
          work_start_date: format(
            addDays(parseISO(order.work_start_date!), moved),
            "yyyy-MM-dd",
          ),
          work_end_date: format(
            addDays(
              parseISO(order.work_end_date || order.work_start_date!),
              moved,
            ),
            "yyyy-MM-dd",
          ),
        })
        .eq("id", order.id)
        .eq("company_id", effectiveCompany.id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      refreshWorkQueries(queryClient, order.id, effectiveCompany.id);
      toast.success("Date della commessa aggiornate");
    } catch {
      toast.error("Date non aggiornate. Verifica i tuoi accessi e riprova.");
    }
  };
  const detailEvents = selected
    ? buildCalendarEvents([selected.date], {
        orders,
        hiddenEventTypes: new Set(["merce"]),
        orderColorFn,
      }).get(format(selected.date, "yyyy-MM-dd")) || []
    : [];
  const weeks = new Map<string, { label: string; count: number }>();
  days.forEach((day) => {
    const key = format(day, "RRRR-II");
    const old = weeks.get(key);
    weeks.set(key, {
      label: "S" + getISOWeek(day),
      count: (old?.count || 0) + 1,
    });
  });

  return (
    <Card className="overflow-hidden p-4" aria-label="Gantt delle lavorazioni">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Periodo Gantt precedente"
            onClick={() =>
              onDateChange(addMonths(currentDate, -CONFIG[zoom].step))
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold capitalize">
              {zoom === "month"
                ? format(currentDate, "MMMM yyyy", { locale: it })
                : zoom === "year"
                  ? format(currentDate, "yyyy")
                  : "Trimestre " +
                    (Math.floor(currentDate.getMonth() / 3) + 1) +
                    " · " +
                    format(currentDate, "yyyy")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {format(start, "d MMM", { locale: it })} —{" "}
              {format(end, "d MMM yyyy", { locale: it })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Periodo Gantt successivo"
            onClick={() =>
              onDateChange(addMonths(currentDate, CONFIG[zoom].step))
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <ToggleGroup
          type="single"
          aria-label="Periodo del Gantt"
          value={zoom}
          onValueChange={(value) => value && onZoomChange(value as GanttZoom)}
          className="rounded-lg bg-muted p-1"
        >
          <ToggleGroupItem value="month" className="text-xs">
            Mese
          </ToggleGroupItem>
          <ToggleGroupItem value="quarter" className="text-xs">
            Trimestre
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="text-xs">
            Anno
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Ogni barra segue una lavorazione della commessa. Clicca per dettagli,
          presenze e SAL.
        </p>
        <p>
          <b className="text-foreground">{phaseCount}</b> lavorazioni · picco{" "}
          <b className="text-foreground">{peak}</b> cantieri
        </p>
      </div>
      {!rows.length ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nessuna lavorazione o posa pianificata nel periodo e nei filtri
          selezionati.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={dragEnd}>
          <div className="flex overflow-hidden rounded-xl border">
            <div
              className="shrink-0 border-r bg-muted/15"
              style={{ width: LEFT_WIDTH }}
            >
              <div className="flex h-16 items-center border-b bg-muted/40 px-3 text-xs font-semibold">
                Commessa e risorse pianificate
              </div>
              {rows.map((row) => (
                <Link
                  key={row.order.id}
                  to={calendarWorkLocation(row.order.id)}
                  className="flex flex-col justify-center gap-1 border-b px-3 hover:bg-muted/50"
                  style={{ height: Math.max(64, row.lanes * LANE_HEIGHT + 20) }}
                >
                  <span className="truncate text-sm font-semibold">
                    {etichettaCommessa(row.order)}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {row.order.order_code} · {row.bars.length} lavorazioni
                  </span>
                  <span
                    className="truncate text-[10px] text-muted-foreground"
                    title={row.resources.join(", ")}
                  >
                    {row.resources.join(", ") || "Risorse da assegnare"}
                  </span>
                </Link>
              ))}
              <div className="flex h-9 items-center px-3 text-[10px] font-medium">
                CANTIERI PER GIORNO
              </div>
            </div>
            <div
              ref={timeline}
              className="relative min-w-0 flex-1 overflow-x-auto"
            >
              <div style={{ width }}>
                <div className="h-16 border-b bg-muted/40">
                  <div className="flex h-8">
                    {months.map((month) => (
                      <div
                        key={format(month, "yyyy-MM")}
                        className="flex shrink-0 items-center justify-center border-b border-r text-xs font-medium"
                        style={{
                          width:
                            days.filter(
                              (d) => d.getMonth() === month.getMonth(),
                            ).length * dayWidth,
                        }}
                      >
                        {format(month, zoom === "year" ? "MMM" : "MMMM yyyy", {
                          locale: it,
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex h-8">
                    {zoom === "month"
                      ? days.map((day) => (
                          <div
                            key={format(day, "yyyy-MM-dd")}
                            className={cn(
                              "flex shrink-0 items-center justify-center border-r text-[10px]",
                              isWeekend(day) && "bg-muted",
                              isSameDay(day, new Date()) &&
                                "font-bold text-primary",
                            )}
                            style={{ width: dayWidth }}
                          >
                            {format(day, "d")}
                          </div>
                        ))
                      : zoom === "quarter"
                        ? [...weeks].map(([key, week]) => (
                            <div
                              key={key}
                              className="flex shrink-0 items-center justify-center border-r text-[10px] text-muted-foreground"
                              style={{ width: week.count * dayWidth }}
                            >
                              {week.label}
                            </div>
                          ))
                        : months.map((month) => (
                            <div
                              key={format(month, "yyyy-MM")}
                              className="shrink-0 border-r text-center text-[10px] text-muted-foreground"
                              style={{
                                width:
                                  days.filter(
                                    (d) => d.getMonth() === month.getMonth(),
                                  ).length * dayWidth,
                              }}
                            >
                              {Math.floor(month.getMonth() / 3) + 1}° trim.
                            </div>
                          ))}
                  </div>
                </div>
                <div className="relative">
                  <div
                    className="pointer-events-none absolute inset-0 flex"
                    aria-hidden="true"
                  >
                    {days.map((day) => (
                      <div
                        key={format(day, "yyyy-MM-dd")}
                        className={cn(
                          "shrink-0 border-r border-border/40",
                          isWeekend(day) && zoom !== "year" && "bg-muted/30",
                        )}
                        style={{ width: dayWidth }}
                      />
                    ))}
                  </div>
                  {todayOffset !== null && (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-destructive"
                      style={{ left: todayOffset + dayWidth / 2 }}
                      aria-hidden="true"
                    />
                  )}
                  {rows.map((row) => (
                    <div
                      key={row.order.id}
                      className="relative border-b"
                      style={{
                        height: Math.max(64, row.lanes * LANE_HEIGHT + 20),
                      }}
                    >
                      {row.bars.map(({ period: work, lane }) => {
                        const from =
                            work.start_date < period.from
                              ? period.from
                              : work.start_date,
                          to =
                            work.end_date > period.to
                              ? period.to
                              : work.end_date;
                        const bar = {
                          left:
                            differenceInDays(parseISO(from), start) * dayWidth,
                          width:
                            (differenceInDays(parseISO(to), parseISO(from)) +
                              1) *
                            dayWidth,
                          orderStart: parseISO(work.start_date),
                          orderEnd: parseISO(work.end_date),
                        };
                        const phaseOrder = {
                          ...row.order,
                          order_external_teams:
                            row.order.order_external_teams?.filter((t) =>
                              work.resources.some(
                                (b) =>
                                  b.resourceType === "team" &&
                                  b.resourceId === t.external_team.id,
                              ),
                            ),
                        };
                        return (
                          <DraggableOrderBar
                            key={work.id}
                            order={row.order}
                            period={work}
                            bar={bar}
                            dayWidth={dayWidth}
                            minBarWidth={0}
                            top={10 + lane * LANE_HEIGHT}
                            height={24}
                            color={
                              orderColorFn?.(phaseOrder) ||
                              row.order.status?.color ||
                              "#2563eb"
                            }
                            progress={work.progress}
                            onSelect={() => openDetails(row.order, work)}
                          />
                        );
                      })}
                      {row.installation && (
                        <button
                          type="button"
                          aria-label={
                            "Dettagli posa " +
                            row.order.order_code +
                            " del " +
                            row.installation
                          }
                          className="absolute bottom-1.5 z-10 h-3 w-3 rotate-45 rounded-sm border-2 border-background bg-blue-500 focus:ring-2 focus:ring-primary"
                          title={"Posa prevista · " + row.installation}
                          style={{
                            left:
                              differenceInDays(
                                parseISO(row.installation),
                                start,
                              ) *
                                dayWidth +
                              dayWidth / 2 -
                              6,
                          }}
                          onClick={() => openDetails(row.order)}
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex h-9 bg-muted/20">
                    {workload.map((count, index) => (
                      <div
                        key={index}
                        title={
                          format(days[index], "d MMM", { locale: it }) +
                          ": " +
                          count +
                          " cantieri"
                        }
                        className={cn(
                          "flex shrink-0 items-center justify-center border-r text-[9px]",
                          count > 0 && "bg-primary/15 font-medium",
                        )}
                        style={{ width: dayWidth }}
                      >
                        {zoom !== "year" && count > 0 ? count : ""}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DndContext>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span>
          Avanzamento registrato nelle lavorazioni, quando disponibile.
        </span>
        <span>◆ Posa prevista</span>
        <span>
          Il carico conta i cantieri, senza stimare la disponibilità delle
          squadre.
        </span>
      </div>
      {selected && (
        <CalendarDayDetailsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          date={selected.date}
          events={detailEvents}
          initialEventKey={calendarEventKey(selected.event)}
          isMobile={false}
          calendarScope={calendarScope}
          readOnly
          canEditOrders={p.canEditOrders}
          canViewPayments={p.canViewScadenzario}
          onCreateAppointment={() => {}}
          onEditEvent={() => {}}
        />
      )}
    </Card>
  );
}
