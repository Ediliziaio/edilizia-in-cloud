-- MP-CG-11 — Posizione Finanziaria Netta (PFN) + Aging crediti/debiti
--
-- PFN = (Mutui MLT + Banche scoperte + Altri debiti finanziari)
--     - (Cassa + Banche positive)
-- Aging = scadenze NON pagate raggruppate per fasce (corrente, 30, 60, 90, >90)

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_get_pfn — Posizione Finanziaria Netta + componenti
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_pfn(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      uuid;
  v_cassa           numeric(14,2) := 0;
  v_banche_positive numeric(14,2) := 0;
  v_banche_negative numeric(14,2) := 0;
  v_mutui_mlt       numeric(14,2) := 0;
  v_pfn             numeric(14,2);
  v_pfn_serie       jsonb := '[]'::jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Cassa + banche positive (current snapshot)
  SELECT COALESCE(sum(GREATEST(COALESCE(ba.current_balance, 0), 0)), 0),
         COALESCE(sum(ABS(LEAST(COALESCE(ba.current_balance, 0), 0))), 0)
  INTO v_banche_positive, v_banche_negative
  FROM public.bank_accounts ba
  WHERE ba.company_id = v_company_id AND ba.is_active = true;

  -- Cassa: oggi non abbiamo una tabella cassa fisica; uso 0.
  v_cassa := 0;

  -- Mutui MLT residui (capitale_residuo dei loan attivi)
  SELECT COALESCE(sum(capitale_residuo), 0) INTO v_mutui_mlt
  FROM public.cg_loans
  WHERE company_id = v_company_id AND is_active = true;

  v_pfn := (v_mutui_mlt + v_banche_negative) - (v_cassa + v_banche_positive);

  -- Mini serie per chart: PFN ipotetica fine anno = PFN attuale
  -- (Estensione futura: serie storica dai snapshot mensili)
  v_pfn_serie := jsonb_build_array(
    jsonb_build_object('label', 'Oggi', 'pfn', v_pfn)
  );

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'generato_il', now()
    ),
    'pfn', v_pfn,
    'componenti', jsonb_build_object(
      'cassa', v_cassa,
      'banche_positive', v_banche_positive,
      'banche_negative', v_banche_negative,
      'mutui_mlt', v_mutui_mlt
    ),
    'serie', v_pfn_serie
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_pfn FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_pfn TO authenticated;

COMMENT ON FUNCTION public.cg_get_pfn IS
  'Posizione Finanziaria Netta = (Mutui MLT + Banche -) - (Cassa + Banche +).';

CREATE OR REPLACE FUNCTION public.cg_get_pfn_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_pfn(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_pfn_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_pfn_safe TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_get_aging — Aging crediti/debiti
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fasce:
--   • A_scadere (due_date >= oggi)
--   • Scaduto_30  (1-30 gg di ritardo)
--   • Scaduto_60  (31-60)
--   • Scaduto_90  (61-90)
--   • Scaduto_oltre (>90)

CREATE OR REPLACE FUNCTION public.cg_get_aging(
  p_company_id uuid DEFAULT NULL,
  p_direction  text DEFAULT 'out'  -- 'out' = debiti / 'in' = crediti
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_oggi       date := current_date;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  WITH dovuto AS (
    SELECT s.id,
           s.description,
           s.due_date,
           s.amount - COALESCE(s.paid_amount, 0) AS residuo,
           s.supplier_id,
           s.contact_id,
           CASE
             WHEN s.due_date >= v_oggi THEN 'a_scadere'
             WHEN v_oggi - s.due_date BETWEEN 1 AND 30  THEN 'sc_30'
             WHEN v_oggi - s.due_date BETWEEN 31 AND 60 THEN 'sc_60'
             WHEN v_oggi - s.due_date BETWEEN 61 AND 90 THEN 'sc_90'
             ELSE 'sc_oltre'
           END AS fascia
    FROM public.scadenze s
    WHERE s.company_id = v_company_id
      AND s.direction = p_direction
      AND s.status NOT IN ('paid','cancelled')
      AND (s.amount - COALESCE(s.paid_amount, 0)) > 0
  ),
  totali AS (
    SELECT
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'a_scadere'), 0) AS a_scadere,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_30'),     0) AS sc_30,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_60'),     0) AS sc_60,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_90'),     0) AS sc_90,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_oltre'),  0) AS sc_oltre,
      count(*) AS n_aperte,
      count(*) FILTER (WHERE fascia <> 'a_scadere') AS n_scadute
    FROM dovuto
  ),
  righe AS (
    SELECT jsonb_agg(jsonb_build_object(
              'id',          d.id,
              'descrizione', d.description,
              'due_date',    d.due_date,
              'residuo',     d.residuo,
              'fascia',      d.fascia,
              'controparte', COALESCE(s.name, c.first_name || ' ' || c.last_name)
           ) ORDER BY d.due_date ASC) AS items
    FROM dovuto d
    LEFT JOIN public.suppliers s ON s.id = d.supplier_id
    LEFT JOIN public.contacts  c ON c.id = d.contact_id
  )
  SELECT jsonb_build_object(
    'direction',  p_direction,
    'totale',     (a_scadere + sc_30 + sc_60 + sc_90 + sc_oltre),
    'totale_scaduto', (sc_30 + sc_60 + sc_90 + sc_oltre),
    'fasce', jsonb_build_object(
      'a_scadere', a_scadere,
      'sc_30',     sc_30,
      'sc_60',     sc_60,
      'sc_90',     sc_90,
      'sc_oltre',  sc_oltre
    ),
    'n_aperte',   n_aperte,
    'n_scadute',  n_scadute,
    'righe',      COALESCE((SELECT items FROM righe), '[]'::jsonb)
  ) INTO v_result FROM totali;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_aging FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_aging TO authenticated;

COMMENT ON FUNCTION public.cg_get_aging IS
  'Aging scadenze: distribuzione del residuo per fasce (a_scadere/30/60/90/oltre).';

CREATE OR REPLACE FUNCTION public.cg_get_aging_safe(p_direction text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_aging(v_company_id, p_direction);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_aging_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_aging_safe TO authenticated;
