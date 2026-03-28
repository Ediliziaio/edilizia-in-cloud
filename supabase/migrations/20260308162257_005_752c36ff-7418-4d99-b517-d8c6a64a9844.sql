-- 4. Appointment reminders tracking table
CREATE TABLE IF NOT EXISTS public.appointment_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  UNIQUE(appointment_id, reminder_type)
);
