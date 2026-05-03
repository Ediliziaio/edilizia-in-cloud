-- MP-CG-15 — IRES + IRAP separate
--
-- Patch del CE riclassificato: dove prima c'era una sola voce "Imposte stimate"
-- al 27.5% applicato in blocco, adesso le calcoliamo separate:
--   • IRES 24% sull'utile ante imposte (proxy di base imponibile)
--   • IRAP 3.9% sul valore della produzione netta (proxy = EBIT + costo personale)
--
-- Tabella di parametri per personalizzare le aliquote per company.

CREATE TABLE IF NOT EXISTS public.cg_aliquote_imposte (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  ires_pct     numeric(5,2) NOT NULL DEFAULT 24.00,
  irap_pct     numeric(5,2) NOT NULL DEFAULT 3.90,
  addizionale_ires_pct numeric(5,2) NOT NULL DEFAULT 0.00, -- es. addizionale 3.5% banche/asssic
  base_irap_include_personale boolean NOT NULL DEFAULT true,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cg_aliquote_imposte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_aliquote_select ON public.cg_aliquote_imposte;
CREATE POLICY cg_aliquote_select ON public.cg_aliquote_imposte FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_aliquote_insert ON public.cg_aliquote_imposte;
CREATE POLICY cg_aliquote_insert ON public.cg_aliquote_imposte FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_aliquote_update ON public.cg_aliquote_imposte;
CREATE POLICY cg_aliquote_update ON public.cg_aliquote_imposte FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_aliquote_updated_at ON public.cg_aliquote_imposte;
CREATE TRIGGER trg_cg_aliquote_updated_at
  BEFORE UPDATE ON public.cg_aliquote_imposte
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.cg_aliquote_imposte IS
  'Aliquote IRES/IRAP per company (default IRES 24% IRAP 3.9%).';

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: cg_get_imposte_dettaglio — separa IRES + IRAP
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_imposte_dettaglio(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_ce         jsonb;
  v_utile_ai   numeric;
  v_ebit       numeric;
  v_costo_pers numeric;
  v_ires_pct   numeric;
  v_irap_pct   numeric;
  v_add_ires_pct numeric;
  v_base_irap_inc_pers boolean;
  v_base_ires  numeric;
  v_base_irap  numeric;
  v_ires       numeric;
  v_addizionale numeric;
  v_irap       numeric;
  v_imposte_tot numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Aliquote (con default)
  SELECT ires_pct, irap_pct, addizionale_ires_pct, base_irap_include_personale
  INTO v_ires_pct, v_irap_pct, v_add_ires_pct, v_base_irap_inc_pers
  FROM public.cg_aliquote_imposte
  WHERE company_id = v_company_id;

  IF v_ires_pct IS NULL THEN
    v_ires_pct := 24.00;
    v_irap_pct := 3.90;
    v_add_ires_pct := 0.00;
    v_base_irap_inc_pers := true;
  END IF;

  -- CE
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);

  SELECT (v->>'valore')::numeric INTO v_utile_ai
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'I';
  SELECT (v->>'valore')::numeric INTO v_ebit
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'F';
  SELECT (v->>'valore')::numeric INTO v_costo_pers
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '06';

  -- IRES: base = utile ante imposte (positivo)
  v_base_ires := GREATEST(COALESCE(v_utile_ai, 0), 0);
  v_ires := round(v_base_ires * v_ires_pct / 100, 2);
  v_addizionale := round(v_base_ires * v_add_ires_pct / 100, 2);

  -- IRAP: base = valore produzione netta ≈ EBIT + costo personale
  -- (semplificato: in realtà IRAP esclude oneri finanziari ma li include in modo
  -- complesso; per controllo di gestione questa approssimazione va bene)
  v_base_irap := COALESCE(v_ebit, 0)
                 + CASE WHEN v_base_irap_inc_pers THEN COALESCE(v_costo_pers, 0) ELSE 0 END;
  v_base_irap := GREATEST(v_base_irap, 0);
  v_irap := round(v_base_irap * v_irap_pct / 100, 2);

  v_imposte_tot := v_ires + v_addizionale + v_irap;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'generato_il', now()
    ),
    'aliquote', jsonb_build_object(
      'ires_pct',     v_ires_pct,
      'irap_pct',     v_irap_pct,
      'addizionale_ires_pct', v_add_ires_pct,
      'base_irap_include_personale', v_base_irap_inc_pers
    ),
    'ires', jsonb_build_object(
      'base_imponibile', v_base_ires,
      'aliquota',        v_ires_pct,
      'imposta',         v_ires
    ),
    'addizionale', jsonb_build_object(
      'base_imponibile', v_base_ires,
      'aliquota',        v_add_ires_pct,
      'imposta',         v_addizionale
    ),
    'irap', jsonb_build_object(
      'base_imponibile', v_base_irap,
      'aliquota',        v_irap_pct,
      'imposta',         v_irap
    ),
    'totali', jsonb_build_object(
      'imposte_totali',  v_imposte_tot,
      'utile_ante',      v_utile_ai,
      'utile_post',      COALESCE(v_utile_ai, 0) - v_imposte_tot,
      'tax_rate_eff_pct', CASE WHEN v_utile_ai > 0
                                THEN round((v_imposte_tot / v_utile_ai) * 100, 2)
                                ELSE NULL END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_imposte_dettaglio FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_imposte_dettaglio TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_imposte_dettaglio_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_imposte_dettaglio(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_imposte_dettaglio_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_imposte_dettaglio_safe TO authenticated;
