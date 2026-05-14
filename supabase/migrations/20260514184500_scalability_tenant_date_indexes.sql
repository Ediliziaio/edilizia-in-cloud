-- Scalability indexes for high-concurrency company workspaces.
-- These are intentionally idempotent: they do not change data or business logic.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'work_start_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_company_work_start
      ON public.orders(company_id, work_start_date)
      WHERE work_start_date IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'work_end_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_company_work_end
      ON public.orders(company_id, work_end_date)
      WHERE work_end_date IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_company_expected_date
  ON public.orders(company_id, expected_date)
  WHERE expected_date IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'warehouse_arrival_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_company_warehouse_arrival
      ON public.orders(company_id, warehouse_arrival_date)
      WHERE warehouse_arrival_date IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_company_order
  ON public.appointments(company_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_company_contact
  ON public.appointments(company_id, contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_busy_company_start
  ON public.google_calendar_busy_slots(company_id, start_at);

CREATE INDEX IF NOT EXISTS idx_apple_busy_company_start
  ON public.apple_calendar_busy_slots(company_id, start_at);

CREATE INDEX IF NOT EXISTS idx_google_event_map_company_appointment
  ON public.google_calendar_event_map(company_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_status_dates
  ON public.leave_requests(company_id, status, start_date, end_date);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'data_intervento_prevista'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_company_intervento_date
      ON public.tickets(company_id, data_intervento_prevista)
      WHERE data_intervento_prevista IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.piani_manutenzione') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_piani_manutenzione_company_scadenza
      ON public.piani_manutenzione(company_id, prossima_scadenza)
      WHERE prossima_scadenza IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_company_active_name
  ON public.employees(company_id, is_active, last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_external_teams_company_active_name
  ON public.external_teams(company_id, is_active, name);

DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_company_assignee_status_due
      ON public.tasks(company_id, assigned_to, status, due_date)
      WHERE status <> ''completata''';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_messages_company_sender_created
  ON public.support_messages(company_id, sender_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_company_status_expires
  ON public.ai_action_proposals(company_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_lifecycle_notifications_company_dismissed_created
  ON public.lifecycle_notifications(company_id, is_dismissed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_user_dismissed_created
  ON public.notifications(company_id, user_id, is_dismissed, created_at DESC);
