import { useMemo } from "react";
import type { CalendarOrder, CalendarAppointment } from "@/types/calendar";

export interface ConflictEntry {
  date: string;
  employeeId: string;
  employeeName: string;
  events: Array<{ type: "order" | "appointment"; label: string; id: string }>;
}

export function useConflictDetection(
  orders: CalendarOrder[],
  appointments: CalendarAppointment[]
) {
  const conflicts = useMemo(() => {
    // Map: "date|employeeId" → events[]
    const map = new Map<string, ConflictEntry>();

    const addEvent = (
      date: string,
      empId: string,
      empName: string,
      event: ConflictEntry["events"][0]
    ) => {
      const key = `${date}|${empId}`;
      if (!map.has(key)) {
        map.set(key, { date, employeeId: empId, employeeName: empName, events: [] });
      }
      map.get(key)!.events.push(event);
    };

    // Orders with employees
    for (const order of orders) {
      if (!order.order_employees?.length) continue;
      for (const oe of order.order_employees) {
        const empName = `${oe.employee.first_name} ${oe.employee.last_name}`;
        const label = order.order_code || order.description?.slice(0, 30) || "Ordine";

        // expected_date = posa
        if (order.expected_date) {
          addEvent(order.expected_date, oe.employee.id, empName, {
            type: "order",
            label: `Posa: ${label}`,
            id: order.id,
          });
        }

        // work_start_date to work_end_date range
        if (order.work_start_date) {
          const start = new Date(order.work_start_date);
          const end = order.work_end_date ? new Date(order.work_end_date) : start;
          const cur = new Date(start);
          while (cur <= end) {
            const dateStr = cur.toISOString().split("T")[0];
            // avoid duplicate if same as expected_date
            if (dateStr !== order.expected_date) {
              addEvent(dateStr, oe.employee.id, empName, {
                type: "order",
                label: `Lavoro: ${label}`,
                id: order.id,
              });
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      }
    }

    // Appointments with assigned_to (these are user IDs, not employee IDs — skip for now
    // since appointments use profiles and orders use employees; conflict detection is employee-scoped)

    // Filter to only entries with 2+ events
    const result: ConflictEntry[] = [];
    for (const entry of map.values()) {
      if (entry.events.length >= 2) {
        result.push(entry);
      }
    }

    return result;
  }, [orders, appointments]);

  return { conflicts, conflictCount: conflicts.length };
}
