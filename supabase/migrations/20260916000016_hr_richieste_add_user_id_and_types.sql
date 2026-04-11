-- Aggiunge user_id a hr_richieste per consentire richieste dal campo
-- e aggiorna il CHECK per includere nuovi tipi
ALTER TABLE public.hr_richieste ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Rende profilo_id nullable (campo non ha necessariamente un profilo HR)
ALTER TABLE public.hr_richieste ALTER COLUMN profilo_id DROP NOT NULL;

-- Aggiorna il CHECK per tipo per includere nuovi tipi
ALTER TABLE public.hr_richieste DROP CONSTRAINT IF EXISTS hr_richieste_tipo_check;
ALTER TABLE public.hr_richieste ADD CONSTRAINT hr_richieste_tipo_check
  CHECK (tipo IN ('ferie','permesso','malattia','straordinario','cambio_turno','rimborso','rol','smart_working','trasferta','altro'));

-- Indice su user_id
CREATE INDEX IF NOT EXISTS idx_hr_richieste_user_id ON public.hr_richieste(user_id);

-- RLS: l'operaio può inserire le proprie richieste
CREATE POLICY richieste_campo_insert ON public.hr_richieste
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

-- RLS: l'operaio può vedere le proprie richieste (via user_id)
CREATE POLICY richieste_campo_select ON public.hr_richieste
  FOR SELECT USING (
    auth.uid() = user_id
  );
