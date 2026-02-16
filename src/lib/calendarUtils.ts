import type { CalendarOrder } from "@/types/calendar";

export function hasLogisticRisk(order: CalendarOrder): boolean {
  if (!order.expected_date) return false;
  if (!order.warehouse_arrival_date) return true;
  return order.warehouse_arrival_date > order.expected_date;
}

export function getEmployeeInitials(order: CalendarOrder): string {
  if (!order.assigned_employees || order.assigned_employees.length === 0) return "";
  return order.assigned_employees
    .map((ae) => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`)
    .join(", ");
}
