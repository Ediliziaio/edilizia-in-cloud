-- 6. hr_richieste
CREATE TABLE public.hr_richieste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ferie','permesso','malattia','straordinario','cambio_turno','rimborso','altro')),
  data_inizio date NOT NULL,
  data_fine date NOT NULL,
  ore_richieste numeric(5,2),
  motivo text,
  stato text DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa','approvata','rifiutata','annullata')),
  approvata_da uuid REFERENCES auth.users(id),
  approvata_il timestamptz,
  note_risposta text,
  allegato_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
