import { getOrderWorkPeriods } from "./planning";
import type { CalendarOrder, CalendarWorkPeriod } from "@/types/calendar";

function installationOnDay(order: CalendarOrder, date: string) {
  if (order.expected_date !== date) return false;
  const filter = order.planning_resource_filter;
  return (
    !filter ||
    !!order.resource_bookings?.some(
      (b) =>
        b.start_date <= date &&
        b.end_date >= date &&
        (b.resourceType === "employee"
          ? filter.employeeIds
          : filter.teamIds
        ).includes(b.resourceId),
    )
  );
}

export function planningWorkloadOnDay(orders: CalendarOrder[], date: string) {
  return orders.flatMap((order) => {
    const periods = getOrderWorkPeriods(order).filter(
      (p) => p.start_date <= date && p.end_date >= date,
    );
    const installation = installationOnDay(order, date);
    return periods.length || installation
      ? [{ order, periods, installation }]
      : [];
  });
}

/** Ogni fase conserva le sue date. Le sovrapposizioni occupano righe distinte. */
export function planningGanttRows(
  orders: CalendarOrder[],
  from: string,
  to: string,
) {
  return orders
    .flatMap((order) => {
      const periods = getOrderWorkPeriods(order)
        .filter((p) => p.start_date <= to && p.end_date >= from)
        .sort(
          (a, b) =>
            a.start_date.localeCompare(b.start_date) ||
            a.id.localeCompare(b.id),
        );
      const installation =
        order.expected_date &&
        installationOnDay(order, order.expected_date) &&
        order.expected_date >= from &&
        order.expected_date <= to
          ? order.expected_date
          : null;
      if (!periods.length && !installation) return [];
      const lanes: string[] = [];
      const bars = periods.map((period) => {
        let lane = lanes.findIndex((end) => end < period.start_date);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = period.end_date;
        return { period, lane };
      });
      const resources = [
        ...new Set(
          periods.flatMap((p) =>
            p.resources
              .filter(
                (b) =>
                  b.start_date <= to &&
                  b.end_date >= from &&
                  b.start_date <= p.end_date &&
                  b.end_date >= p.start_date,
              )
              .map((b) => b.resourceName),
          ),
        ),
      ];
      return [
        {
          order,
          bars,
          installation,
          resources,
          lanes: Math.max(1, lanes.length),
        },
      ];
    })
    .sort(
      (a, b) =>
        (a.bars[0]?.period.start_date || a.installation || "").localeCompare(
          b.bars[0]?.period.start_date || b.installation || "",
        ) || (a.order.order_code || "").localeCompare(b.order.order_code || ""),
    );
}

export function canMoveCalendarWorkPeriod(
  order: CalendarOrder,
  period: CalendarWorkPeriod | undefined,
) {
  return (
    !order.work_phases?.length &&
    !order.planning_resource_filter &&
    !period?.phase_id &&
    !!order.work_start_date &&
    !!period &&
    period.start_date === order.work_start_date &&
    period.end_date === (order.work_end_date || order.work_start_date)
  );
}
