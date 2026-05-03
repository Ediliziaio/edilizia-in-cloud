-- MP-CG-03 — RPC Stato Patrimoniale Riclassificato + Rating bancario
-- Adattate ai nomi reali dello schema EiC (warehouse_stock.quantity/unit_cost,
-- invoices.paid_amount, bank_accounts, f24_entries, ...). Tabelle non
-- presenti vengono trattate come stub a 0.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_get_stato_patrimoniale_riclassificato
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_stato_patrimoniale_riclassificato(
  p_company_id      uuid DEFAULT NULL,
  p_anno            int  DEFAULT extract(year from current_date)::int,
  p_data_riferimento date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_imm_imm   numeric(14,2) := 0;
  v_imm_mat   numeric(14,2) := 0;
  v_imm_fin   numeric(14,2) := 0;
  v_attivo_fisso numeric(14,2);
  v_rimanenze numeric(14,2) := 0;
  v_crediti_clienti  numeric(14,2) := 0;
  v_crediti_trib     numeric(14,2) := 0;
  v_anticipi_forn    numeric(14,2) := 0;
  v_liq_diff numeric(14,2);
  v_cassa numeric(14,2) := 0;
  v_banche_pos numeric(14,2) := 0;
  v_liq_imm numeric(14,2);
  v_ratei_att numeric(14,2) := 0;
  v_attivo_circ numeric(14,2);
  v_tot_attivo numeric(14,2);
  v_capitale numeric(14,2) := 0;
  v_riserve numeric(14,2) := 0;
  v_utile_es numeric(14,2) := 0;
  v_mezzi_propri numeric(14,2);
  v_tfr numeric(14,2) := 0;
  v_fondi_rischi numeric(14,2) := 0;
  v_mutui_mlt numeric(14,2) := 0;
  v_pas_consol numeric(14,2);
  v_banche_neg numeric(14,2) := 0;
  v_debiti_forn numeric(14,2) := 0;
  v_debiti_trib numeric(14,2) := 0;
  v_debiti_pers numeric(14,2) := 0;
  v_debiti_prev numeric(14,2) := 0;
  v_pas_corr numeric(14,2);
  v_tot_passivo numeric(14,2);
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- ── Attivo Fisso (cespiti per categoria) ────────────────────────────────
  SELECT
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='immateriale'), 0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='materiale'),   0),
    COALESCE(sum(valore_residuo) FILTER (WHERE categoria='finanziaria'), 0)
  INTO v_imm_imm, v_imm_mat, v_imm_fin
  FROM public.cespiti
  WHERE company_id = v_company_id
    AND is_active = true
    AND data_acquisto <= p_data_riferimento
    AND (data_dismissione IS NULL OR data_dismissione > p_data_riferimento);

  v_attivo_fisso := v_imm_imm + v_imm_mat + v_imm_fin;

  -- ── Rimanenze (warehouse_stock) ─────────────────────────────────────────
  SELECT COALESCE(sum(quantity * COALESCE(unit_cost, 0)), 0)
  INTO v_rimanenze
  FROM public.warehouse_stock
  WHERE company_id = v_company_id AND quantity > 0;

  -- ── Crediti vs clienti = (total - paid_amount) sulle fatture ────────────
  SELECT COALESCE(sum(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)), 0)
  INTO v_crediti_clienti
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.status NOT IN ('cancelled','draft','annullata','bozza')
    AND i.issue_date <= p_data_riferimento;

  -- Crediti tributari / Anticipi fornitori → tabelle non disponibili: stub.
  v_crediti_trib  := 0;
  v_anticipi_forn := 0;

  v_liq_diff := v_crediti_clienti + v_crediti_trib + v_anticipi_forn;

  -- ── Liquidità immediate (banche) ────────────────────────────────────────
  SELECT COALESCE(sum(current_balance), 0)
  INTO v_banche_pos
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance > 0;

  v_cassa := 0;  -- nessuna view cassa_movimenti_riepilogo nello schema attuale
  v_liq_imm := v_cassa + v_banche_pos;

  v_attivo_circ := v_rimanenze + v_liq_diff + v_liq_imm + v_ratei_att;
  v_tot_attivo  := v_attivo_fisso + v_attivo_circ;

  -- ── Mezzi Propri (patrimonio_netto + utile esercizio dalla RPC CE) ──────
  SELECT
    COALESCE(pn.capitale_sociale, 0),
    COALESCE(pn.riserva_legale, 0) + COALESCE(pn.riserva_straordinaria, 0)
      + COALESCE(pn.altre_riserve, 0) + COALESCE(pn.utili_perdite_a_nuovo, 0),
    COALESCE(pn.fondo_tfr, 0),
    COALESCE(pn.fondo_rischi, 0) + COALESCE(pn.altri_fondi, 0)
  INTO v_capitale, v_riserve, v_tfr, v_fondi_rischi
  FROM public.patrimonio_netto pn
  WHERE pn.company_id = v_company_id AND pn.esercizio = p_anno;

  -- Utile esercizio dalla RPC CE (codice 'L')
  SELECT (val->>'valore')::numeric INTO v_utile_es
  FROM jsonb_array_elements(
    (public.cg_get_conto_economico_riclassificato(v_company_id, p_anno) -> 'voci')
  ) AS val
  WHERE val->>'codice' = 'L'
  LIMIT 1;

  v_capitale     := COALESCE(v_capitale, 0);
  v_riserve      := COALESCE(v_riserve, 0);
  v_tfr          := COALESCE(v_tfr, 0);
  v_fondi_rischi := COALESCE(v_fondi_rischi, 0);
  v_utile_es     := COALESCE(v_utile_es, 0);
  v_mezzi_propri := v_capitale + v_riserve + v_utile_es;

  -- Mutui MLT — tabella `loans` non disponibile: stub a 0.
  v_mutui_mlt := 0;
  v_pas_consol := v_tfr + v_fondi_rischi + v_mutui_mlt;

  -- ── Passivo corrente ────────────────────────────────────────────────────
  SELECT COALESCE(sum(abs(current_balance)), 0)
  INTO v_banche_neg
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance < 0;

  -- Debiti fornitori = `purchase_orders.total` non saldati (no supplier_payments)
  SELECT COALESCE(sum(COALESCE(po.total, 0)), 0)
  INTO v_debiti_forn
  FROM public.purchase_orders po
  WHERE po.company_id = v_company_id
    AND po.status IN ('pending','confirmed','received');

  -- Debiti tributari = f24_entries non pagati
  SELECT COALESCE(sum(COALESCE(importo, 0)), 0)
  INTO v_debiti_trib
  FROM public.f24_entries
  WHERE company_id = v_company_id
    AND stato IN ('da_pagare','parzialmente_pagato')
    AND anno = p_anno;

  -- Debiti vs personale = cedolini emessi non pagati (campo data_pagamento
  -- assente → assumiamo pagati). Stub a 0 prudenziale.
  v_debiti_pers := 0;
  v_debiti_prev := 0;

  v_pas_corr    := v_banche_neg + v_debiti_forn + v_debiti_trib + v_debiti_pers + v_debiti_prev;
  v_tot_passivo := v_mezzi_propri + v_pas_consol + v_pas_corr;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id, 'anno', p_anno,
      'data_riferimento', p_data_riferimento, 'generato_il', now()
    ),
    'attivo', jsonb_build_object(
      'imm_immateriali', v_imm_imm,
      'imm_materiali',   v_imm_mat,
      'imm_finanziarie', v_imm_fin,
      'attivo_fisso',    v_attivo_fisso,
      'rimanenze',       v_rimanenze,
      'crediti_clienti', v_crediti_clienti,
      'crediti_tributari', v_crediti_trib,
      'anticipi_fornitori', v_anticipi_forn,
      'liquidita_differite', v_liq_diff,
      'cassa',           v_cassa,
      'banche_positive', v_banche_pos,
      'liquidita_immediate', v_liq_imm,
      'attivo_circolante', v_attivo_circ,
      'totale', v_tot_attivo
    ),
    'passivo', jsonb_build_object(
      'capitale_sociale', v_capitale,
      'riserve',          v_riserve,
      'utile_esercizio',  v_utile_es,
      'mezzi_propri',     v_mezzi_propri,
      'fondo_tfr',        v_tfr,
      'fondi_rischi',     v_fondi_rischi,
      'mutui_mlt',        v_mutui_mlt,
      'pas_consolidato',  v_pas_consol,
      'banche_negative',  v_banche_neg,
      'debiti_fornitori', v_debiti_forn,
      'debiti_tributari', v_debiti_trib,
      'debiti_personale', v_debiti_pers,
      'debiti_previdenziali', v_debiti_prev,
      'pas_corrente',     v_pas_corr,
      'totale',           v_tot_passivo
    ),
    'quadratura', jsonb_build_object(
      'differenza', v_tot_attivo - v_tot_passivo,
      'quadrato',   abs(v_tot_attivo - v_tot_passivo) < 1.00
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato TO authenticated;
COMMENT ON FUNCTION public.cg_get_stato_patrimoniale_riclassificato IS
  'Stato Patrimoniale riclassificato (Impieghi/Fonti) auto-popolato dai dati EiC.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_get_rating — Rating bancario stimato (4 indicatori → AAA..CCC)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_rating(
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
  IF v_company_id <> public.get_my_company_id()
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
$$;

GRANT EXECUTE ON FUNCTION public.cg_get_rating TO authenticated;
COMMENT ON FUNCTION public.cg_get_rating IS
  'Rating bancario stimato MCC-like: 4 indicatori → score 0-100 → classe AAA..CCC.';
