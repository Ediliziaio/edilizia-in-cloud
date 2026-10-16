-- Calculations only: no accounting records, balances or payments are rewritten.
SET lock_timeout='3s';
SET statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.cg_get_aging(p_company_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT 'out'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_oggi       date := current_date;
  v_direction text;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_direction := CASE lower(p_direction) WHEN 'in' THEN 'entrata' WHEN 'out' THEN 'uscita' ELSE lower(p_direction) END;
  IF v_direction NOT IN ('entrata','uscita') OR v_direction IS NULL THEN RAISE EXCEPTION 'Direzione scadenza non valida'; END IF;

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
      AND s.direction = v_direction
      AND lower(COALESCE(s.status::text,'')) IN ('da_pagare','parziale','pending','partial','unpaid','overdue')
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
              'controparte', COALESCE(s.name, c.company_name, NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''))
           ) ORDER BY d.due_date ASC) AS items
    FROM dovuto d
    LEFT JOIN public.suppliers s ON s.id = d.supplier_id
    LEFT JOIN public.marketing_contacts c ON c.id = d.contact_id
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
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_marginalita_commesse(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT NULL::integer, p_status_filter text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  WITH lifecycle AS (
    SELECT o.*,
      CASE WHEN os.is_support_phase THEN 'support'
           WHEN os.id IS NOT NULL THEN CASE WHEN os.position = terminal.position THEN 'completed' ELSE 'open' END
           WHEN o.status IN ('annullato','cancelled','canceled') THEN 'cancelled'
           WHEN o.fulfillment_status = 'completed' OR o.status = 'completato' THEN 'completed'
           ELSE 'open' END AS work_state
    FROM public.orders o
    LEFT JOIN public.order_statuses os ON os.id=o.current_status_id AND os.company_id=o.company_id
    LEFT JOIN LATERAL (SELECT max(position) AS position FROM public.order_statuses s WHERE s.company_id=o.company_id AND NOT COALESCE(s.is_support_phase,false)) terminal ON true
    WHERE o.company_id=v_company_id AND o.deleted_at IS NULL
  ), base AS (
    SELECT
      v.id,
      v.order_code,
      v.description,
      v.cliente_nome,
      v.work_start_date,
      v.work_end_date,
      o.status, o.work_state, extract(year from o.created_at)::int AS creation_year,
      COALESCE(o.percentuale_avanzamento, 0) AS pct_avanz,
      v.preventivo_contratto,
      v.preventivo_totale, (COALESCE(v.preventivo_contratto,v.preventivo_totale,0)+COALESCE(v.variazioni_approvate,0)) AS ricavo_economico,
      v.consuntivo,
      v.costo_acquisti,
      v.costo_errori,
      v.variazioni_approvate,
      v.margine,
      v.margine_perc
    FROM public.v_ordine_marginalita v
    JOIN lifecycle o ON o.id = v.id
    WHERE v.company_id = v_company_id
      AND (p_status_filter IS NULL
           OR (p_status_filter IN ('in_corso','open') AND o.work_state='open')
           OR (p_status_filter IN ('completato','completed') AND o.work_state='completed')
           OR (p_status_filter IN ('assistenza','support') AND o.work_state='support')
           OR (p_status_filter NOT IN ('in_corso','open','completato','completed','assistenza','support') AND o.status=p_status_filter))
      AND (p_anno IS NULL OR extract(year from o.created_at)::int=p_anno
           OR (extract(year from o.created_at)::int<p_anno AND (
             o.work_state IN ('open','support') OR EXISTS (
               SELECT 1 FROM public.order_installments i WHERE i.order_id=o.id AND i.is_paid=false AND i.amount>0
             )
           )))
  ),
  computed AS (
    SELECT b.*,
      CASE
        WHEN b.consuntivo <= 0 OR b.ricavo_economico <= 0 THEN NULL
        WHEN b.pct_avanz >= 100 THEN b.consuntivo
        WHEN b.pct_avanz >= 20 THEN b.consuntivo / LEAST(b.pct_avanz/100.0,1)
        ELSE NULL
      END AS costo_atteso,
      CASE
        WHEN b.consuntivo > 0 AND b.ricavo_economico>0 AND b.pct_avanz >= 20 THEN
          b.ricavo_economico
          - CASE WHEN b.pct_avanz >= 100 THEN b.consuntivo
                 ELSE b.consuntivo / LEAST(b.pct_avanz/100.0,1) END
        ELSE NULL
      END AS margine_atteso
    FROM base b
  ),
  righe AS (
    SELECT jsonb_agg(jsonb_build_object(
        'id',                    c.id,
        'order_code',            c.order_code,
        'description',           c.description,
        'cliente',               c.cliente_nome,
        'status',                c.status,
        'pct_avanzamento',       c.pct_avanz,
        'work_state', c.work_state,
        'creation_year', c.creation_year,
        'work_start',            c.work_start_date,
        'work_end',              c.work_end_date,
        'preventivo',            COALESCE(c.preventivo_contratto, c.preventivo_totale, 0),
        'consuntivo',            COALESCE(c.consuntivo, 0),
        'costo_acquisti',        COALESCE(c.costo_acquisti, 0),
        'costo_errori',          COALESCE(c.costo_errori, 0),
        'variazioni',            COALESCE(c.variazioni_approvate, 0),
        'margine',               COALESCE(c.margine, 0),
        'margine_perc',          COALESCE(c.margine_perc, 0),
        'costo_atteso',          c.costo_atteso,
        'margine_atteso',        c.margine_atteso,
        'margine_atteso_perc',   CASE
                                    WHEN c.ricavo_economico <> 0 AND c.margine_atteso IS NOT NULL
                                      THEN (c.margine_atteso / c.ricavo_economico) * 100
                                    ELSE NULL
                                 END,
        'semaforo',              CASE
                                    WHEN c.margine_atteso IS NULL THEN 'grigio'
                                    WHEN c.ricavo_economico > 0
                                         AND (c.margine_atteso / c.ricavo_economico) >= 0.15
                                         THEN 'verde'
                                    WHEN c.margine_atteso < 0 THEN 'rosso'
                                    ELSE 'giallo'
                                 END
      ) ORDER BY COALESCE(c.preventivo_contratto, c.preventivo_totale, 0) DESC) AS items
    FROM computed c
  ),
  kpi AS (
    SELECT jsonb_build_object(
      'n_commesse',           count(*),
      'n_in_corso',           count(*) FILTER (WHERE work_state='open'),
      'n_completate',         count(*) FILTER (WHERE work_state='completed'),
      'n_assistenza', count(*) FILTER (WHERE work_state='support'),
      'n_annullate', count(*) FILTER (WHERE work_state='cancelled'),
      'n_anno', count(*) FILTER (WHERE creation_year=p_anno),
      'n_pregresso', count(*) FILTER (WHERE creation_year<p_anno),
      'preventivo_totale',    COALESCE(sum(ricavo_economico), 0),
      'consuntivo_totale',    COALESCE(sum(consuntivo), 0),
      'margine_totale',       COALESCE(sum(margine), 0),
      'margine_atteso_totale', COALESCE(sum(margine_atteso) FILTER (WHERE margine_atteso IS NOT NULL), 0),
      'n_in_perdita',         count(*) FILTER (WHERE margine_atteso < 0)
    ) AS data
    FROM computed
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'status_filter', p_status_filter,
      'generato_il', now()
    ),
    'kpi',  (SELECT data FROM kpi),
    'righe', COALESCE((SELECT items FROM righe), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_conto_economico_riclassificato(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer, p_mese_da integer DEFAULT 1, p_mese_a integer DEFAULT 12, p_modalita text DEFAULT 'consuntivo'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_ricavi numeric(14,2) := 0; v_var_rim_lic numeric(14,2) := 0; v_pil numeric(14,2);
  v_acquisti numeric(14,2) := 0; v_var_rim_mag numeric(14,2) := 0; v_costo_mp numeric(14,2);
  v_costi_prod numeric(14,2) := 0; v_costo_vend numeric(14,2); v_i_margine numeric(14,2);
  v_costo_pers numeric(14,2) := 0; v_costo_pers_cedolini numeric(14,2) := 0; v_has_cedolini boolean := false;
  v_costi_comm numeric(14,2) := 0; v_costi_amm numeric(14,2) := 0;
  v_costi_non_class numeric(14,2) := 0;
  v_ebitda numeric(14,2); v_amm numeric(14,2) := 0; v_ebit numeric(14,2);
  v_oneri_trib numeric(14,2) := 0; v_ris_op numeric(14,2); v_oneri_fin numeric(14,2) := 0;
  v_prov_fin numeric(14,2) := 0; v_ris_gest numeric(14,2); v_ricavi_ex numeric(14,2) := 0;
  v_costi_ex numeric(14,2) := 0; v_utile_ai numeric(14,2); v_imposte numeric(14,2);
  v_fine jsonb; v_prima jsonb; v_voci_periodo jsonb; v_pil_periodo numeric;
  v_ires_pct numeric; v_irap_pct numeric; v_add_pct numeric; v_irap_personale boolean;
  v_utile numeric(14,2); v_aliquota numeric := 27.50;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato: company_id non autorizzato';
  END IF;

  IF p_mese_da NOT BETWEEN 1 AND 12 OR p_mese_a NOT BETWEEN p_mese_da AND 12 THEN RAISE EXCEPTION 'Intervallo mesi non valido'; END IF;
  IF p_mese_da>1 THEN
    v_fine := public.cg_get_conto_economico_riclassificato(v_company_id,p_anno,1,p_mese_a,p_modalita);
    v_prima := public.cg_get_conto_economico_riclassificato(v_company_id,p_anno,1,p_mese_da-1,p_modalita);
    SELECT (e->>'valore')::numeric - COALESCE((SELECT (p->>'valore')::numeric FROM jsonb_array_elements(v_prima->'voci') p WHERE p->>'codice'='A'),0)
      INTO v_pil_periodo FROM jsonb_array_elements(v_fine->'voci') e WHERE e->>'codice'='A';
    SELECT jsonb_agg(
      (e.value - 'pct_pil') || jsonb_build_object('valore', round((e.value->>'valore')::numeric - COALESCE((p.value->>'valore')::numeric,0),2))
      || CASE WHEN e.value ? 'pct_pil' THEN jsonb_build_object('pct_pil',round(((e.value->>'valore')::numeric-COALESCE((p.value->>'valore')::numeric,0))/NULLIF(v_pil_periodo,0)*100,2)) ELSE '{}'::jsonb END
      ORDER BY e.ord)
    FROM jsonb_array_elements(v_fine->'voci') WITH ORDINALITY e(value,ord)
    LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(v_prima->'voci','[]'::jsonb)) WHERE value->>'codice'=e.value->>'codice') p ON true INTO v_voci_periodo;
    RETURN jsonb_build_object('meta',(v_fine->'meta')||jsonb_build_object('mese_da',p_mese_da,'mese_a',p_mese_a,'criterio_periodo','differenza_progressivi'), 'voci',v_voci_periodo);
  END IF;

  SELECT COALESCE(sum(importo_imponibile), 0) INTO v_ricavi
  FROM public.v_cg_ricavi_classificati
  WHERE company_id = v_company_id AND anno = p_anno AND mese BETWEEN p_mese_da AND p_mese_a;

  v_var_rim_lic := 0; v_var_rim_mag := 0;
  v_pil := v_ricavi + v_var_rim_lic;

  WITH costi_base AS (
    SELECT macro_voce, sum(importo) AS tot
    FROM public.v_cg_costi_classificati
    WHERE company_id = v_company_id AND anno = p_anno AND mese BETWEEN p_mese_da AND p_mese_a
      AND macro_voce IS NOT NULL
    GROUP BY macro_voce
  ),
  override_anno AS (
    SELECT cv.macro_voce, sum(CASE WHEN o.mese IS NULL THEN round(o.importo_override*p_mese_a/12.0,2) ELSE o.importo_override END) AS tot
    FROM public.ce_riclassificato_overrides o
    JOIN public.cg_classificazione_voci cv ON cv.voce_chiave = o.voce_chiave AND cv.company_id = o.company_id
    WHERE o.company_id = v_company_id AND o.esercizio = p_anno
      AND (o.mese IS NULL OR o.mese BETWEEN p_mese_da AND p_mese_a)
    GROUP BY cv.macro_voce
  ),
  totali AS (
    SELECT cb.macro_voce, cb.tot + COALESCE(oa.tot, 0) AS valore
    FROM costi_base cb LEFT JOIN override_anno oa ON oa.macro_voce = cb.macro_voce
    UNION ALL
    SELECT oa.macro_voce, oa.tot FROM override_anno oa
    LEFT JOIN costi_base cb ON cb.macro_voce = oa.macro_voce WHERE cb.macro_voce IS NULL
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
       v_costi_amm, v_oneri_trib, v_oneri_fin, v_prov_fin, v_ricavi_ex, v_costi_ex
  FROM totali;

  -- Costi NON classificati (macro_voce NULL): PRIMA venivano scartati → EBITDA/utile
  -- gonfiati. Ora sommati e sottratti dall'EBITDA (default gestionale conservativo),
  -- e mostrati come voce esplicita così l'utente sa che deve classificarli.
  SELECT COALESCE(sum(importo), 0) INTO v_costi_non_class
  FROM public.v_cg_costi_classificati
  WHERE company_id = v_company_id AND anno = p_anno AND mese BETWEEN p_mese_da AND p_mese_a
    AND macro_voce IS NULL;

  SELECT EXISTS(SELECT 1 FROM public.cedolini WHERE company_id = v_company_id AND anno = p_anno) INTO v_has_cedolini;
  IF v_has_cedolini THEN
    SELECT COALESCE(sum(COALESCE(lordo, 0) + COALESCE(contributi_datore, 0)), 0) INTO v_costo_pers_cedolini
    FROM public.cedolini
    WHERE company_id = v_company_id AND anno = p_anno AND mese BETWEEN p_mese_da AND p_mese_a
      AND stato IN ('emesso','pagato');
    IF v_costo_pers_cedolini > 0 THEN v_costo_pers := v_costo_pers_cedolini; END IF;
  END IF;

  WITH amm_anno AS (
    SELECT CASE
        WHEN c.aliquota_amm > 0 THEN c.costo_storico * (c.aliquota_amm / 100.0)
        WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0 THEN c.costo_storico / (c.vita_utile_mesi / 12.0)
        ELSE 0 END AS quota_annua
    FROM public.cespiti c
    WHERE c.company_id = v_company_id AND c.is_active
      AND c.data_acquisto <= make_date(p_anno, p_mese_a, 28)
      AND (c.data_dismissione IS NULL OR c.data_dismissione >= make_date(p_anno, p_mese_da, 1))
  )
  SELECT COALESCE(sum(quota_annua * (p_mese_a - p_mese_da + 1) / 12.0), 0) INTO v_amm FROM amm_anno;

  v_costo_mp   := v_acquisti + COALESCE(v_var_rim_mag, 0);
  v_costo_vend := v_costo_mp + v_costi_prod;
  v_i_margine  := v_pil - v_costo_vend;
  v_ebitda     := v_i_margine - v_costo_pers - v_costi_comm - v_costi_amm - v_costi_non_class;
  v_ebit       := v_ebitda - v_amm;
  v_ris_op     := v_ebit - v_oneri_trib;
  v_ris_gest   := v_ris_op - v_oneri_fin + v_prov_fin;
  v_utile_ai   := v_ris_gest + v_ricavi_ex - v_costi_ex;
  SELECT ires_pct,irap_pct,addizionale_ires_pct,base_irap_include_personale
    INTO v_ires_pct,v_irap_pct,v_add_pct,v_irap_personale FROM public.cg_aliquote_imposte WHERE company_id=v_company_id;
  v_ires_pct:=COALESCE(v_ires_pct,24); v_irap_pct:=COALESCE(v_irap_pct,3.9); v_add_pct:=COALESCE(v_add_pct,0); v_irap_personale:=COALESCE(v_irap_personale,true);
  v_imposte := round(GREATEST(v_utile_ai,0)*v_ires_pct/100,2)
    + round(GREATEST(v_utile_ai,0)*v_add_pct/100,2)
    + round(GREATEST(v_ebit+CASE WHEN v_irap_personale THEN v_costo_pers ELSE 0 END,0)*v_irap_pct/100,2);
  v_aliquota:=CASE WHEN v_utile_ai>0 THEN round(v_imposte/v_utile_ai*100,2) ELSE 0 END;
  v_utile      := v_utile_ai - v_imposte;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id, 'anno', p_anno, 'mese_da', p_mese_da, 'mese_a', p_mese_a,
      'modalita', p_modalita, 'has_cedolini', v_has_cedolini, 'aliquota_imposte_pct', v_aliquota,
      'criterio_imposte','stima_gestionale_ires_irap_progressiva',
      'costi_non_classificati', v_costi_non_class, 'generato_il', now()),
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
      jsonb_build_object('codice','08b','label','Costi non classificati','tipo','voce','valore', v_costi_non_class),
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
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_ce_mensile_dettaglio(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_mese int;
  v_mese_data jsonb; v_fine jsonb; v_prima jsonb; v_voci_periodo jsonb; v_pil_periodo numeric;
  v_mesi jsonb := '[]'::jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;
  PERFORM public._cg_assert_enabled(v_company_id);

  -- 12 chiamate: una per mese. Riusa la RPC base che applica override e
  -- classificazione corretta. La performance è ~100-200ms su demo.
  FOR v_mese IN 1..12 LOOP
    v_fine := public.cg_get_conto_economico_riclassificato(v_company_id,p_anno,1,v_mese,'consuntivo');
    SELECT (e->>'valore')::numeric - COALESCE((SELECT (p->>'valore')::numeric FROM jsonb_array_elements(COALESCE(v_prima->'voci','[]'::jsonb)) p WHERE p->>'codice'='A'),0)
      INTO v_pil_periodo FROM jsonb_array_elements(v_fine->'voci') e WHERE e->>'codice'='A';
    SELECT jsonb_agg(
      (e.value - 'pct_pil') || jsonb_build_object('valore', round((e.value->>'valore')::numeric - COALESCE((p.value->>'valore')::numeric,0),2))
      || CASE WHEN e.value ? 'pct_pil' THEN jsonb_build_object('pct_pil',round(((e.value->>'valore')::numeric-COALESCE((p.value->>'valore')::numeric,0))/NULLIF(v_pil_periodo,0)*100,2)) ELSE '{}'::jsonb END
      ORDER BY e.ord)
    FROM jsonb_array_elements(v_fine->'voci') WITH ORDINALITY e(value,ord)
    LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(v_prima->'voci','[]'::jsonb)) WHERE value->>'codice'=e.value->>'codice') p ON true INTO v_voci_periodo;
    v_mese_data:=jsonb_build_object('voci',v_voci_periodo);
    v_prima:=v_fine;
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
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_indici_avanzati(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_ce       jsonb;
  v_sp       jsonb;
  v_pfn      jsonb;
  v_ricavi   numeric;
  v_acquisti numeric;
  v_costo_vend numeric;
  v_ebitda   numeric;
  v_ebit     numeric;
  v_utile_ai numeric; v_imposte numeric;
  v_utile    numeric;
  v_oneri_fin numeric;
  v_crediti  numeric;
  v_debiti_forn numeric;
  v_rimanenze numeric;
  v_attivo   numeric;
  v_pn       numeric;
  v_passivo_corrente numeric;
  v_attivo_circ numeric;
  v_dso      numeric;
  v_dpo      numeric;
  v_dsi      numeric;
  v_ccc      numeric;
  v_z_score  numeric;
  v_z_classe text;
  v_dscr     numeric;
  v_servizio_debito numeric;
  v_rate_anno numeric;
  v_interessi_anno numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- CE annuale
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);
  -- SP
  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);
  -- PFN
  v_pfn := public.cg_get_pfn(v_company_id, p_anno);

  -- Estrai voci CE
  SELECT (v->>'valore')::numeric INTO v_ricavi   FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '01';
  SELECT (v->>'valore')::numeric INTO v_acquisti FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '03';
  SELECT (v->>'valore')::numeric INTO v_costo_vend FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'C';
  SELECT (v->>'valore')::numeric INTO v_ebitda   FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'E';
  SELECT (v->>'valore')::numeric INTO v_ebit     FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'F';
  SELECT (v->>'valore')::numeric INTO v_utile_ai FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'I';
  SELECT (v->>'valore')::numeric INTO v_utile    FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'L';
  SELECT (v->>'valore')::numeric INTO v_oneri_fin FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '11';

  SELECT (v->>'valore')::numeric INTO v_imposte FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='15';

  -- Estrai voci SP
  v_crediti      := COALESCE((v_sp->'attivo'->>'crediti_clienti')::numeric, 0);
  v_rimanenze    := COALESCE((v_sp->'attivo'->>'rimanenze')::numeric, 0);
  v_attivo       := COALESCE((v_sp->'attivo'->>'totale')::numeric, 0);
  v_attivo_circ  := COALESCE((v_sp->'attivo'->>'attivo_circolante')::numeric, 0);
  v_debiti_forn  := COALESCE((v_sp->'passivo'->>'debiti_fornitori')::numeric, 0);
  v_pn           := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);
  v_passivo_corrente := COALESCE((v_sp->'passivo'->>'pas_corrente')::numeric, 0);

  -- Indici di rotazione (giorni)
  v_dso := CASE WHEN v_ricavi > 0    THEN (v_crediti     / v_ricavi)    * 365 ELSE NULL END;
  v_dpo := CASE WHEN v_acquisti > 0  THEN (v_debiti_forn / v_acquisti)  * 365 ELSE NULL END;
  v_dsi := CASE WHEN v_costo_vend > 0 THEN (v_rimanenze   / v_costo_vend) * 365 ELSE NULL END;
  v_ccc := COALESCE(v_dso, 0) + COALESCE(v_dsi, 0) - COALESCE(v_dpo, 0);

  -- Z-score di Altman (modello revised per PMI non quotate, 1983):
  --   Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5
  --   X1 = (Attivo circolante - Passivo corrente) / Attivo
  --   X2 = Utile non distribuito / Attivo  (qui usiamo riserve+utile come proxy)
  --   X3 = EBIT / Attivo
  --   X4 = PN / Debiti totali (=Pas_consol + Pas_corrente)
  --   X5 = Ricavi / Attivo
  IF v_attivo > 0 THEN
    DECLARE
      v_x1 numeric := (v_attivo_circ - v_passivo_corrente) / v_attivo;
      v_x2 numeric := COALESCE((
        SELECT ((v_sp->'passivo'->>'riserve')::numeric + (v_sp->'passivo'->>'utile_esercizio')::numeric)
      ), 0) / v_attivo;
      v_x3 numeric := COALESCE(v_ebit, 0) / v_attivo;
      v_debiti_tot numeric := COALESCE((v_sp->'passivo'->>'pas_consolidato')::numeric, 0)
                            + v_passivo_corrente;
      v_x4 numeric := CASE WHEN v_debiti_tot > 0 THEN v_pn / v_debiti_tot ELSE 0 END;
      v_x5 numeric := COALESCE(v_ricavi, 0) / v_attivo;
    BEGIN
      v_z_score := round(0.717 * v_x1 + 0.847 * v_x2 + 3.107 * v_x3 + 0.420 * v_x4 + 0.998 * v_x5, 3);
      v_z_classe := CASE
                      WHEN v_z_score >= 2.9  THEN 'safe'        -- area sicurezza
                      WHEN v_z_score >= 1.23 THEN 'grey'        -- area grigia
                      ELSE 'distress'                            -- area distress
                    END;
    END;
  END IF;

  -- DSCR — usa rate mutui annuali + interessi
  SELECT
    COALESCE(sum(rata_mensile * 12), 0),
    COALESCE(sum(capitale_residuo * (tasso_pct/100.0)), 0)
  INTO v_rate_anno, v_interessi_anno
  FROM public.cg_loans
  WHERE company_id = v_company_id AND is_active = true;

  v_servizio_debito := v_rate_anno;
  v_dscr := CASE
              WHEN v_servizio_debito > 0
                THEN round((COALESCE(v_ebitda, 0) - COALESCE(v_imposte,0)) / v_servizio_debito, 2)
              ELSE NULL
            END;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'generato_il', now()
    ),
    'rotazione', jsonb_build_object(
      'dso_giorni', v_dso,
      'dpo_giorni', v_dpo,
      'dsi_giorni', v_dsi,
      'ccc_giorni', v_ccc,
      'crediti_clienti',    v_crediti,
      'debiti_fornitori',   v_debiti_forn,
      'rimanenze',          v_rimanenze,
      'ricavi',             v_ricavi,
      'acquisti',           v_acquisti,
      'costo_venduto',      v_costo_vend
    ),
    'altman', jsonb_build_object(
      'z_score',    v_z_score,
      'classe',     v_z_classe,
      'descrizione', CASE v_z_classe
        WHEN 'safe'     THEN 'Area di sicurezza — bassa probabilità di default'
        WHEN 'grey'     THEN 'Area grigia — monitorare con attenzione'
        WHEN 'distress' THEN 'Area di distress — alto rischio di default'
        ELSE 'Non calcolabile (dati insufficienti)'
      END
    ),
    'dscr', jsonb_build_object(
      'valore',          v_dscr,
      'imposte_ce', v_imposte,
      'flusso_disponibile', COALESCE(v_ebitda,0)-COALESCE(v_imposte,0),
      'servizio_debito', v_servizio_debito,
      'rate_anno',       v_rate_anno,
      'interessi_anno',  v_interessi_anno,
      'ebitda',          v_ebitda,
      'classe',          CASE
                            WHEN v_dscr IS NULL THEN 'na'
                            WHEN v_dscr >= 1.5  THEN 'eccellente'
                            WHEN v_dscr >= 1.2  THEN 'buono'
                            WHEN v_dscr >= 1.0  THEN 'critico'
                            ELSE 'insufficiente'
                          END
    )
  );
