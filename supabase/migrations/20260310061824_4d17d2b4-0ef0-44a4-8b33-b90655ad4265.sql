
-- ============================================
-- HR Module: leave_requests + leave_balances
-- ============================================

-- 1. Tabella leave_requests
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('ferie','permesso','malattia','congedo')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  total_days    numeric(5,2),
  total_hours   numeric(5,2),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  notes         text,
  approved_by   uuid,
  approved_at   timestamptz,
  rejection_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_duration_check CHECK (
    total_days IS NOT NULL OR total_hours IS NOT NULL
  ),
  CONSTRAINT leave_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_company    ON public.leave_requests(company_id);
CREATE INDEX idx_leave_requests_employee   ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status     ON public.leave_requests(status);
CREATE INDEX idx_leave_requests_dates      ON public.leave_requests(start_date, end_date);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- RLS: dipendente vede le proprie
CREATE POLICY "employee_own_leave_select"
  ON public.leave_requests FOR SELECT
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    OR
    company_id = public.get_my_company_id()
  );

-- RLS: dipendente inserisce le proprie (solo pending)
CREATE POLICY "employee_insert_own_leave"
  ON public.leave_requests FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    AND status = 'pending'
    AND company_id = public.get_my_company_id()
  );

-- RLS: dipendente aggiorna le proprie pending OPPURE admin/staff aggiorna qualsiasi
CREATE POLICY "employee_update_leave"
  ON public.leave_requests FOR UPDATE
  USING (
    (
      employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
      )
      AND status = 'pending'
    )
    OR
    company_id = public.get_my_company_id()
  );

-- 2. Tabella leave_balances
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year                  integer NOT NULL,
  ferie_days_total      numeric(5,2) NOT NULL DEFAULT 0,
  ferie_days_used       numeric(5,2) NOT NULL DEFAULT 0,
  permessi_hours_total  numeric(6,2) NOT NULL DEFAULT 0,
  permessi_hours_used   numeric(6,2) NOT NULL DEFAULT 0,
  rol_hours_total       numeric(6,2) NOT NULL DEFAULT 0,
  rol_hours_used        numeric(6,2) NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id, year)
);

CREATE INDEX idx_leave_balances_company  ON public.leave_balances(company_id, year);
CREATE INDEX idx_leave_balances_employee ON public.leave_balances(employee_id, year);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- RLS: dipendente legge i propri, admin/staff legge tutti della company
CREATE POLICY "leave_balances_read"
  ON public.leave_balances FOR SELECT
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid()
    )
    OR
    company_id = public.get_my_company_id()
  );

-- RLS: admin/staff scrive
CREATE POLICY "leave_balances_write"
  ON public.leave_balances FOR ALL
  USING (
    company_id = public.get_my_company_id()
  );

-- 3. Funzione approve_leave_request
CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id    uuid,
  p_approved      boolean,
  p_rejection_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
  v_year    integer;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Richiesta non trovata'; END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'La richiesta non è in stato pending';
  END IF;

  -- Get the employee's auth user_id for notification
  SELECT user_id INTO v_user_id FROM public.employees WHERE id = v_request.employee_id;

  v_year := EXTRACT(YEAR FROM v_request.start_date)::integer;

  IF p_approved THEN
    UPDATE public.leave_requests SET
      status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
    WHERE id = p_request_id;

    -- Upsert balance
    INSERT INTO public.leave_balances (company_id, employee_id, year)
    VALUES (v_request.company_id, v_request.employee_id, v_year)
    ON CONFLICT (company_id, employee_id, year) DO NOTHING;

    IF v_request.type = 'ferie' THEN
      UPDATE public.leave_balances SET
        ferie_days_used = ferie_days_used + COALESCE(v_request.total_days, 0),
        updated_at = now()
      WHERE company_id = v_request.company_id
        AND employee_id = v_request.employee_id
        AND year = v_year;
    ELSIF v_request.type = 'permesso' THEN
      UPDATE public.leave_balances SET
        permessi_hours_used = permessi_hours_used + COALESCE(v_request.total_hours, 0),
        updated_at = now()
      WHERE company_id = v_request.company_id
        AND employee_id = v_request.employee_id
        AND year = v_year;
    END IF;

    -- Notifica al dipendente
    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_request.company_id,
        v_user_id,
        'generic',
        'Richiesta ferie approvata',
        'La tua richiesta dal ' || v_request.start_date::text ||
        ' al ' || v_request.end_date::text || ' è stata approvata.',
        'leave_request', v_request.id, '/dipendente/ferie'
      );
    END IF;
  ELSE
    UPDATE public.leave_requests SET
      status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now(),
      rejection_note = p_rejection_note,
      updated_at = now()
    WHERE id = p_request_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_request.company_id,
        v_user_id,
        'generic',
        'Richiesta ferie non approvata',
        COALESCE(p_rejection_note, 'La tua richiesta non è stata approvata.'),
        'leave_request', v_request.id, '/dipendente/ferie'
      );
    END IF;
  END IF;
END;
$$;

-- 4. Funzione get_leave_summary
CREATE OR REPLACE FUNCTION public.get_leave_summary(
  p_company_id uuid,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  employee_id         uuid,
  employee_name       text,
  ferie_days_total    numeric,
  ferie_days_used     numeric,
  ferie_days_remaining numeric,
  permessi_hours_total numeric,
  permessi_hours_used  numeric,
  permessi_hours_remaining numeric,
  rol_hours_total     numeric,
  rol_hours_used      numeric,
  rol_hours_remaining numeric,
  pending_requests    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id                                AS employee_id,
    e.first_name || ' ' || e.last_name  AS employee_name,
    COALESCE(lb.ferie_days_total, 0),
    COALESCE(lb.ferie_days_used, 0),
    GREATEST(0, COALESCE(lb.ferie_days_total, 0) - COALESCE(lb.ferie_days_used, 0)),
    COALESCE(lb.permessi_hours_total, 0),
    COALESCE(lb.permessi_hours_used, 0),
    GREATEST(0, COALESCE(lb.permessi_hours_total, 0) - COALESCE(lb.permessi_hours_used, 0)),
    COALESCE(lb.rol_hours_total, 0),
    COALESCE(lb.rol_hours_used, 0),
    GREATEST(0, COALESCE(lb.rol_hours_total, 0) - COALESCE(lb.rol_hours_used, 0)),
    COUNT(lr.id) FILTER (WHERE lr.status = 'pending')
  FROM public.employees e
  LEFT JOIN public.leave_balances lb ON lb.employee_id = e.id
    AND lb.company_id = p_company_id
    AND lb.year = COALESCE(p_year, EXTRACT(YEAR FROM now())::integer)
  LEFT JOIN public.leave_requests lr ON lr.employee_id = e.id
    AND lr.company_id = p_company_id
    AND lr.status = 'pending'
  WHERE e.company_id = p_company_id
    AND e.is_active = true
    AND e.role_type IN ('operaio', 'staff_interno')
  GROUP BY e.id, e.first_name, e.last_name, lb.ferie_days_total,
    lb.ferie_days_used, lb.permessi_hours_total, lb.permessi_hours_used,
    lb.rol_hours_total, lb.rol_hours_used
  ORDER BY e.first_name, e.last_name;
$$;
