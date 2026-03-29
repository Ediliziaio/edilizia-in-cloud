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
