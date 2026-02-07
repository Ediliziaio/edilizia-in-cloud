export interface CalendarOrder {
  id: string;
  order_code: string | null;
  description: string;
  expected_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
}

export type GanttZoom = "year" | "quarter" | "month";

export type CalendarViewType = "month" | "gantt";
