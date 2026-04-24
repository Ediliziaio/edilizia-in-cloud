export const WEBHOOK_EVENTS = {
  "Lead & Opportunità": [
    "contact.created",
    "contact.updated",
    "contact.deleted",
    "opportunity.created",
    "opportunity.updated",
    "opportunity.stage_changed",
    "opportunity.won",
    "opportunity.lost",
  ],
  "Ordini": [
    "order.created",
    "order.status_changed",
    "order.completed",
    "order.cancelled",
  ],
  "Appuntamenti": [
    "appointment.created",
    "appointment.rescheduled",
    "appointment.cancelled",
    "appointment.completed",
  ],
  "Task": [
    "task.created",
    "task.completed",
    "task.overdue",
  ],
  "Pagamenti": [
    "payment.received",
    "payment.failed",
  ],
} as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS][number];

export interface Webhook {
  id: string;
  company_id: string;
  name: string;
  url: string;
  secret: string | null;
  is_active: boolean;
  events: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Sicurezza + resilienza (migration 20261024110000)
  allowed_ips?: string[] | null;
  timeout_seconds?: number | null;
  consecutive_failures?: number | null;
  max_consecutive_failures?: number | null;
  paused_at?: string | null;
  paused_reason?: string | null;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "success" | "failed" | "retrying";
  http_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  attempt_count: number;
  last_attempt_at: string;
  created_at: string;
}
