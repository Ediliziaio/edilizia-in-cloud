-- MP-HR-02 — Cedolini + Presenze Automatici
-- ════════════════════════════════════════════════════════════════════════════
-- Estende hr_cedolini con AI metadata + breakdown ore (ordinarie/straordinari/
-- assenze/indennità). Crea hr_assenze (ferie/permessi/malattia/infortunio).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione hr_cedolini
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.hr_cedolini
  ADD COLUMN IF NOT EXISTS generation_method text NOT NULL DEFAULT 'manual'
    CHECK (generation_method IN ('manual','auto_ai','imported')),
  ADD COLUMN IF NOT EXISTS ai_persona_used text DEFAULT 'hr',
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2),

  -- Aggregati origine
  ADD COLUMN IF NOT EXISTS source_rapportini_ids uuid[],

  -- Breakdown ore dettagliato
  ADD COLUMN IF NOT EXISTS ore_ordinarie numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_25 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_50 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_straordinario_100 numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_assenza_giustificate numeric(6,2),
  ADD COLUMN IF NOT EXISTS ore_assenza_non_giustificate numeric(6,2),

  -- Indennità CCNL Edile
  ADD COLUMN IF NOT EXISTS indennita_trasferta_eur numeric(8,2),
  ADD COLUMN IF NOT EXISTS indennita_alta_quota_eur numeric(8,2),
  ADD COLUMN IF NOT EXISTS indennita_disagio_eur numeric(8,2),

  -- Validazione consulente
  ADD COLUMN IF NOT EXISTS consulente_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS consulente_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validation_warnings jsonb;

CREATE INDEX IF NOT EXISTS idx_cedolini_pending_review
  ON public.hr_cedolini(company_id, anno, mese)
  WHERE generation_method = 'auto_ai' AND consulente_reviewed_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) hr_assenze (ferie/permessi/malattia/infortunio)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hr_assenze (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  data_inizio     date NOT NULL,
  data_fine       date NOT NULL,
  ore_giorno      numeric(4,2) NOT NULL DEFAULT 8,

  tipo_assenza    text NOT NULL CHECK (tipo_assenza IN (
    'ferie','permesso_retribuito','malattia','infortunio','maternita',
    'congedo_studio','sciopero','permesso_legge_104','rol','altro'
  )),

  giustificativo_storage_path text,
  note            text,

  approved_at     timestamptz,
  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Workflow
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fine >= data_inizio)
);

CREATE INDEX IF NOT EXISTS idx_assenze_employee
  ON public.hr_assenze(employee_id, data_inizio DESC);
