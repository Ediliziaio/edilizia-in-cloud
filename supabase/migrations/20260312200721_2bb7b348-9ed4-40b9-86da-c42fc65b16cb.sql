
-- =============================================
-- HR MODULE: 6 tables + RLS + function + trigger
-- =============================================

-- 1. hr_sedi
CREATE TABLE public.hr_sedi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  indirizzo text,
  citta text,
  provincia text,
  cap text,
  lat double precision,
  lng double precision,
  raggio_mt int DEFAULT 200,
  attiva boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.hr_sedi ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_sedi_company ON public.hr_sedi(company_id);

CREATE POLICY "hr_sedi_own_company" ON public.hr_sedi FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_sedi_super_admin" ON public.hr_sedi FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2. hr_festivita
CREATE TABLE public.hr_festivita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data date NOT NULL,
  descrizione text NOT NULL,
  ricorrente boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.hr_festivita ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_festivita_company ON public.hr_festivita(company_id);

CREATE POLICY "hr_festivita_own_company" ON public.hr_festivita FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_festivita_super_admin" ON public.hr_festivita FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 3. hr_profili
CREATE TABLE public.hr_profili (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cognome text NOT NULL,
  codice_fiscale text,
  sesso text CHECK (sesso IN ('M','F','altro')),
  data_nascita date,
  telefono text,
  email text,
  indirizzo text,
  iban text,
  foto_url text,
  data_assunzione date,
  data_cessazione date,
  tipo_contratto text DEFAULT 'indeterminato' CHECK (tipo_contratto IN ('indeterminato','determinato','apprendistato','collaborazione','partita_iva','stagionale')),
  ore_settimanali numeric(5,2) DEFAULT 40,
  ore_giornaliere numeric(4,2) DEFAULT 8,
  orario_tipo text DEFAULT 'fisso' CHECK (orario_tipo IN ('fisso','turnista','flessibile')),
  sede_id uuid REFERENCES public.hr_sedi(id) ON DELETE SET NULL,
  matricola text,
  livello_ccnl text,
  note text,
  attivo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.hr_profili ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_profili_company ON public.hr_profili(company_id);
CREATE INDEX idx_hr_profili_user ON public.hr_profili(user_id);
CREATE INDEX idx_hr_profili_employee ON public.hr_profili(employee_id);

CREATE POLICY "hr_profili_own_company" ON public.hr_profili FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_profili_super_admin" ON public.hr_profili FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "hr_profili_self_read" ON public.hr_profili FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
ALTER TABLE public.hr_timbrature ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_timbrature_company ON public.hr_timbrature(company_id);
CREATE INDEX idx_hr_timbrature_profilo ON public.hr_timbrature(profilo_id);
CREATE INDEX idx_hr_timbrature_data ON public.hr_timbrature(data_evento);

CREATE POLICY "hr_timbrature_own_company" ON public.hr_timbrature FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_timbrature_super_admin" ON public.hr_timbrature FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "hr_timbrature_self_read" ON public.hr_timbrature FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));

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
ALTER TABLE public.hr_giornate ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_giornate_company ON public.hr_giornate(company_id);
CREATE INDEX idx_hr_giornate_profilo ON public.hr_giornate(profilo_id);
CREATE INDEX idx_hr_giornate_data ON public.hr_giornate(data);

CREATE POLICY "hr_giornate_own_company" ON public.hr_giornate FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_giornate_super_admin" ON public.hr_giornate FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "hr_giornate_self_read" ON public.hr_giornate FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));

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
ALTER TABLE public.hr_richieste ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hr_richieste_company ON public.hr_richieste(company_id);
CREATE INDEX idx_hr_richieste_profilo ON public.hr_richieste(profilo_id);

CREATE POLICY "hr_richieste_own_company" ON public.hr_richieste FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "hr_richieste_super_admin" ON public.hr_richieste FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "hr_richieste_self" ON public.hr_richieste FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));

-- =============================================
-- Function + Trigger: auto-calculate hr_giornate
-- =============================================
CREATE OR REPLACE FUNCTION public.calcola_giornata_hr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data date;
  v_company_id uuid;
  v_profilo_id uuid;
  v_ore_previste numeric(4,2);
  v_prima_entrata time;
  v_ultima_uscita time;
  v_ore_lavorate numeric(4,2);
  v_ore_pausa numeric(4,2);
  v_entrata_rec RECORD;
  v_uscita_rec RECORD;
  v_pausa_inizio_rec RECORD;
  v_pausa_fine_rec RECORD;
BEGIN
  v_data := NEW.data_evento;
  v_company_id := NEW.company_id;
  v_profilo_id := NEW.profilo_id;

  -- Get ore_previste from profilo
  SELECT COALESCE(ore_giornaliere, 8) INTO v_ore_previste
  FROM hr_profili WHERE id = v_profilo_id;

  -- First entry
  SELECT MIN(ora_evento) INTO v_prima_entrata
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'entrata';

  -- Last exit
  SELECT MAX(ora_evento) INTO v_ultima_uscita
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'uscita';

  -- Calculate worked hours (simple: last exit - first entry)
  IF v_prima_entrata IS NOT NULL AND v_ultima_uscita IS NOT NULL THEN
    v_ore_lavorate := EXTRACT(EPOCH FROM (v_ultima_uscita - v_prima_entrata)) / 3600.0;
  ELSE
    v_ore_lavorate := 0;
  END IF;

  -- Calculate pause
  v_ore_pausa := 0;
  FOR v_pausa_inizio_rec IN
    SELECT ora_evento FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_inizio'
    ORDER BY ora_evento
  LOOP
    SELECT ora_evento INTO v_pausa_fine_rec
    FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_fine'
      AND ora_evento > v_pausa_inizio_rec.ora_evento
    ORDER BY ora_evento LIMIT 1;

    IF v_pausa_fine_rec.ora_evento IS NOT NULL THEN
      v_ore_pausa := v_ore_pausa + EXTRACT(EPOCH FROM (v_pausa_fine_rec.ora_evento - v_pausa_inizio_rec.ora_evento)) / 3600.0;
    END IF;
  END LOOP;

  v_ore_lavorate := GREATEST(0, v_ore_lavorate - v_ore_pausa);

  -- Upsert giornata
  INSERT INTO hr_giornate (company_id, profilo_id, data, ore_previste, ore_lavorate, ore_pausa, prima_entrata, ultima_uscita)
  VALUES (v_company_id, v_profilo_id, v_data, v_ore_previste, ROUND(v_ore_lavorate::numeric, 2), ROUND(v_ore_pausa::numeric, 2), v_prima_entrata, v_ultima_uscita)
  ON CONFLICT (profilo_id, data)
  DO UPDATE SET
    ore_lavorate = ROUND(EXCLUDED.ore_lavorate::numeric, 2),
    ore_pausa = ROUND(EXCLUDED.ore_pausa::numeric, 2),
    prima_entrata = EXCLUDED.prima_entrata,
    ultima_uscita = EXCLUDED.ultima_uscita,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calcola_giornata_hr
AFTER INSERT ON public.hr_timbrature
FOR EACH ROW
EXECUTE FUNCTION public.calcola_giornata_hr();
