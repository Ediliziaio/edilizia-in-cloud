-- 5. hr_giornate
CREATE TABLE public.hr_giornate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  data date NOT NULL,
  stato text DEFAULT 'presente' CHECK (stato IN ('presente','assente','ferie','permesso','malattia','smart_working','trasferta','festivita')),
  ore_previste numeric(4,2) DEFAULT 8,
  ore_lavorate numeric(4,2) DEFAULT 0,
  ore_straordinario numeric(4,2) DEFAULT 0,
  ore_pausa numeric(4,2) DEFAULT 0,
  ore_mancanti numeric(4,2) GENERATED ALWAYS AS (GREATEST(0, ore_previste - ore_lavorate)) STORED,
  prima_entrata time,
  ultima_uscita time,
  note text,
  anomalia boolean DEFAULT false,
  anomalia_motivo text,
  bloccata boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(profilo_id, data)
);
