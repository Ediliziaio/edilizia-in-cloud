-- 4. hr_timbrature
CREATE TABLE public.hr_timbrature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrata','uscita','pausa_inizio','pausa_fine')),
  timestamp timestamptz NOT NULL DEFAULT now(),
  data_evento date GENERATED ALWAYS AS ((timestamp AT TIME ZONE 'Europe/Rome')::date) STORED,
  ora_evento time GENERATED ALWAYS AS ((timestamp AT TIME ZONE 'Europe/Rome')::time) STORED,
  lat double precision,
  lng double precision,
  sede_id uuid REFERENCES public.hr_sedi(id),
  fonte text DEFAULT 'web' CHECK (fonte IN ('web','app','nfc','qr','manuale')),
  ip_address text,
  note text,
  validata boolean DEFAULT false,
  validata_da uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
