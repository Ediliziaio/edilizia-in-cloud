import { useMemo } from "react";
import type { CalendarOrder, CalendarAppointment } from "@/types/calendar";

export interface ConflictEntry {
  date: string;
  resourceId: string;
  resourceName: string;
  resourceType: "employee" | "team" | "assignment";
  severity: "conflict" | "warning";
  reason: string;
  events: Array<{ type: "order" | "appointment"; label: string; id: string; orderId?: string | null }>;
}

const WORK_APPOINTMENT_TYPES = new Set(["inizio_lavori", "fine_lavori", "posa_prova", "collaudo", "verifica_cantiere"]);

/** yyyy-MM-dd nel fuso del browser (non in UTC). */
function dataLocale(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eachDateInRange(startDate: string | null, endDate: string | null, callback: (date: string) => void) {
  if (!startDate) return;
  const start = new Date(`${startDate}T00:00:00`);
  const end = endDate ? new Date(`${endDate}T00:00:00`) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const cur = new Date(start);
  while (cur <= end) {
    // Era cur.toISOString(): la mezzanotte locale in Italia (UTC+1/+2) in UTC è
    // il giorno prima, e ogni giornata di lavoro finiva sul giorno precedente
    // mentre la posa (expected_date, già una stringa) restava sul suo.
    callback(dataLocale(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

/**
 * Conflitti di risorse da `oggi` in avanti. Quelli passati non si possono più
 * risolvere e gonfiavano l'avviso: il 25/09/2026 la demo segnava 141 conflitti,
 * quasi tutti di giugno.
 */
export function calcolaConflitti(
  orders: CalendarOrder[],
  appointments: CalendarAppointment[],
  employeeByUserId?: Map<string, { id: string; name: string }>,
  oggi: string = dataLocale(new Date()),
): ConflictEntry[] {
  // Map: "date|resourceId" → events[]
  const map = new Map<string, ConflictEntry>();

  const addEvent = (
    date: string,
    resourceId: string,
    resourceName: string,
    resourceType: ConflictEntry["resourceType"],
    event: ConflictEntry["events"][0]
  ) => {
    const key = `${date}|${resourceType}|${resourceId}`;
    if (!map.has(key)) {
      map.set(key, {
        date,
        resourceId,
        resourceName,
        resourceType,
        severity: "conflict",
        reason: resourceType === "team"
          ? "Squadra assegnata a più lavori nello stesso giorno"
          : "Operatore assegnato a più eventi nello stesso giorno",
        events: [],
      });
    }
    const entry = map.get(key)!;
    const duplicate = entry.events.some((existing) =>
      existing.type === event.type && existing.id === event.id && existing.label === event.label
    );
    if (!duplicate) {
      entry.events.push(event);
    }
  };

  const ordersById = new Map(orders.map((order) => [order.id, order]));

  // Orders with employees
  for (const order of orders) {
    const label = order.order_code || order.description?.slice(0, 30) || "Ordine";

    for (const oe of order.order_employees ?? []) {
      const empName = `${oe.employee.first_name} ${oe.employee.last_name}`;

      // expected_date = posa
      if (order.expected_date) {
        addEvent(order.expected_date, oe.employee.id, empName, "employee", {
          type: "order",
          label: `Posa: ${label}`,
          id: order.id,
          orderId: order.id,
        });
      }

      // work_start_date to work_end_date range
      eachDateInRange(order.work_start_date, order.work_end_date, (dateStr) => {
        if (dateStr !== order.expected_date) {
          addEvent(dateStr, oe.employee.id, empName, "employee", {
            type: "order",
            label: `Lavoro: ${label}`,
            id: order.id,
            orderId: order.id,
          });
        }
      });
    }

    // External teams/subcontractors: same conflict logic as internal employees.
    for (const ot of order.order_external_teams ?? []) {
      if (!ot.external_team?.id) continue;
      const teamId = ot.external_team.id;
      const teamName = ot.external_team.name || "Squadra senza nome";

      if (order.expected_date) {
        addEvent(order.expected_date, teamId, teamName, "team", {
          type: "order",
          label: `Posa: ${label}`,
          id: order.id,
          orderId: order.id,
        });
      }

      eachDateInRange(order.work_start_date, order.work_end_date, (dateStr) => {
        if (dateStr !== order.expected_date) {
          addEvent(dateStr, teamId, teamName, "team", {
            type: "order",
            label: `Lavoro: ${label}`,
            id: order.id,
            orderId: order.id,
          });
        }
      });
    }
  }

  // Appointments: bridge assigned_to (user_id) → employee via employeeByUserId map
  if (employeeByUserId && employeeByUserId.size > 0) {
    for (const apt of appointments) {
      if (!apt.assigned_to || !apt.appointment_date) continue;
      const emp = employeeByUserId.get(apt.assigned_to);
      if (!emp) continue; // no matching employee — cannot detect cross-module conflict
      addEvent(apt.appointment_date, emp.id, emp.name, "employee", {
        type: "appointment",
        label: apt.title || "Appuntamento",
        id: apt.id,
        orderId: apt.order_id,
      });
    }
  }

  // Linked work appointments assigned to people outside the order team.
  // This is a warning, not a time conflict: it catches “commessa con una squadra,
  // calendario assegnato a un'altra persona”.
  const assignmentWarnings: ConflictEntry[] = [];
  if (employeeByUserId && employeeByUserId.size > 0) {
    for (const apt of appointments) {
      if (!apt.assigned_to || !apt.order_id || !apt.appointment_date) continue;
      if (!WORK_APPOINTMENT_TYPES.has(apt.appointment_type)) continue;
      const emp = employeeByUserId.get(apt.assigned_to);
      const order = ordersById.get(apt.order_id);
      if (!emp || !order) continue;
      const orderEmployeeIds = new Set(order.order_employees?.map((oe) => oe.employee.id) ?? []);
      const orderTeamNames = order.order_external_teams?.map((ot) => ot.external_team?.name).filter(Boolean) ?? [];
      if (orderEmployeeIds.size === 0 && orderTeamNames.length === 0) continue;
      if (orderEmployeeIds.has(emp.id)) continue;

      const orderLabel = order.order_code || order.description?.slice(0, 30) || "Commessa";
      assignmentWarnings.push({
        date: apt.appointment_date,
        resourceId: `assignment:${apt.id}`,
        resourceName: emp.name,
        resourceType: "assignment",
        severity: "warning",
        reason: orderTeamNames.length > 0
          ? `Appuntamento collegato a ${orderLabel}, ma assegnato a una persona diversa dalla squadra commessa (${orderTeamNames.join(", ")})`
          : `Appuntamento collegato a ${orderLabel}, ma assegnato a un operatore non presente nella commessa`,
        events: [
          {
            type: "appointment",
            label: apt.title || "Appuntamento",
            id: apt.id,
            orderId: apt.order_id,
          },
        ],
      });
    }
  }

  // Filter to only entries with 2+ events
  const result: ConflictEntry[] = [];
  for (const entry of map.values()) {
    if (entry.events.length >= 2) {
      result.push(entry);
    }
  }

  return [...result, ...assignmentWarnings]
    .filter((entry) => entry.date >= oggi)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function useConflictDetection(
  orders: CalendarOrder[],
  appointments: CalendarAppointment[],
  employeeByUserId?: Map<string, { id: string; name: string }>
) {
  const conflicts = useMemo(
    () => calcolaConflitti(orders, appointments, employeeByUserId),
    [orders, appointments, employeeByUserId],
  );

  return { conflicts, conflictCount: conflicts.length };
}
