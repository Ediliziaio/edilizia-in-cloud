-- Slot orari per giorno della settimana (1=Lun, 7=Dom)
CREATE TABLE IF NOT EXISTS public.user_availability_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  availability_id  uuid NOT NULL REFERENCES public.user_availability(id) ON DELETE CASCADE,
  day_of_week      smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  CHECK (end_time > start_time)
);
