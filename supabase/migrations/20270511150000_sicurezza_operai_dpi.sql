-- MP-HR-04 — Sicurezza Operai (DPI + Formazione + Idoneità)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.employee_dpi_consegne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  dpi_type text NOT NULL CHECK (dpi_type IN (
    'casco','scarpe_antinfortunistiche','imbragatura','occhiali','guanti',
    'mascherina_ffp','tappi_auricolari','giubbino_alta_visibilita',
    'tuta_chimica','elmetto_arrampicata'
  )),
  dpi_brand text,
  dpi_size text,
  dpi_serial text,

  consegna_date date NOT NULL,
  expiry_date date,

  status text DEFAULT 'in_use' CHECK (status IN ('in_use','damaged','lost','returned','expired')),
  return_date date,

  modulo_consegna_path text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpi_emp_status ON public.employee_dpi_consegne(employee_id, status);
ALTER TABLE public.employee_dpi_consegne ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dpi_company ON public.employee_dpi_consegne;
CREATE POLICY dpi_company ON public.employee_dpi_consegne
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.employee_formations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  formation_type text NOT NULL CHECK (formation_type IN (
    'sicurezza_generale_4h','sicurezza_specifica_12h','sicurezza_ag_4h',
    'ponteggi_pimus','lavori_quota','dpi_terza_categoria',
    'addetto_antincendio','primo_soccorso','rspp','rls',
    'macchine_movimento_terra','gru_torre','piattaforme_aeree'
  )),
  ente_erogante text,
  attestato_path text,
  attestato_numero text,

  data_completamento date NOT NULL,
  data_scadenza date,
  ore_durata int,

  status text DEFAULT 'valid' CHECK (status IN ('valid','expiring_30d','expired','revoked')),

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_emp_scadenza ON public.employee_formations(employee_id, data_scadenza);
ALTER TABLE public.employee_formations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS form_company ON public.employee_formations;
CREATE POLICY form_company ON public.employee_formations
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.employee_visite_mediche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  visita_type text CHECK (visita_type IN ('preventiva','periodica','straordinaria','rientro')),
  data_visita date NOT NULL,
  data_prossima date,

  esito text CHECK (esito IN ('idoneo','idoneo_con_prescrizioni','idoneo_temporaneo','non_idoneo')),
  prescrizioni text,
  certificato_path text,

  medico_competente text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visite_emp_prossima ON public.employee_visite_mediche(employee_id, data_prossima);
ALTER TABLE public.employee_visite_mediche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visite_company ON public.employee_visite_mediche;
CREATE POLICY visite_company ON public.employee_visite_mediche
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- View aggregato compliance
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.employee_safety_status AS
SELECT
  e.id AS employee_id,
  e.company_id,
  (e.first_name || ' ' || e.last_name) AS full_name,
  EXISTS (
    SELECT 1 FROM public.employee_formations f
    WHERE f.employee_id = e.id AND f.formation_type = 'sicurezza_generale_4h'
      AND (f.data_scadenza IS NULL OR f.data_scadenza > current_date)
  ) AS form_generale_ok,
  EXISTS (
    SELECT 1 FROM public.employee_formations f
    WHERE f.employee_id = e.id AND f.formation_type = 'sicurezza_specifica_12h'
      AND (f.data_scadenza IS NULL OR f.data_scadenza > current_date)
  ) AS form_specifica_ok,
  EXISTS (
    SELECT 1 FROM public.employee_visite_mediche v
    WHERE v.employee_id = e.id AND v.esito IN ('idoneo','idoneo_con_prescrizioni')
      AND (v.data_prossima IS NULL OR v.data_prossima > current_date)
  ) AS visita_ok,
  EXISTS (
    SELECT 1 FROM public.employee_dpi_consegne d
    WHERE d.employee_id = e.id AND d.dpi_type = 'casco' AND d.status = 'in_use'
  ) AS casco_ok,
  EXISTS (
    SELECT 1 FROM public.employee_dpi_consegne d
    WHERE d.employee_id = e.id AND d.dpi_type = 'scarpe_antinfortunistiche' AND d.status = 'in_use'
  ) AS scarpe_ok
