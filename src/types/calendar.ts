export interface CalendarOrder {
  id: string;
  order_code: string | null;
  description: string;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
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
}

export interface OrderStatus {
  id: string;
  name: string;
  color: string;
}

export interface CustomerFilter {
  id: string;
  first_name: string;
  last_name: string;
}

export type GanttZoom = "year" | "quarter" | "month" | "week";

export type CalendarViewType = "month" | "gantt";
