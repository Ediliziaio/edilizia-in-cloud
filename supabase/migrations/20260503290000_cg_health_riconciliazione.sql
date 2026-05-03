-- MP-CG-18 — Health-check Dati + Riconciliazione Commercialista

-- ════════════════════════════════════════════════════════════════════════════
-- 1) cg_get_health_check — diagnostica completezza dati per fare CG
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cg_get_health_check(
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
  v_score int := 0;
  v_max_score int := 10;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
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
  FROM public.scadenze WHERE company_id = v_company_id AND status NOT IN ('paid','cancelled');

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

  RETURN jsonb_build_object(
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
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_health_check FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_health_check TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_health_check_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_health_check(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_health_check_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_health_check_safe TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) cg_riconciliazione_commercialista — Quadra col commercialista?
-- ════════════════════════════════════════════════════════════════════════════
--
-- L'utente inserisce 4-5 numeri della Nota Integrativa depositata.
-- Confrontiamo con i nostri prospetti e segnaliamo discrepanze.

CREATE TABLE IF NOT EXISTS public.cg_riconciliazione_commercialista (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anno         int  NOT NULL,
  ricavi_dichiarati      numeric(14,2),
  costi_dichiarati       numeric(14,2),
  utile_dichiarato       numeric(14,2),
  patrimonio_netto_dichiarato numeric(14,2),
  imposte_dichiarate     numeric(14,2),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cg_riconciliazione_unique UNIQUE (company_id, anno)
);

ALTER TABLE public.cg_riconciliazione_commercialista ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cg_ric_select ON public.cg_riconciliazione_commercialista;
CREATE POLICY cg_ric_select ON public.cg_riconciliazione_commercialista FOR SELECT
  USING (company_id = public.get_my_company_id()
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS cg_ric_insert ON public.cg_riconciliazione_commercialista;
CREATE POLICY cg_ric_insert ON public.cg_riconciliazione_commercialista FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS cg_ric_update ON public.cg_riconciliazione_commercialista;
CREATE POLICY cg_ric_update ON public.cg_riconciliazione_commercialista FOR UPDATE
  USING (company_id = public.get_my_company_id());

DROP TRIGGER IF EXISTS trg_cg_ric_updated_at ON public.cg_riconciliazione_commercialista;
CREATE TRIGGER trg_cg_ric_updated_at
  BEFORE UPDATE ON public.cg_riconciliazione_commercialista
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.cg_get_riconciliazione(
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
  v_dich       record;
  v_ce         jsonb;
  v_sp         jsonb;
  v_ricavi_cg  numeric;
  v_utile_cg   numeric;
  v_pn_cg      numeric;
  v_imposte_cg numeric;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  SELECT * INTO v_dich FROM public.cg_riconciliazione_commercialista
  WHERE company_id = v_company_id AND anno = p_anno;

  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);
  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);

  SELECT (v->>'valore')::numeric INTO v_ricavi_cg
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '01';
  SELECT (v->>'valore')::numeric INTO v_utile_cg
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = 'L';
  SELECT (v->>'valore')::numeric INTO v_imposte_cg
  FROM jsonb_array_elements(v_ce->'voci') v WHERE v->>'codice' = '15';
  v_pn_cg := COALESCE((v_sp->'passivo'->>'mezzi_propri')::numeric, 0);

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('company_id', v_company_id, 'anno', p_anno, 'generato_il', now()),
    'dichiarato', CASE WHEN v_dich IS NOT NULL THEN jsonb_build_object(
      'ricavi',           v_dich.ricavi_dichiarati,
      'costi',            v_dich.costi_dichiarati,
      'utile',            v_dich.utile_dichiarato,
      'patrimonio_netto', v_dich.patrimonio_netto_dichiarato,
      'imposte',          v_dich.imposte_dichiarate,
      'note',             v_dich.note,
      'updated_at',       v_dich.updated_at
    ) ELSE NULL END,
    'sistema', jsonb_build_object(
      'ricavi',           v_ricavi_cg,
      'utile',            v_utile_cg,
      'patrimonio_netto', v_pn_cg,
      'imposte',          v_imposte_cg
    ),
    'discrepanze', CASE WHEN v_dich IS NOT NULL THEN jsonb_build_object(
      'ricavi_eur',  COALESCE(v_dich.ricavi_dichiarati, 0) - COALESCE(v_ricavi_cg, 0),
      'ricavi_pct',  CASE WHEN COALESCE(v_dich.ricavi_dichiarati, 0) <> 0
                          THEN ((COALESCE(v_ricavi_cg, 0) - v_dich.ricavi_dichiarati) / v_dich.ricavi_dichiarati) * 100
                          ELSE NULL END,
      'utile_eur',   COALESCE(v_dich.utile_dichiarato, 0) - COALESCE(v_utile_cg, 0),
      'utile_pct',   CASE WHEN COALESCE(v_dich.utile_dichiarato, 0) <> 0
                          THEN ((COALESCE(v_utile_cg, 0) - v_dich.utile_dichiarato) / v_dich.utile_dichiarato) * 100
                          ELSE NULL END,
      'pn_eur',      COALESCE(v_dich.patrimonio_netto_dichiarato, 0) - COALESCE(v_pn_cg, 0),
      'imposte_eur', COALESCE(v_dich.imposte_dichiarate, 0) - COALESCE(v_imposte_cg, 0)
    ) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cg_get_riconciliazione FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_riconciliazione TO authenticated;

CREATE OR REPLACE FUNCTION public.cg_get_riconciliazione_safe(p_anno int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company_id uuid := public.get_my_company_id();
BEGIN
  PERFORM public._cg_assert_enabled(v_company_id);
  RETURN public.cg_get_riconciliazione(v_company_id, p_anno);
END;
$$;
REVOKE ALL ON FUNCTION public.cg_get_riconciliazione_safe FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_riconciliazione_safe TO authenticated;