END;
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_health_check(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_n_mesi_movimenti int := 0;
  v_n_costi_no_categoria int := 0;
  v_n_cespiti int := 0;
  v_n_loans int := 0;
  v_n_classificazioni int := 0;
  v_n_voci_no_macro int := 0;
  v_n_invoices int := 0;
  v_n_cedolini int := 0;
  v_n_scadenze_open int := 0;
  v_pn_capitale numeric := 0;
  v_pn_riserve numeric := 0;
  v_score numeric := 0;
  v_max_score int := 10;
  v_sp jsonb; v_result jsonb; v_checks jsonb; v_mesi_attesi int;
  v_ready boolean;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Diagnostiche
  SELECT count(DISTINCT extract(month from COALESCE(cc.paid_date, cc.due_date)))::int
  INTO v_n_mesi_movimenti
  FROM public.company_costs cc
  WHERE cc.company_id = v_company_id
    AND extract(year from COALESCE(cc.paid_date, cc.due_date))::int = p_anno;

  SELECT count(*) INTO v_n_costi_no_categoria
  FROM public.company_costs cc
  WHERE cc.company_id = v_company_id
    AND extract(year from COALESCE(cc.paid_date, cc.due_date))::int = p_anno
    AND (cc.category IS NULL OR cc.category = '');

  SELECT count(*) INTO v_n_cespiti FROM public.cespiti WHERE company_id = v_company_id AND is_active;
  SELECT count(*) INTO v_n_loans   FROM public.cg_loans WHERE company_id = v_company_id AND is_active;
  SELECT count(*) INTO v_n_classificazioni FROM public.cg_classificazione_voci WHERE company_id = v_company_id AND is_active;

  SELECT count(*) INTO v_n_voci_no_macro
  FROM public.cg_classificazione_voci
  WHERE company_id = v_company_id AND is_active AND (macro_voce IS NULL OR macro_voce = '');

  SELECT count(*) INTO v_n_invoices
  FROM public.invoices
  WHERE company_id = v_company_id
    AND extract(year from issue_date)::int = p_anno
    AND status NOT IN ('cancelled','draft','annullata','bozza');

  SELECT count(*) INTO v_n_cedolini
  FROM public.cedolini WHERE company_id = v_company_id AND anno = p_anno;

  SELECT count(*) INTO v_n_scadenze_open
  FROM public.scadenze WHERE company_id = v_company_id AND lower(COALESCE(status::text,'')) IN ('da_pagare','parziale','pending','partial','unpaid','overdue') AND amount>COALESCE(paid_amount,0);

  SELECT
    COALESCE(sum(capitale_sociale), 0),
    COALESCE(sum(COALESCE(riserva_legale, 0) + COALESCE(riserva_straordinaria, 0) + COALESCE(altre_riserve, 0)), 0)
  INTO v_pn_capitale, v_pn_riserve
  FROM public.patrimonio_netto WHERE company_id = v_company_id AND esercizio = p_anno;

  -- Score (0-10)
  v_score := v_score
    + CASE WHEN v_n_mesi_movimenti >= 6  THEN 2 WHEN v_n_mesi_movimenti >= 1 THEN 1 ELSE 0 END
    + CASE WHEN v_n_costi_no_categoria = 0 THEN 2 WHEN v_n_costi_no_categoria <= 5 THEN 1 ELSE 0 END
    + CASE WHEN v_n_cespiti > 0 THEN 1 ELSE 0 END
    + CASE WHEN v_n_loans > 0 THEN 1 ELSE 0 END
    + CASE WHEN v_n_classificazioni >= 20 THEN 2 WHEN v_n_classificazioni >= 5 THEN 1 ELSE 0 END
    + CASE WHEN v_pn_capitale > 0 THEN 1 ELSE 0 END
    + CASE WHEN v_n_invoices > 0 THEN 1 ELSE 0 END;

  v_result := jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id, 'anno', p_anno, 'generato_il', now()
    ),
    'score', v_score,
    'max_score', v_max_score,
    'percentuale', round((v_score::numeric / v_max_score) * 100, 1),
    'checks', jsonb_build_array(
      jsonb_build_object(
        'codice', 'mesi_movimenti',
        'label',  'Movimenti distribuiti per mese',
        'valore', v_n_mesi_movimenti,
        'target', '12',
        'status', CASE WHEN v_n_mesi_movimenti >= 12 THEN 'ok'
                       WHEN v_n_mesi_movimenti >= 6  THEN 'warn' ELSE 'critical' END,
        'descrizione', 'CE riclassificato richiede movimenti su tutto l''anno per dare proiezioni affidabili.'
      ),
      jsonb_build_object(
        'codice', 'costi_no_categoria',
        'label',  'Costi senza categoria',
        'valore', v_n_costi_no_categoria,
        'target', '0',
        'status', CASE WHEN v_n_costi_no_categoria = 0 THEN 'ok'
                       WHEN v_n_costi_no_categoria <= 5 THEN 'warn' ELSE 'critical' END,
        'descrizione', 'Costi senza categoria non vengono classificati nel CE riclassificato.',
        'azione_url', '/azienda/costi-aziendali'
      ),
      jsonb_build_object(
        'codice', 'cespiti',
        'label',  'Cespiti caricati',
        'valore', v_n_cespiti,
        'target', '> 0',
        'status', CASE WHEN v_n_cespiti > 0 THEN 'ok' ELSE 'critical' END,
        'descrizione', 'Senza cespiti gli ammortamenti sono 0 e EBIT = EBITDA (sbagliato).'
      ),
      jsonb_build_object(
        'codice', 'loans',
        'label',  'Mutui MLT registrati',
        'valore', v_n_loans,
        'target', '> 0 se hai mutui',
        'status', CASE WHEN v_n_loans > 0 THEN 'ok' ELSE 'warn' END,
        'descrizione', 'Necessari per PFN, Cash Flow e DSCR. Vai a PFN & Debiti per aggiungerli.',
        'azione_url', '/azienda/controllo-gestione/pfn-debiti'
      ),
      jsonb_build_object(
        'codice', 'classificazioni',
        'label',  'Voci di classificazione attive',
        'valore', v_n_classificazioni,
        'target', '≥ 20',
        'status', CASE WHEN v_n_classificazioni >= 20 THEN 'ok'
                       WHEN v_n_classificazioni >= 5 THEN 'warn' ELSE 'critical' END,
        'descrizione', 'Carica il template predefinito di 45 voci dalla Configurazione.',
        'azione_url', '/azienda/controllo-gestione/configurazione'
      ),
      jsonb_build_object(
        'codice', 'voci_no_macro',
        'label',  'Voci senza macro_voce',
        'valore', v_n_voci_no_macro,
        'target', '0',
        'status', CASE WHEN v_n_voci_no_macro = 0 THEN 'ok' ELSE 'warn' END,
        'descrizione', 'Voci attive senza macro_voce non finiscono in nessuna riga del CE.',
        'azione_url', '/azienda/controllo-gestione/configurazione'
      ),
      jsonb_build_object(
        'codice', 'patrimonio_netto',
        'label',  'Patrimonio netto compilato',
        'valore', v_pn_capitale,
        'target', '> 0',
        'status', CASE WHEN v_pn_capitale > 0 THEN 'ok' ELSE 'critical' END,
        'descrizione', 'Senza capitale sociale lo Stato Patrimoniale non quadra e il Rating non si calcola.'
      ),
      jsonb_build_object(
        'codice', 'invoices',
        'label',  'Fatture emesse',
        'valore', v_n_invoices,
        'target', '> 0',
        'status', CASE WHEN v_n_invoices > 0 THEN 'ok' ELSE 'critical' END,
        'descrizione', 'Senza fatture i ricavi nel CE sono 0.'
      ),
      jsonb_build_object(
        'codice', 'cedolini',
        'label',  'Cedolini caricati',
        'valore', v_n_cedolini,
        'target', '12',
        'status', CASE WHEN v_n_cedolini >= 12 THEN 'ok'
                       WHEN v_n_cedolini > 0 THEN 'warn' ELSE 'warn' END,
        'descrizione', 'Cedolini reali migliorano la precisione del costo personale; senza, si stima dai costi.'
      ),
      jsonb_build_object(
        'codice', 'scadenze_open',
        'label',  'Scadenze aperte (per Cash Flow)',
        'valore', v_n_scadenze_open,
        'target', '> 0',
        'status', CASE WHEN v_n_scadenze_open > 0 THEN 'ok' ELSE 'warn' END,
        'descrizione', 'Senza scadenze aperte il Cash Flow prospettico non ha entrate/uscite future.',
        'azione_url', '/azienda/scadenzario'
      )
    )
  );
  v_mesi_attesi:=CASE WHEN p_anno<extract(year from current_date) THEN 12 WHEN p_anno=extract(year from current_date) THEN extract(month from current_date)::int ELSE 0 END;
  v_sp:=public.cg_get_stato_patrimoniale_riclassificato(v_company_id,p_anno);
  SELECT jsonb_agg(CASE WHEN c->>'codice'='mesi_movimenti' THEN c||jsonb_build_object(
    'target',v_mesi_attesi::text||' mesi trascorsi',
    'status',CASE WHEN v_mesi_attesi=0 THEN 'warn' WHEN v_n_mesi_movimenti>=v_mesi_attesi THEN 'ok' WHEN v_n_mesi_movimenti>0 THEN 'warn' ELSE 'critical' END)
    ELSE c END) INTO v_checks FROM jsonb_array_elements(v_result->'checks') c;
  v_checks:=v_checks||jsonb_build_array(jsonb_build_object(
    'codice','quadratura_sp','label','Quadratura stato patrimoniale',
    'valore',COALESCE((v_sp->'quadratura'->>'differenza')::numeric,0), 'target','Differenza entro 1 €',
    'status',CASE WHEN COALESCE((v_sp->'quadratura'->>'quadrato')::boolean,false) THEN 'ok' ELSE 'critical' END,
    'descrizione','Attivo e passivo devono essere riconciliati prima di validare rating e report.',
    'azione_url','/azienda/controllo-gestione/sp'));
  SELECT sum(CASE c->>'status' WHEN 'ok' THEN 1 WHEN 'warn' THEN 0.5 ELSE 0 END),count(*),bool_and(c->>'status'='ok')
    INTO v_score,v_max_score,v_ready FROM jsonb_array_elements(v_checks) c;
  RETURN v_result||jsonb_build_object('checks',v_checks,'score',v_score,'max_score',v_max_score,
    'percentuale',round(v_score::numeric/NULLIF(v_max_score,0)*100,1), 'report_ready',v_ready);
