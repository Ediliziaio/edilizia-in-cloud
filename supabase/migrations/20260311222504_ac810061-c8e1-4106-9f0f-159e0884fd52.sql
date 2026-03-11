
-- Tabella principale disponibilità utente
CREATE TABLE IF NOT EXISTS public.user_availability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  timezone    text NOT NULL DEFAULT 'Europe/Rome',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Slot orari per giorno della settimana (1=Lun, 7=Dom)
CREATE TABLE IF NOT EXISTS public.user_availability_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_id  uuid NOT NULL REFERENCES public.user_availability(id) ON DELETE CASCADE,
  day_of_week      smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  CHECK (end_time > start_time)
);

-- Eccezioni (date specifiche: giorno libero o orari custom)
CREATE TABLE IF NOT EXISTS public.user_availability_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_id  uuid NOT NULL REFERENCES public.user_availability(id) ON DELETE CASCADE,
  exception_date   date NOT NULL,
  is_day_off       boolean NOT NULL DEFAULT true,
  start_time       time,
  end_time         time,
  reason           text,
  CHECK (
    (is_day_off = true AND start_time IS NULL AND end_time IS NULL)
    OR
    (is_day_off = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX idx_user_availability_user_id ON public.user_availability(user_id);
CREATE INDEX idx_user_availability_slots_avail_id ON public.user_availability_slots(availability_id);
CREATE INDEX idx_user_availability_exceptions_avail_id ON public.user_availability_exceptions(availability_id);
CREATE INDEX idx_user_availability_exceptions_date ON public.user_availability_exceptions(exception_date);

-- RLS
ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_availability_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_availability" ON public.user_availability
  FOR ALL USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "company_access_availability_slots" ON public.user_availability_slots
  FOR ALL USING (
    availability_id IN (
      SELECT a.id FROM public.user_availability a
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.company_id = p.company_id
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "company_access_availability_exceptions" ON public.user_availability_exceptions
  FOR ALL USING (
    availability_id IN (
      SELECT a.id FROM public.user_availability a
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.company_id = p.company_id
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
