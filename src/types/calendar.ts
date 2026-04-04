export interface CalendarOrder {
  id: string;
  order_code: string | null;
  description: string;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  customer_id: string;
  current_status_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
  order_employees?: Array<{
    employee: {
      id: string;
      first_name: string;
      last_name: string;
    };
  }>;
  order_external_teams?: Array<{
    external_team: {
      id: string;
      name: string;
    };
  }>;
}

export type { OrderStatus } from "@/lib/orderUtils";

export interface CustomerFilter {
  id: string;
  first_name: string;
  last_name: string;
}

export type GanttZoom = "year" | "quarter" | "month";

export type CalendarViewType = "month" | "week" | "day" | "gantt" | "heatmap";

export interface GoogleBusySlot {
  id: string;
  start_at: string;
  end_at: string;
  summary: string | null;
  is_all_day: boolean;
  user_id: string;
  google_calendar_id: string | null;
}

export interface ApprovedLeave {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  total_hours: number | null;
  employee: { id: string; first_name: string; last_name: string } | null;
}

export interface CalendarWarehouseInfo {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  readyCount: number;
  pendingCount: number;
  items: Array<{ id: string; name: string; status: string }>;
}

export interface CalendarIntervento {
  id: string;
  subject: string;
  data_intervento_prevista: string | null;
  status: string;
  assigned_to: string | null;
}

export interface CalendarManutenzione {
  id: string;
  titolo: string;
  prossima_scadenza: string | null;
  stato: string;
}

export interface CalendarAppointment {
  id: string;
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_type: string;
  assigned_to: string | null;
  order_id: string | null;
  is_completed: boolean;
  company_id: string;
  created_by: string;
  assigned?: {
    first_name: string;
    last_name: string;
  } | null;
  order?: {
    order_code: string | null;
    description: string;
  } | null;
  status?: string;
  formatted_address?: string | null;
  address_city?: string | null;
  lat?: number | null;
  lng?: number | null;
  assigned_profile?: {
    first_name: string;
    last_name: string;
  } | null;
}
