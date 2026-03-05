import { CalendarClock, Search, Truck, Users, UserCheck } from "lucide-react";
import type { CalendarOrder, CalendarAppointment } from "@/types/calendar";
import type { AppointmentData } from "@/components/appointments/AppointmentDialog";

export function hasLogisticRisk(order: CalendarOrder): boolean {
  if (!order.expected_date) return false;
  if (!order.warehouse_arrival_date) return true;
  return order.warehouse_arrival_date > order.expected_date;
}

export function getEmployeeInitials(order: CalendarOrder): string {
  if (!order.order_employees || order.order_employees.length === 0) return "";
  return order.order_employees
    .map((ae) => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`)
    .join(", ");
}

export const WEEK_DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

export const APPOINTMENT_ICONS: Record<string, typeof CalendarClock> = {
  sopralluogo: Search,
  consegna: Truck,
  riunione: Users,
  cliente: UserCheck,
  generico: CalendarClock,
};

export function mapAppointmentToEditData(apt: CalendarAppointment): AppointmentData {
  return {
    id: apt.id,
    title: apt.title,
    description: apt.description,
    appointment_date: apt.appointment_date,
    appointment_time: apt.appointment_time,
    appointment_type: apt.appointment_type,
    assigned_to: apt.assigned_to,
    order_id: apt.order_id,
    is_completed: apt.is_completed,
    status: apt.status || "confermato",
  };
}
