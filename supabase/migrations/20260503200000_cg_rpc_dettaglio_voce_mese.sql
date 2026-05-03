-- MP-CG-09 — Drill-down: dettaglio movimenti per (codice voce CE, mese)
-- Ritorna le sub-righe Excel-style: per la voce "Provvigioni" del mese di
-- Marzo, lista delle singole fatture/movimenti che hanno generato il totale.
--
-- Mapping codice CE → fonte:
--   '01'                              → fatture emesse (v_cg_ricavi_classificati)
--   '03','05','07','08','10','11','12','13','14'
--                                      → v_cg_costi_classificati con macro_voce
--   '06'                              → cedolini (se presenti) altrimenti macro 'costo_personale'
--   '09'                              → cespiti pro-quota
--   altri (subtotali, '02','04','15') → []

CREATE OR REPLACE FUNCTION public.cg_get_dettaglio_voce_mese(
  p_company_id uuid    DEFAULT NULL,
  p_anno       int     DEFAULT extract(year from current_date)::int,
  p_mese       int     DEFAULT extract(month from current_date)::int,
  p_codice     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_macro_voce text;
  v_label      text;
  v_totale     numeric(14,2) := 0;
  v_righe      jsonb := '[]'::jsonb;
  v_raggr      jsonb := '[]'::jsonb;
  v_has_cedolini boolean := false;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id non risolvibile';
  END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- ── Ricavi vendite (codice 01) ────────────────────────────────────────────
  IF p_codice = '01' THEN
    v_label := 'Ricavi delle vendite';

    SELECT jsonb_agg(jsonb_build_object(
              'id', i.id,
              'source_table', 'invoices',
              'data', i.issue_date,
              'descrizione', COALESCE(i.invoice_number, i.id::text),
              'controparte', i.client_company_name,
              'voce_chiave', i.document_type,
              'categoria', NULL,
              'importo', (COALESCE(i.total, 0) - COALESCE(i.tax_amount, 0))
            ) ORDER BY i.issue_date DESC),
           COALESCE(sum(COALESCE(i.total, 0) - COALESCE(i.tax_amount, 0)), 0)
    INTO v_righe, v_totale
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND extract(year  FROM i.issue_date)::int = p_anno
      AND extract(month FROM i.issue_date)::int = p_mese
      AND i.status NOT IN ('cancelled','draft','annullata','bozza');

    -- Raggruppamento per cliente
    SELECT jsonb_agg(jsonb_build_object(
              'etichetta', etichetta,
              'totale', tot,
              'count', n
           ) ORDER BY tot DESC)
    INTO v_raggr
    FROM (
      SELECT COALESCE(i.client_company_name, '— senza cliente —') AS etichetta,
             sum(COALESCE(i.total, 0) - COALESCE(i.tax_amount, 0)) AS tot,
             count(*) AS n
      FROM public.invoices i
      WHERE i.company_id = v_company_id
        AND extract(year  FROM i.issue_date)::int = p_anno
        AND extract(month FROM i.issue_date)::int = p_mese
        AND i.status NOT IN ('cancelled','draft','annullata','bozza')
      GROUP BY COALESCE(i.client_company_name, '— senza cliente —')
    ) r;

  -- ── Costo del personale (codice 06) ───────────────────────────────────────
  ELSIF p_codice = '06' THEN
    v_label := 'Costo del personale';

    SELECT EXISTS(
      SELECT 1 FROM public.cedolini
       WHERE company_id = v_company_id AND anno = p_anno AND mese = p_mese
         AND stato IN ('emesso','pagato')
    ) INTO v_has_cedolini;

    IF v_has_cedolini THEN
      SELECT jsonb_agg(jsonb_build_object(
                'id', cd.id,
                'source_table', 'cedolini',
                'data', make_date(cd.anno, cd.mese, 1),
                'descrizione', 'Cedolino · ' || cd.employee_name,
                'controparte', cd.employee_name,
                'voce_chiave', 'lordo+contr_datore',
                'categoria', cd.stato,
                'importo', COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0)
             ) ORDER BY cd.employee_name),
             COALESCE(sum(COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0)), 0)
      INTO v_righe, v_totale
      FROM public.cedolini cd
      WHERE cd.company_id = v_company_id
        AND cd.anno = p_anno
        AND cd.mese = p_mese
        AND cd.stato IN ('emesso','pagato');

      SELECT jsonb_agg(jsonb_build_object(
                'etichetta', etichetta,
                'totale', tot,
                'count', n
             ) ORDER BY tot DESC)
      INTO v_raggr
      FROM (
        SELECT cd.employee_name AS etichetta,
               sum(COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0)) AS tot,
               count(*) AS n
        FROM public.cedolini cd
        WHERE cd.company_id = v_company_id
          AND cd.anno = p_anno
          AND cd.mese = p_mese
          AND cd.stato IN ('emesso','pagato')
        GROUP BY cd.employee_name
      ) r;
    ELSE
      v_macro_voce := 'costo_personale';
    END IF;

  -- ── Ammortamenti (codice 09) ─────────────────────────────────────────────
  ELSIF p_codice = '09' THEN
    v_label := 'Ammortamenti';
    -- Quota mensile = quota annuale / 12, solo cespiti attivi nel mese.
    SELECT jsonb_agg(jsonb_build_object(
              'id', c.id,
              'source_table', 'cespiti',
              'data', make_date(p_anno, p_mese, 1),
              'descrizione', c.descrizione,
              'controparte', NULL,
              'voce_chiave', c.categoria,
              'categoria', c.categoria,
              'importo', round(quota_mensile::numeric, 2)
            ) ORDER BY quota_mensile DESC),
           COALESCE(sum(round(quota_mensile::numeric, 2)), 0)
    INTO v_righe, v_totale
    FROM (
      SELECT c.id, c.descrizione, c.categoria,
        CASE
          WHEN c.aliquota_amm > 0
            THEN c.costo_storico * (c.aliquota_amm / 100.0) / 12.0
          WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0
            THEN c.costo_storico / c.vita_utile_mesi
          ELSE 0
        END AS quota_mensile
      FROM public.cespiti c
      WHERE c.company_id = v_company_id
        AND c.is_active
        AND c.data_acquisto <= make_date(p_anno, p_mese, 28)
        AND (c.data_dismissione IS NULL OR c.data_dismissione >= make_date(p_anno, p_mese, 1))
    ) c
    WHERE quota_mensile > 0;

    -- Raggruppamento ammortamenti per categoria cespite.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'etichetta', etichetta,
              'totale', tot,
              'count', n
           ) ORDER BY tot DESC), '[]'::jsonb)
    INTO v_raggr
    FROM (
      SELECT c.categoria AS etichetta,
             sum(round(quota_mensile::numeric, 2)) AS tot,
             count(*) AS n
      FROM (
        SELECT c.categoria,
          CASE
            WHEN c.aliquota_amm > 0
              THEN c.costo_storico * (c.aliquota_amm / 100.0) / 12.0
            WHEN c.vita_utile_mesi IS NOT NULL AND c.vita_utile_mesi > 0
              THEN c.costo_storico / c.vita_utile_mesi
            ELSE 0
          END AS quota_mensile
        FROM public.cespiti c
        WHERE c.company_id = v_company_id
          AND c.is_active
          AND c.data_acquisto <= make_date(p_anno, p_mese, 28)
          AND (c.data_dismissione IS NULL OR c.data_dismissione >= make_date(p_anno, p_mese, 1))
      ) c
      WHERE quota_mensile > 0
      GROUP BY c.categoria
    ) g;

  -- ── Voci macro_voce semplici ─────────────────────────────────────────────
  ELSE
    -- Mapping codice → macro_voce
    v_macro_voce := CASE p_codice
      WHEN '03' THEN 'acquisti_materie'
      WHEN '05' THEN 'costi_produttivi'
      WHEN '07' THEN 'costi_commerciali'
      WHEN '08' THEN 'costi_amministrativi'
      WHEN '10' THEN 'oneri_tributari'
      WHEN '11' THEN 'oneri_finanziari'
      WHEN '12' THEN 'proventi_finanziari'
      WHEN '13' THEN 'ricavi_extra'
      WHEN '14' THEN 'costi_extra'
      ELSE NULL
    END;

    v_label := CASE p_codice
      WHEN '03' THEN 'Acquisti materie'
      WHEN '05' THEN 'Costi produttivi'
      WHEN '07' THEN 'Costi commerciali'
      WHEN '08' THEN 'Costi amministrativi'
      WHEN '10' THEN 'Oneri tributari'
      WHEN '11' THEN 'Oneri finanziari'
      WHEN '12' THEN 'Proventi finanziari'
      WHEN '13' THEN 'Ricavi extra-gest.'
      WHEN '14' THEN 'Costi extra-gest.'
      ELSE p_codice
    END;
  END IF;

  -- Se abbiamo un macro_voce da risolvere, costruiamo la lista da
  -- v_cg_costi_classificati + arricchiamo con descrizione/controparte
  -- sui sorgenti reali (company_costs, bank_transactions, prima_nota_entries).
  IF v_macro_voce IS NOT NULL THEN

    WITH base AS (
      SELECT u.source_table, u.source_value, u.voce_chiave, u.data, u.importo,
             u.row_id, u.descrizione, u.controparte
      FROM (
        SELECT 'company_costs'::text AS source_table,
               cc.id::text AS row_id,
               cc.category AS source_value,
               cl.voce_chiave,
               COALESCE(cc.paid_date, cc.due_date)::date AS data,
               cc.amount AS importo,
               cc.name AS descrizione,
               s.name AS controparte
        FROM public.company_costs cc
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = cc.company_id
         AND cl.source_table = 'company_costs'
         AND cl.source_value = cc.category
         AND cl.is_active = true
        LEFT JOIN public.suppliers s ON s.id = cc.supplier_id
        WHERE cc.company_id = v_company_id
          AND cc.amount IS NOT NULL
          AND extract(year  FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
          AND extract(month FROM COALESCE(cc.paid_date, cc.due_date))::int = p_mese
          AND cl.macro_voce = v_macro_voce

        UNION ALL

        SELECT 'bank_transactions'::text,
               bt.id::text,
               bt.category,
               cl.voce_chiave,
               COALESCE(bt.value_date, bt.booking_date)::date,
               abs(bt.amount),
               COALESCE(bt.description, bt.reference, '— movimento bancario —'),
               COALESCE(bt.counterparty_name, bt.merchant_name, bt.creditor_name)
        FROM public.bank_transactions bt
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = bt.company_id
         AND cl.source_table = 'bank_transactions'
         AND cl.source_value = bt.category
         AND cl.is_active = true
        WHERE bt.company_id = v_company_id
          AND bt.amount < 0
          AND bt.id NOT IN (
            SELECT br.transaction_id FROM public.bank_reconciliations br WHERE br.invoice_id IS NOT NULL
          )
          AND extract(year  FROM COALESCE(bt.value_date, bt.booking_date))::int = p_anno
          AND extract(month FROM COALESCE(bt.value_date, bt.booking_date))::int = p_mese
          AND cl.macro_voce = v_macro_voce

        UNION ALL

        SELECT 'prima_nota'::text,
               pn.id::text,
               pn.category,
               cl.voce_chiave,
               pn.entry_date::date,
               pn.amount,
               pn.description,
               s2.name
        FROM public.prima_nota_entries pn
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = pn.company_id
         AND cl.source_table = 'prima_nota'
         AND cl.source_value = pn.category
         AND cl.is_active = true
        LEFT JOIN public.suppliers s2 ON s2.id = pn.supplier_id
        WHERE pn.company_id = v_company_id
          AND pn.direction = 'out'
          AND extract(year  FROM pn.entry_date)::int = p_anno
          AND extract(month FROM pn.entry_date)::int = p_mese
          AND cl.macro_voce = v_macro_voce
      ) u
    )
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', row_id,
        'source_table', source_table,
        'data', data,
        'descrizione', descrizione,
        'controparte', controparte,
        'voce_chiave', voce_chiave,
        'categoria', source_value,
        'importo', importo
      ) ORDER BY data DESC, importo DESC), '[]'::jsonb),
      COALESCE(sum(importo), 0)
    INTO v_righe, v_totale
    FROM base;

    -- Raggruppamento per voce_chiave (sub-righe Excel)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'etichetta', etichetta,
              'totale', tot,
              'count', n
           ) ORDER BY tot DESC), '[]'::jsonb)
    INTO v_raggr
    FROM (
      SELECT COALESCE(b.voce_chiave, b.source_value, '— non classificato —') AS etichetta,
             sum(b.importo) AS tot,
             count(*) AS n
      FROM (
        SELECT cl.voce_chiave, cc.category AS source_value, cc.amount AS importo
        FROM public.company_costs cc
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = cc.company_id
         AND cl.source_table = 'company_costs'
         AND cl.source_value = cc.category
         AND cl.is_active = true
        WHERE cc.company_id = v_company_id
          AND cc.amount IS NOT NULL
          AND extract(year  FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
          AND extract(month FROM COALESCE(cc.paid_date, cc.due_date))::int = p_mese
          AND cl.macro_voce = v_macro_voce

        UNION ALL

        SELECT cl.voce_chiave, bt.category, abs(bt.amount)
        FROM public.bank_transactions bt
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = bt.company_id
         AND cl.source_table = 'bank_transactions'
         AND cl.source_value = bt.category
         AND cl.is_active = true
        WHERE bt.company_id = v_company_id
          AND bt.amount < 0
          AND bt.id NOT IN (
            SELECT br.transaction_id FROM public.bank_reconciliations br WHERE br.invoice_id IS NOT NULL
          )
          AND extract(year  FROM COALESCE(bt.value_date, bt.booking_date))::int = p_anno
          AND extract(month FROM COALESCE(bt.value_date, bt.booking_date))::int = p_mese
          AND cl.macro_voce = v_macro_voce

        UNION ALL

        SELECT cl.voce_chiave, pn.category, pn.amount
        FROM public.prima_nota_entries pn
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = pn.company_id
         AND cl.source_table = 'prima_nota'
         AND cl.source_value = pn.category
         AND cl.is_active = true
        WHERE pn.company_id = v_company_id
          AND pn.direction = 'out'
          AND extract(year  FROM pn.entry_date)::int = p_anno
          AND extract(month FROM pn.entry_date)::int = p_mese
          AND cl.macro_voce = v_macro_voce
      ) b
      GROUP BY COALESCE(b.voce_chiave, b.source_value, '— non classificato —')
    ) g;
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno',       p_anno,
      'mese',       p_mese,
      'codice',     p_codice,
      'label',      v_label,
      'totale',     v_totale,
      'macro_voce', v_macro_voce,
      'has_cedolini', v_has_cedolini,
      'generato_il', now()
    ),
    'raggruppamento', COALESCE(v_raggr, '[]'::jsonb),
    'righe',          COALESCE(v_righe, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_dettaglio_voce_mese FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_dettaglio_voce_mese TO authenticated;

COMMENT ON FUNCTION public.cg_get_dettaglio_voce_mese IS
  'Drill-down per (codice CE, anno, mese): ritorna le sub-righe Excel-style con raggruppamento e dettaglio movimenti.';

-- Wrapper *_safe gated dal feature flag (defense in depth).
CREATE OR REPLACE FUNCTION public.cg_get_dettaglio_voce_mese_safe(
  p_anno   int,
  p_mese   int,
  p_codice text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_dettaglio_voce_mese(v_company_id, p_anno, p_mese, p_codice);
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_dettaglio_voce_mese_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_dettaglio_voce_mese_safe TO authenticated;

COMMENT ON FUNCTION public.cg_get_dettaglio_voce_mese_safe IS
  'Wrapper feature-flag-gated di cg_get_dettaglio_voce_mese.';