CREATE INDEX IF NOT EXISTS idx_assenze_company_period
  ON public.hr_assenze(company_id, data_inizio, data_fine) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_assenze_pending
  ON public.hr_assenze(company_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE public.hr_assenze ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_assenze_self_read ON public.hr_assenze;
CREATE POLICY hr_assenze_self_read ON public.hr_assenze FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = hr_assenze.employee_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS hr_assenze_admin ON public.hr_assenze;
CREATE POLICY hr_assenze_admin ON public.hr_assenze FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS hr_assenze_super_admin ON public.hr_assenze;
CREATE POLICY hr_assenze_super_admin ON public.hr_assenze FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_hr_assenze_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hr_assenze_updated_at ON public.hr_assenze;
CREATE TRIGGER trg_hr_assenze_updated_at
  BEFORE UPDATE ON public.hr_assenze
  FOR EACH ROW EXECUTE FUNCTION public.tg_hr_assenze_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_calcola_ore_mese_dipendente
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_calcola_ore_mese_dipendente(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_year int,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_ore_ferie numeric := 0;
  v_ore_malattia numeric := 0;
  v_ore_permesso numeric := 0;
  v_ore_104 numeric := 0;
BEGIN
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  -- Aggrega ore assenze approvate
  SELECT
    COALESCE(SUM(ore_giorno * (LEAST(data_fine, v_period_end) - GREATEST(data_inizio, v_period_start) + 1))
      FILTER (WHERE tipo_assenza = 'ferie'), 0),
    COALESCE(SUM(ore_giorno * (LEAST(data_fine, v_period_end) - GREATEST(data_inizio, v_period_start) + 1))
      FILTER (WHERE tipo_assenza IN ('malattia','infortunio')), 0),
    COALESCE(SUM(ore_giorno * (LEAST(data_fine, v_period_end) - GREATEST(data_inizio, v_period_start) + 1))
      FILTER (WHERE tipo_assenza IN ('permesso_retribuito','rol')), 0),
    COALESCE(SUM(ore_giorno * (LEAST(data_fine, v_period_end) - GREATEST(data_inizio, v_period_start) + 1))
      FILTER (WHERE tipo_assenza = 'permesso_legge_104'), 0)
  INTO v_ore_ferie, v_ore_malattia, v_ore_permesso, v_ore_104
  FROM public.hr_assenze
  WHERE employee_id = p_employee_id
    AND status = 'approved'
    AND data_inizio <= v_period_end
    AND data_fine >= v_period_start;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'year', p_year,
    'month', p_month,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'ore_ferie', v_ore_ferie,
    'ore_malattia_infortunio', v_ore_malattia,
    'ore_permesso_retribuito', v_ore_permesso,
    'ore_legge_104', v_ore_104,
    'ore_totali_assenze', v_ore_ferie + v_ore_malattia + v_ore_permesso + v_ore_104,
    'note', 'Aggregati da hr_assenze approvate. Per ore lavorate effettive integrare con rapportini se disponibili.'
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_calcola_ore_mese_dipendente(uuid, uuid, uuid, int, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_calcola_ore_mese_dipendente(uuid, uuid, uuid, int, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_genera_cedolino_dipendente (placeholder + idempotenza)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_genera_cedolino_dipendente(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_year int,
  p_month int,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_existing_id uuid;
BEGIN
  SELECT id, company_id, retribuzione_lorda_annua, ore_settimana INTO v_emp
    FROM public.employees WHERE id = p_employee_id;

  IF v_emp IS NULL OR v_emp.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Dipendente non trovato');
  END IF;

  -- Idempotenza
  SELECT id INTO v_existing_id
    FROM public.hr_cedolini
   WHERE employee_id = p_employee_id AND anno = p_year AND mese = p_month
   LIMIT 1;

  IF v_existing_id IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object(
      'success', true,
      'cedolino_id', v_existing_id,
      'already_exists', true,
      'message', format('Cedolino %s/%s già presente', p_month, p_year)
    );
  END IF;

  -- Crea/aggiorna placeholder. Edge function genera-cedolino-pdf-async farà
  -- aggregazione ore + AI compose + calcolo ritenute.
  INSERT INTO public.hr_cedolini (
    company_id, employee_id, anno, mese,
    generation_method, ai_persona_used, stato
  ) VALUES (
    p_company_id, p_employee_id, p_year, p_month,
    'auto_ai', 'hr', 'draft'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_existing_id;

  IF v_existing_id IS NULL THEN
    SELECT id INTO v_existing_id
      FROM public.hr_cedolini
     WHERE employee_id = p_employee_id AND anno = p_year AND mese = p_month
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cedolino_id', v_existing_id,
    'pending', true,
    'employee_id', p_employee_id,
    'anno', p_year,
    'mese', p_month,
    'message', format('Cedolino %s/%s in elaborazione', p_month, p_year)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_genera_cedolino_dipendente(uuid, uuid, uuid, int, int, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_cedolino_dipendente(uuid, uuid, uuid, int, int, boolean)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_cedolini_da_revisionare
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_cedolini_da_revisionare(
  p_company_id uuid,
  p_user_id uuid,
  p_year int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'cedolini', COALESCE(jsonb_agg(
      jsonb_build_object(
        'cedolino_id', c.id,
        'employee_id', c.employee_id,
        'employee_name', COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,''),
        'anno', c.anno,
        'mese', c.mese,
        'lordo', c.lordo,
        'netto', c.netto,
        'ore_lavorate', c.ore_lavorate,
        'ore_straordinario', c.ore_straordinario,
        'ore_ordinarie', c.ore_ordinarie,
        'stato', c.stato,
        'has_warnings', c.validation_warnings IS NOT NULL AND jsonb_array_length(c.validation_warnings) > 0,
        'created_at', c.created_at
      ) ORDER BY c.anno DESC, c.mese DESC, e.last_name ASC
    ) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.hr_cedolini c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE c.company_id = p_company_id
    AND c.generation_method = 'auto_ai'
    AND c.consulente_reviewed_at IS NULL
    AND (p_year IS NULL OR c.anno = p_year)
    AND (p_month IS NULL OR c.mese = p_month);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'cedolini', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_cedolini_da_revisionare(uuid, uuid, int, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_cedolini_da_revisionare(uuid, uuid, int, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_registra_assenza
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_registra_assenza(
  p_company_id uuid,
  p_user_id uuid,
  p_employee_id uuid,
  p_data_inizio date,
  p_data_fine date,
  p_tipo_assenza text,
  p_ore_giorno numeric DEFAULT 8,
  p_note text DEFAULT NULL,
  p_giustificativo_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.hr_assenze (
    company_id, employee_id, data_inizio, data_fine,
    tipo_assenza, ore_giorno, note, giustificativo_storage_path
  ) VALUES (
    p_company_id, p_employee_id, p_data_inizio, p_data_fine,
    p_tipo_assenza, p_ore_giorno, p_note, p_giustificativo_path
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'assenza_id', v_id,
    'tipo', p_tipo_assenza,
    'data_inizio', p_data_inizio,
    'data_fine', p_data_fine,
    'message', format('Assenza %s dal %s al %s registrata (status: pending)',
      p_tipo_assenza, p_data_inizio, p_data_fine)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_registra_assenza(uuid, uuid, uuid, date, date, text, numeric, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_registra_assenza(uuid, uuid, uuid, date, date, text, numeric, text, text)
  TO service_role;