FROM public.employees e;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_stato_sicurezza_operaio
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_stato_sicurezza_operaio(
  p_company_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.employee_safety_status
   WHERE employee_id = p_employee_id AND company_id = p_company_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'employee_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'employee_id', v_row.employee_id,
    'full_name', v_row.full_name,
    'form_generale_ok', v_row.form_generale_ok,
    'form_specifica_ok', v_row.form_specifica_ok,
    'visita_ok', v_row.visita_ok,
    'casco_ok', v_row.casco_ok,
    'scarpe_ok', v_row.scarpe_ok,
    'compliant', (v_row.form_generale_ok AND v_row.form_specifica_ok AND v_row.visita_ok
                  AND v_row.casco_ok AND v_row.scarpe_ok)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_stato_sicurezza_operaio(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_operai_non_conformi_sicurezza
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_operai_non_conformi_sicurezza(
  p_company_id uuid
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  form_generale_ok boolean,
  form_specifica_ok boolean,
  visita_ok boolean,
  casco_ok boolean,
  scarpe_ok boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.employee_id, s.full_name, s.form_generale_ok, s.form_specifica_ok, s.visita_ok, s.casco_ok, s.scarpe_ok
  FROM public.employee_safety_status s
  WHERE s.company_id = p_company_id
    AND NOT (s.form_generale_ok AND s.form_specifica_ok AND s.visita_ok AND s.casco_ok AND s.scarpe_ok);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_operai_non_conformi_sicurezza(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_formazioni_in_scadenza
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_formazioni_in_scadenza(
  p_company_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS TABLE (
  employee_id uuid,
  formation_type text,
  data_scadenza date,
  giorni_residui int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT f.employee_id, f.formation_type, f.data_scadenza,
    (f.data_scadenza - current_date)::int AS giorni_residui
  FROM public.employee_formations f
  WHERE f.company_id = p_company_id
    AND f.data_scadenza IS NOT NULL
    AND f.data_scadenza <= (current_date + make_interval(days => p_days_ahead))
    AND f.status NOT IN ('expired','revoked')
  ORDER BY f.data_scadenza;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_formazioni_in_scadenza(uuid, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_prenota_formazione_operaio
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_prenota_formazione_operaio(
  p_company_id uuid,
  p_employee_id uuid,
  p_formation_type text,
  p_ente_erogante text DEFAULT NULL,
  p_data_completamento date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.employee_formations(
    company_id, employee_id, formation_type, ente_erogante, data_completamento, status
  )
  VALUES (p_company_id, p_employee_id, p_formation_type, p_ente_erogante, p_data_completamento, 'valid')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'formation_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_prenota_formazione_operaio(uuid, uuid, text, text, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_modulo_consegna_dpi
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_modulo_consegna_dpi(
  p_company_id uuid,
  p_employee_id uuid,
  p_dpi_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inserted int := 0; v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_dpi_items) LOOP
    INSERT INTO public.employee_dpi_consegne(
      company_id, employee_id, dpi_type, dpi_brand, dpi_size, dpi_serial, consegna_date, expiry_date
    )
    VALUES (
      p_company_id, p_employee_id,
      v_item->>'dpi_type', v_item->>'dpi_brand', v_item->>'dpi_size', v_item->>'dpi_serial',
      COALESCE((v_item->>'consegna_date')::date, current_date),
      (v_item->>'expiry_date')::date
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'employee_id', p_employee_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_modulo_consegna_dpi(uuid, uuid, jsonb) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_blocca_operaio_da_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_blocca_operaio_da_cantiere(
  p_company_id uuid,
  p_employee_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.employees SET is_active = false
   WHERE id = p_employee_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'blocked', true,
    'reason', p_reason,
    'note', 'is_active=false: l''operaio non sarà allocabile finché compliance ripristinata.'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_blocca_operaio_da_cantiere(uuid, uuid, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-HR-04 deployed: dpi/formations/visite + view + 6 RPC'; END $$;
