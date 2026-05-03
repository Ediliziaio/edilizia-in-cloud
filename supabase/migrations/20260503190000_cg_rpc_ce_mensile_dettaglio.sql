-- MP-CG audit — RPC per la vista CE Riclassificato mensile (cascata x 12 mesi).
-- Ritorna l'intera struttura del CE per ognuno dei 12 mesi richiesti, così la
-- UI può mostrare "Gen | Feb | Mar | ... | Dic" per ogni voce.

CREATE OR REPLACE FUNCTION public.cg_get_ce_mensile_dettaglio(
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
  v_mese int;
  v_mese_data jsonb;
  v_mesi jsonb := '[]'::jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;
  PERFORM public._cg_assert_enabled(v_company_id);

  -- 12 chiamate: una per mese. Riusa la RPC base che applica override e
  -- classificazione corretta. La performance è ~100-200ms su demo.
  FOR v_mese IN 1..12 LOOP
    v_mese_data := public.cg_get_conto_economico_riclassificato(
      v_company_id, p_anno, v_mese, v_mese, 'consuntivo'
    );
    v_mesi := v_mesi || jsonb_build_array(jsonb_build_object(
      'mese', v_mese,
      'voci', v_mese_data->'voci'
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'generato_il', now()
    ),
    'mesi', v_mesi
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_ce_mensile_dettaglio TO authenticated;
COMMENT ON FUNCTION public.cg_get_ce_mensile_dettaglio IS
  'CE riclassificato mese per mese: 12 cascate complete (Gen..Dic). Per la vista mensile della UI.';