END;
$function$;



CREATE OR REPLACE FUNCTION public.cg_get_rating(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_sp jsonb;
  v_ce jsonb;
  v_ac numeric; v_pc numeric;
  v_mp numeric; v_tot_pas numeric;
  v_of numeric; v_ricavi numeric;
  v_utile numeric; v_amm numeric; v_tot_att numeric;
  v_r1 numeric; v_r2 numeric; v_r3 numeric; v_r4 numeric;
  v_s1 int; v_s2 int; v_s3 int; v_s4 int;
  v_score int;
  v_classe text; v_livello text;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno);

  v_ac      := COALESCE((v_sp->'attivo' ->>'attivo_circolante')::numeric, 0);
  v_pc      := COALESCE((v_sp->'passivo'->>'pas_corrente')::numeric, 0);
  v_mp      := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);
  v_tot_pas := COALESCE((v_sp->'passivo'->>'totale')::numeric, 0);
  v_tot_att := COALESCE((v_sp->'attivo' ->>'totale')::numeric, 0);

  SELECT (v->>'valore')::numeric INTO v_ricavi
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='01';
  SELECT (v->>'valore')::numeric INTO v_of
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='11';
  SELECT (v->>'valore')::numeric INTO v_utile
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='L';
  SELECT (v->>'valore')::numeric INTO v_amm
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice'='09';

  v_ricavi := COALESCE(v_ricavi, 0);
  v_of     := COALESCE(v_of, 0);
  v_utile  := COALESCE(v_utile, 0);
  v_amm    := COALESCE(v_amm, 0);

  v_r1 := CASE WHEN v_pc > 0 THEN v_ac / v_pc ELSE 0 END;
  v_r2 := CASE WHEN v_tot_pas > 0 THEN v_mp / v_tot_pas ELSE 0 END;
  v_r3 := CASE WHEN v_ricavi > 0 THEN v_of / v_ricavi ELSE 1 END;
  v_r4 := CASE WHEN v_tot_att > 0 THEN (v_utile + v_amm) / v_tot_att ELSE 0 END;

  v_s1 := CASE WHEN v_r1 >= 1.8 THEN 25 WHEN v_r1 >= 1.5 THEN 20 WHEN v_r1 >= 1.2 THEN 15
                WHEN v_r1 >= 1.0 THEN 10 WHEN v_r1 >= 0.8 THEN 5 ELSE 0 END;
  v_s2 := CASE WHEN v_r2 >= 0.40 THEN 25 WHEN v_r2 >= 0.30 THEN 20 WHEN v_r2 >= 0.20 THEN 15
                WHEN v_r2 >= 0.15 THEN 10 WHEN v_r2 >= 0.10 THEN 5 ELSE 0 END;
  v_s3 := CASE WHEN v_r3 <= 0.015 THEN 25 WHEN v_r3 <= 0.025 THEN 20 WHEN v_r3 <= 0.035 THEN 15
                WHEN v_r3 <= 0.045 THEN 10 WHEN v_r3 <= 0.060 THEN 5 ELSE 0 END;
  v_s4 := CASE WHEN v_r4 >= 0.12 THEN 25 WHEN v_r4 >= 0.08 THEN 20 WHEN v_r4 >= 0.05 THEN 15
                WHEN v_r4 >= 0.03 THEN 10 WHEN v_r4 >= 0.01 THEN 5 ELSE 0 END;

  v_score := v_s1 + v_s2 + v_s3 + v_s4;

  v_classe := CASE WHEN v_score >= 90 THEN 'AAA' WHEN v_score >= 80 THEN 'AA'
                   WHEN v_score >= 70 THEN 'A'   WHEN v_score >= 55 THEN 'BBB'
                   WHEN v_score >= 40 THEN 'BB'  WHEN v_score >= 20 THEN 'B'
                   ELSE 'CCC' END;
  v_livello := CASE v_classe WHEN 'AAA' THEN 'molto_basso' WHEN 'AA' THEN 'basso'
                              WHEN 'A'   THEN 'medio_basso' WHEN 'BBB' THEN 'medio'
                              WHEN 'BB'  THEN 'medio_alto'  WHEN 'B'   THEN 'alto'
                              ELSE 'default' END;

  RETURN jsonb_build_object(
    'attendibile', COALESCE((v_sp->'quadratura'->>'quadrato')::boolean,false) AND v_ricavi>0 AND v_tot_att>0,
    'motivi', CASE WHEN NOT COALESCE((v_sp->'quadratura'->>'quadrato')::boolean,false) THEN jsonb_build_array('Stato patrimoniale non riconciliato: differenza '||(v_sp->'quadratura'->>'differenza')||' €') WHEN v_ricavi<=0 OR v_tot_att<=0 THEN jsonb_build_array('Ricavi o attivo insufficienti per validare la valutazione') ELSE '[]'::jsonb END,
    'anno', p_anno,
    'classe', v_classe,
    'livello', v_livello,
    'score', v_score,
    'indicatori', jsonb_build_array(
      jsonb_build_object('codice','liquidita',         'label','Attivo Circ. / Passivo Circ.',
                         'valore', round(v_r1,4), 'punteggio', v_s1, 'soglia_top', 1.8),
      jsonb_build_object('codice','indipendenza',      'label','Mezzi Propri / Tot. Passivo',
                         'valore', round(v_r2,4), 'punteggio', v_s2, 'soglia_top', 0.40),
      jsonb_build_object('codice','oneri_finanziari',  'label','OF / Fatturato',
                         'valore', round(v_r3,4), 'punteggio', v_s3, 'soglia_top', 0.015),
      jsonb_build_object('codice','cashflow',          'label','(Utile + Amm) / Tot. Attivo',
                         'valore', round(v_r4,4), 'punteggio', v_s4, 'soglia_top', 0.12)
    )
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.cg_get_imposte_dettaglio(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Aliquote (con default)
  SELECT ires_pct, irap_pct, addizionale_ires_pct, base_irap_include_personale
  INTO v_ires_pct, v_irap_pct, v_add_ires_pct, v_base_irap_inc_pers
  FROM public.cg_aliquote_imposte
  WHERE company_id = v_company_id;

  v_ires_pct:=COALESCE(v_ires_pct,24); v_irap_pct:=COALESCE(v_irap_pct,3.9);
  v_add_ires_pct:=COALESCE(v_add_ires_pct,0); v_base_irap_inc_pers:=COALESCE(v_base_irap_inc_pers,true);

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
$function$;


NOTIFY pgrst, 'reload schema';
