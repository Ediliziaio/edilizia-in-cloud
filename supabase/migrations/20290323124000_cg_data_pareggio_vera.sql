-- Controllo di Gestione: la data del pareggio (14/11/2026).
--
-- cg_get_bep divideva i ricavi dell'anno per 365 anche per l'anno in corso:
-- con i ricavi fermi al 14/11 il ritmo giornaliero era sottostimato e la data
-- veniva dopo quella vera (Demo Azienda 2: 07/10, mentre i ricavi cumulati
-- avevano passato la soglia a metà agosto).
--
-- Ora: se i ricavi cumulati hanno già passato il fatturato di pareggio, la data
-- è il primo giorno in cui succede; altrimenti, per l'anno in corso, si proietta
-- col ritmo dei giorni già passati. Un anno chiuso che non l'ha raggiunto non ha
-- data. Il resto della funzione è invariato.

CREATE OR REPLACE FUNCTION public.cg_get_bep(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_ricavi numeric;
  v_costi_var numeric;
  v_costi_fissi numeric;
  v_mdc_pct numeric;
  v_bep_eur numeric;
  v_bep_pct numeric;
  v_giorno int;
  v_data date;
  v_inizio date := make_date(p_anno, 1, 1);
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_giorni_passati int;
BEGIN
  PERFORM public._cg_assert_lettura(p_company_id);
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  SELECT COALESCE(sum(importo_imponibile), 0) INTO v_ricavi
  FROM public.v_cg_ricavi_classificati
  WHERE company_id = v_company_id AND anno = p_anno;

  SELECT
    COALESCE(sum(importo) FILTER (WHERE tipo = 'F'), 0),
    COALESCE(sum(importo) FILTER (WHERE tipo = 'V'), 0)
  INTO v_costi_fissi, v_costi_var
  FROM public.v_cg_costi_classificati
  WHERE company_id = v_company_id AND anno = p_anno;

  v_mdc_pct := CASE WHEN v_ricavi > 0
                    THEN ((v_ricavi - v_costi_var) / v_ricavi) * 100
                    ELSE 0 END;

  v_bep_eur := CASE WHEN v_mdc_pct > 0
                    THEN v_costi_fissi / (v_mdc_pct / 100)
                    ELSE NULL END;

  v_bep_pct := CASE WHEN v_ricavi > 0 AND v_bep_eur IS NOT NULL
                    THEN (v_bep_eur / v_ricavi) * 100
                    ELSE NULL END;

  IF v_bep_eur IS NOT NULL THEN
    -- il primo giorno in cui i ricavi cumulati arrivano al pareggio
    SELECT g.data INTO v_data
      FROM (
        SELECT r.data, sum(sum(r.importo_imponibile)) OVER (ORDER BY r.data) AS cumulato
          FROM public.v_cg_ricavi_classificati r
         WHERE r.company_id = v_company_id AND r.anno = p_anno
         GROUP BY r.data
      ) g
     WHERE g.cumulato >= v_bep_eur
     ORDER BY g.data
     LIMIT 1;

    -- non ancora raggiunto: per l'anno in corso, al ritmo dei giorni passati
    IF v_data IS NULL AND p_anno = extract(year from v_oggi)::int AND v_ricavi > 0 THEN
      v_giorni_passati := greatest(v_oggi - v_inizio + 1, 1);
      v_data := v_oggi + ceil((v_bep_eur - v_ricavi) / (v_ricavi / v_giorni_passati))::int;
    END IF;
  END IF;

  v_giorno := CASE WHEN v_data IS NOT NULL THEN (v_data - v_inizio) + 1 ELSE NULL END;

  RETURN jsonb_build_object(
    'anno', p_anno,
    'ricavi_consuntivi', v_ricavi,
    'costi_fissi', v_costi_fissi,
    'costi_variabili', v_costi_var,
    'margine_contribuzione_pct', round(v_mdc_pct, 2),
    'bep_fatturato_minimo', round(v_bep_eur, 2),
    'bep_pct_fatturato', round(v_bep_pct, 2),
    'bep_giorno_anno', v_giorno,
    'bep_data', v_data,
    'gia_raggiunto', v_data IS NOT NULL AND v_data <= v_oggi,
    'giorni_residui', CASE WHEN v_data IS NOT NULL
                            THEN (v_data - v_oggi)::int ELSE NULL END
  );
END;
$function$;
