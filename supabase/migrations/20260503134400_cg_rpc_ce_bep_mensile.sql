-- MP-CG-02 — RPC CE Riclassificato + BEP + Mensile
-- (signature adattata ai nomi reali: get_my_company_id, has_role, cedolini.mese/anno, ecc.)

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_get_conto_economico_riclassificato — JSONB con 24 voci
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_conto_economico_riclassificato(
  p_company_id uuid    DEFAULT NULL,
  p_anno       int     DEFAULT extract(year from current_date)::int,
  p_mese_da    int     DEFAULT 1,
  p_mese_a     int     DEFAULT 12,
  p_modalita   text    DEFAULT 'consuntivo'  -- 'consuntivo' | 'ytd' | 'previsionale'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_ricavi numeric(14,2) := 0;
  v_var_rim_lic numeric(14,2) := 0;
  v_pil numeric(14,2);
  v_acquisti numeric(14,2) := 0;
  v_var_rim_mag numeric(14,2) := 0;
  v_costo_mp numeric(14,2);
  v_costi_prod numeric(14,2) := 0;
  v_costo_vend numeric(14,2);
  v_i_margine numeric(14,2);
  v_costo_pers numeric(14,2) := 0;
  v_costo_pers_cedolini numeric(14,2) := 0;
  v_has_cedolini boolean := false;
  v_costi_comm numeric(14,2) := 0;
  v_costi_amm numeric(14,2) := 0;
  v_ebitda numeric(14,2);
  v_amm numeric(14,2) := 0;
  v_ebit numeric(14,2);
  v_oneri_trib numeric(14,2) := 0;
  v_ris_op numeric(14,2);
  v_oneri_fin numeric(14,2) := 0;
  v_prov_fin numeric(14,2) := 0;
  v_ris_gest numeric(14,2);
  v_ricavi_ex numeric(14,2) := 0;
  v_costi_ex numeric(14,2) := 0;
  v_utile_ai numeric(14,2);
  v_imposte numeric(14,2);
  v_utile numeric(14,2);
  v_aliquota numeric(5,2) := 27.50;
BEGIN
  -- Risolvi company: se non passato, usa quella dell'utente.
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;

  -- Guard cross-tenant: l'utente non può leggere CE di un'altra azienda
  -- (eccezione super_admin).
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato: company_id non autorizzato';
  END IF;

  -- ── 1. Ricavi (da fatture emesse) ───────────────────────────────────────
  SELECT COALESCE(sum(importo_imponibile), 0) INTO v_ricavi
  FROM public.v_cg_ricavi_classificati
  WHERE company_id = v_company_id
    AND anno = p_anno
    AND mese BETWEEN p_mese_da AND p_mese_a;

  -- ── 2. Variazione rimanenze (lavori in corso + magazzino) ──────────────
  -- Stub: nello schema attuale non esistono campi `importo_realizzato` /
  -- `importo_fatturato` su `orders` né tabella `inventory`. Manteniamo le
  -- voci in struttura con valore 0 — verranno popolate quando il modello
  -- rimanenze sarà introdotto.
  v_var_rim_lic := 0;
  v_var_rim_mag := 0;

  v_pil := v_ricavi + v_var_rim_lic;

  -- ── 3-14. Costi classificati + override per macro_voce ─────────────────
  WITH costi_base AS (
    SELECT macro_voce, sum(importo) AS tot
    FROM public.v_cg_costi_classificati
    WHERE company_id = v_company_id
      AND anno = p_anno
      AND mese BETWEEN p_mese_da AND p_mese_a
      AND macro_voce IS NOT NULL
    GROUP BY macro_voce
  ),
  override_anno AS (
    SELECT cv.macro_voce, sum(o.importo_override) AS tot
    FROM public.ce_riclassificato_overrides o
    JOIN public.cg_classificazione_voci cv
      ON cv.voce_chiave = o.voce_chiave
     AND cv.company_id = o.company_id
    WHERE o.company_id = v_company_id
      AND o.esercizio = p_anno
      AND (o.mese IS NULL OR o.mese BETWEEN p_mese_da AND p_mese_a)
    GROUP BY cv.macro_voce
  ),
  totali AS (
    SELECT cb.macro_voce, cb.tot + COALESCE(oa.tot, 0) AS valore
    FROM costi_base cb
    LEFT JOIN override_anno oa ON oa.macro_voce = cb.macro_voce
    UNION ALL
    -- Override su macro_voce che non hanno costi_base nel periodo
    SELECT oa.macro_voce, oa.tot
    FROM override_anno oa
    LEFT JOIN costi_base cb ON cb.macro_voce = oa.macro_voce
    WHERE cb.macro_voce IS NULL
  )
  SELECT
    COALESCE(sum(valore) FILTER (WHERE macro_voce='acquisti_materie'),    0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='costi_produttivi'),    0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='costo_personale'),     0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='costi_commerciali'),   0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='costi_amministrativi'),0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='oneri_tributari'),     0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='oneri_finanziari'),    0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='proventi_finanziari'), 0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='ricavi_extra'),        0),
    COALESCE(sum(valore) FILTER (WHERE macro_voce='costi_extra'),         0)
  INTO v_acquisti, v_costi_prod, v_costo_pers, v_costi_comm,
       v_costi_amm, v_oneri_trib, v_oneri_fin, v_prov_fin,
       v_ricavi_ex, v_costi_ex
  FROM totali;

  -- ── Costo personale: preferenza ai cedolini reali se presenti ──────────
  SELECT EXISTS(
    SELECT 1 FROM public.cedolini
     WHERE company_id = v_company_id AND anno = p_anno
  ) INTO v_has_cedolini;

  IF v_has_cedolini THEN
    SELECT COALESCE(sum(COALESCE(lordo, 0) + COALESCE(contributi_datore, 0)), 0)
    INTO v_costo_pers_cedolini
    FROM public.cedolini
    WHERE company_id = v_company_id
      AND anno = p_anno
      AND mese BETWEEN p_mese_da AND p_mese_a
      AND stato IN ('emesso','pagato');
    -- Sostituisce SOLO se i cedolini sommano qualcosa (anti-bug "0" su anni vuoti).
    IF v_costo_pers_cedolini > 0 THEN
      v_costo_pers := v_costo_pers_cedolini;
    END IF;
  END IF;

  -- ── 9. Ammortamenti pro-quota dei mesi richiesti ────────────────────────
  WITH amm_anno AS (
    SELECT
      CASE
        WHEN c.aliquota_amm > 0
          THEN c.costo_storico * (c.aliquota_amm / 100.0)
        WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0
          THEN c.costo_storico / (c.vita_utile_mesi / 12.0)
        ELSE 0
      END AS quota_annua
    FROM public.cespiti c
    WHERE c.company_id = v_company_id
      AND c.is_active
      AND c.data_acquisto <= make_date(p_anno, p_mese_a, 28)
      AND (c.data_dismissione IS NULL OR c.data_dismissione >= make_date(p_anno, p_mese_da, 1))
  )
  SELECT COALESCE(sum(quota_annua * (p_mese_a - p_mese_da + 1) / 12.0), 0)
  INTO v_amm
  FROM amm_anno;

  -- ── Cascata calcolo ─────────────────────────────────────────────────────
  v_costo_mp   := v_acquisti + COALESCE(v_var_rim_mag, 0);
  v_costo_vend := v_costo_mp + v_costi_prod;
  v_i_margine  := v_pil - v_costo_vend;
  v_ebitda     := v_i_margine - v_costo_pers - v_costi_comm - v_costi_amm;
  v_ebit       := v_ebitda - v_amm;
  v_ris_op     := v_ebit - v_oneri_trib;
  v_ris_gest   := v_ris_op - v_oneri_fin + v_prov_fin;
  v_utile_ai   := v_ris_gest + v_ricavi_ex - v_costi_ex;
  v_imposte    := CASE WHEN v_utile_ai > 0 THEN v_utile_ai * v_aliquota / 100 ELSE 0 END;
  v_utile      := v_utile_ai - v_imposte;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'mese_da', p_mese_da,
      'mese_a', p_mese_a,
      'modalita', p_modalita,
      'has_cedolini', v_has_cedolini,
      'aliquota_imposte_pct', v_aliquota,
      'generato_il', now()
    ),
    'voci', jsonb_build_array(
      jsonb_build_object('codice','01','label','Ricavi delle vendite','tipo','voce','valore', v_ricavi),
      jsonb_build_object('codice','02','label','Variazione rim. lav. in corso','tipo','voce','valore', v_var_rim_lic),
      jsonb_build_object('codice','A', 'label','PRODOTTO INTERNO LORDO','tipo','subtot','valore', v_pil),
      jsonb_build_object('codice','03','label','Acquisti materie','tipo','voce','valore', v_acquisti),
      jsonb_build_object('codice','04','label','Variazione rim. magazzino','tipo','voce','valore', v_var_rim_mag),
      jsonb_build_object('codice','B', 'label','COSTO MATERIE PRIME','tipo','subtot','valore', v_costo_mp),
      jsonb_build_object('codice','05','label','Costi produttivi','tipo','voce','valore', v_costi_prod),
      jsonb_build_object('codice','C', 'label','COSTO DEL VENDUTO','tipo','subtot','valore', v_costo_vend),
      jsonb_build_object('codice','D', 'label','I MARGINE OPERATIVO','tipo','subtot','valore', v_i_margine,
                        'pct_pil', round((v_i_margine/NULLIF(v_pil,0))*100, 2)),
      jsonb_build_object('codice','06','label','Costo del personale','tipo','voce','valore', v_costo_pers),
      jsonb_build_object('codice','07','label','Costi commerciali','tipo','voce','valore', v_costi_comm),
      jsonb_build_object('codice','08','label','Costi amministrativi','tipo','voce','valore', v_costi_amm),
      jsonb_build_object('codice','E', 'label','MOL / EBITDA','tipo','subtot_grasso','valore', v_ebitda,
                        'pct_pil', round((v_ebitda/NULLIF(v_pil,0))*100, 2)),
      jsonb_build_object('codice','09','label','Ammortamenti','tipo','voce','valore', v_amm),
      jsonb_build_object('codice','F', 'label','EBIT','tipo','subtot_grasso','valore', v_ebit,
                        'pct_pil', round((v_ebit/NULLIF(v_pil,0))*100, 2)),
      jsonb_build_object('codice','10','label','Oneri tributari','tipo','voce','valore', v_oneri_trib),
      jsonb_build_object('codice','G', 'label','RISULTATO OPERATIVO','tipo','subtot','valore', v_ris_op),
      jsonb_build_object('codice','11','label','Oneri finanziari','tipo','voce','valore', v_oneri_fin),
      jsonb_build_object('codice','12','label','Proventi finanziari','tipo','voce','valore', v_prov_fin),
      jsonb_build_object('codice','H', 'label','RISULTATO GESTIONALE','tipo','subtot_grasso','valore', v_ris_gest,
                        'pct_pil', round((v_ris_gest/NULLIF(v_pil,0))*100, 2)),
      jsonb_build_object('codice','13','label','Ricavi extra-gest.','tipo','voce','valore', v_ricavi_ex),
      jsonb_build_object('codice','14','label','Costi extra-gest.','tipo','voce','valore', v_costi_ex),
      jsonb_build_object('codice','I', 'label','UTILE ANTE IMPOSTE','tipo','subtot','valore', v_utile_ai),
      jsonb_build_object('codice','15','label','Imposte (stimate)','tipo','voce','valore', v_imposte),
      jsonb_build_object('codice','L', 'label','UTILE BILANCIO','tipo','subtot_grasso','valore', v_utile,
                        'pct_pil', round((v_utile/NULLIF(v_pil,0))*100, 2))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_conto_economico_riclassificato FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_conto_economico_riclassificato TO authenticated;

COMMENT ON FUNCTION public.cg_get_conto_economico_riclassificato IS
  'CE riclassificato (struttura italiana standard) per company/anno/intervallo mesi. Ritorna 24 voci con codici 01..L.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_get_bep — Break Even Point
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_bep(
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
  v_ricavi numeric;
  v_costi_var numeric;
  v_costi_fissi numeric;
  v_mdc_pct numeric;
  v_bep_eur numeric;
  v_bep_pct numeric;
  v_giorno int;
  v_data date;
  v_ricavi_giornalieri numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
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

  v_ricavi_giornalieri := v_ricavi / 365.0;
  v_giorno := CASE WHEN v_ricavi_giornalieri > 0 AND v_bep_eur IS NOT NULL
                   THEN ceil(v_bep_eur / v_ricavi_giornalieri)::int
                   ELSE NULL END;
  v_data := CASE WHEN v_giorno IS NOT NULL
                 THEN make_date(p_anno, 1, 1) + (v_giorno - 1)
                 ELSE NULL END;

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
    'gia_raggiunto', v_data IS NOT NULL AND v_data <= current_date,
    'giorni_residui', CASE WHEN v_data IS NOT NULL
                            THEN (v_data - current_date)::int ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_bep TO authenticated;
COMMENT ON FUNCTION public.cg_get_bep IS
  'Calcolo Break Even Point: % di pareggio, fatturato minimo, giorno e data BEP raggiunto.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) cg_get_ce_mensile — andamento mensile per chart vendite/costi/BEP
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_ce_mensile(
  p_company_id uuid DEFAULT NULL,
  p_anno       int  DEFAULT extract(year from current_date)::int
)
RETURNS TABLE (
  mese             int,
  ricavi           numeric,
  ricavi_cum       numeric,
  costi_var        numeric,
  costi_var_cum    numeric,
  costi_fissi      numeric,
  costi_fissi_cum  numeric,
  costi_totali_cum numeric,
  bep_cum          numeric,
  raggiunto        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_bep numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  SELECT (public.cg_get_bep(v_company_id, p_anno) ->> 'bep_fatturato_minimo')::numeric INTO v_bep;

  RETURN QUERY
  WITH mesi AS (SELECT generate_series(1,12) AS m),
  agg AS (
    SELECT m.m AS mese,
      COALESCE((SELECT sum(importo_imponibile) FROM public.v_cg_ricavi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m), 0) AS ric,
      COALESCE((SELECT sum(importo) FROM public.v_cg_costi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m AND tipo = 'V'), 0) AS cv,
      COALESCE((SELECT sum(importo) FROM public.v_cg_costi_classificati
                 WHERE company_id = v_company_id AND anno = p_anno AND mese = m.m AND tipo = 'F'), 0) AS cf
    FROM mesi m
  )
  SELECT a.mese,
         a.ric,
         sum(a.ric) OVER (ORDER BY a.mese) AS ricavi_cum,
         a.cv,
         sum(a.cv)  OVER (ORDER BY a.mese) AS costi_var_cum,
         a.cf,
         sum(a.cf)  OVER (ORDER BY a.mese) AS costi_fissi_cum,
         sum(a.cv + a.cf) OVER (ORDER BY a.mese) AS costi_totali_cum,
         v_bep AS bep_cum,
         (sum(a.ric) OVER (ORDER BY a.mese)) >= COALESCE(v_bep, 0) AS raggiunto
  FROM agg a
  ORDER BY a.mese;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_ce_mensile TO authenticated;
COMMENT ON FUNCTION public.cg_get_ce_mensile IS
  'Andamento mensile cumulato per chart CE/BEP. 12 righe ordinate per mese.';
