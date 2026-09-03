-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.8 — l'F24 composto dai dati che ci sono
-- ════════════════════════════════════════════════════════════════════════════
--
-- `silvio_tool_genera_f24_mese` inserisce una riga in `fiscal_reports` con
-- report_type 'f24' e status 'draft', e finisce lì. Nessun tributo, nessun
-- importo, nessuna scadenza: un F24 senza righe che risulta «generato».
-- `f24_entries` ha zero righe da sempre.
--
-- Adesso l'F24 si compone dai due conti che esistono davvero nel sistema e che
-- ho verificato nelle ondate precedenti:
--   • l'IVA a debito del mese, da `liquidazione_iva_periodo` (ondata 0.3);
--   • le ritenute IRPEF sui cedolini emessi, da `hr_cedolini` (ondata 5.1).
--
-- ── Cosa NON c'è dentro, e perché ──────────────────────────────────────────
-- Niente contributi INPS (servono matricola e quadro DM10, che il sistema non
-- ha), niente addizionali regionali e comunali (il calcolo del cedolino le
-- esclude esplicitamente, quindi metterle qui sarebbe inventarle), niente
-- ritenute d'acconto ai professionisti.
-- E soprattutto: **niente invio telematico**. Il tracciato Entratel è un
-- formato a campi fissi con una sua specifica, e le credenziali di invio non
-- sono qui. Un file col tracciato sbagliato viene scartato; uno col tracciato
-- giusto e i numeri incompleti viene accettato, ed è molto peggio.
-- La risposta elenca da sola cosa manca: `voci_mancanti` e `non_incluso`.

-- Il 16 cade di domenica? Si paga il primo giorno lavorativo dopo.
CREATE OR REPLACE FUNCTION public.giorno_lavorativo_successivo(p_data date)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE d date := p_data;
BEGIN
  WHILE public.festivo_italiano(d) OR extract(dow FROM d) = 6 LOOP
    d := d + 1;
  END LOOP;
  RETURN d;
END $function$;

-- Un tributo per periodo non si scrive due volte.
CREATE UNIQUE INDEX IF NOT EXISTS ux_f24_entries_periodo_tributo
  ON public.f24_entries (company_id, anno, mese, tributo_code);

CREATE OR REPLACE FUNCTION public.f24_componi(
  p_company_id uuid,
  p_anno       integer,
  p_mese       integer,
  p_rigenera   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_iva      jsonb;
  v_saldo    numeric := 0;
  v_ritenute numeric := 0;
  v_cedolini integer := 0;
  v_bozze    integer := 0;
  v_scadenza date;
  v_mancanti jsonb := '[]'::jsonb;
  v_voci     jsonb := '[]'::jsonb;
  v_totale   numeric := 0;
  v_cod_iva  text;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_mese < 1 OR p_mese > 12 THEN
    RAISE EXCEPTION 'mese fuori intervallo: %', p_mese USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.f24_entries
              WHERE company_id = p_company_id AND anno = p_anno AND mese = p_mese
                AND stato = 'pagato') THEN
    RETURN jsonb_build_object('ok', false,
      'motivo', format('l''F24 %s/%s risulta già pagato: non si ricompone', p_mese, p_anno));
  END IF;

  -- Scadenza: il 16 del mese successivo, spostato al primo giorno utile.
  v_scadenza := public.giorno_lavorativo_successivo(
                  (make_date(p_anno, p_mese, 1) + interval '1 month')::date + 15);

  -- ── IVA del mese ──────────────────────────────────────────────────────────
  v_iva := public.liquidazione_iva_periodo(p_company_id, 'mensile', p_anno, p_mese, NULL);
  IF (v_iva ->> 'calcolabile') <> 'true' THEN
    v_mancanti := v_mancanti || jsonb_build_object(
      'voce', 'IVA', 'motivo', coalesce(v_iva ->> 'motivo', 'liquidazione non calcolabile'));
  ELSE
    v_saldo := coalesce((v_iva ->> 'saldo')::numeric, 0);
    IF coalesce((v_iva ->> 'dovuto')::boolean, v_saldo > 0) AND v_saldo > 0 THEN
      -- 6001 gennaio … 6012 dicembre
      v_cod_iva := (6000 + p_mese)::text;
      v_voci := v_voci || jsonb_build_object(
        'tributo', v_cod_iva,
        'descrizione', format('IVA mensile %s', to_char(make_date(p_anno, p_mese, 1), 'MM/YYYY')),
        'importo', round(v_saldo, 2),
        'fonte', 'liquidazione_iva_periodo');
      v_totale := v_totale + round(v_saldo, 2);
    ELSE
      -- Un credito IVA non si versa: si riporta. Non è una voce dell'F24.
      v_mancanti := v_mancanti || jsonb_build_object(
        'voce', 'IVA',
        'motivo', format('nessun versamento IVA dovuto per il periodo (saldo %s)', round(v_saldo, 2)));
    END IF;
  END IF;

  -- ── Ritenute IRPEF sui cedolini emessi ────────────────────────────────────
  SELECT coalesce(sum(c.ritenute_irpef), 0), count(*)
    INTO v_ritenute, v_cedolini
    FROM public.hr_cedolini c
   WHERE c.company_id = p_company_id AND c.anno = p_anno AND c.mese = p_mese
     AND c.stato <> 'bozza';

  IF v_cedolini > 0 AND v_ritenute > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'tributo', '1001',
      'descrizione', format('Ritenute IRPEF lavoro dipendente %s', to_char(make_date(p_anno, p_mese, 1), 'MM/YYYY')),
      'importo', round(v_ritenute, 2),
      'fonte', format('%s cedolini emessi', v_cedolini));
    v_totale := v_totale + round(v_ritenute, 2);
  ELSE
    SELECT count(*) INTO v_bozze FROM public.hr_cedolini c
     WHERE c.company_id = p_company_id AND c.anno = p_anno AND c.mese = p_mese AND c.stato = 'bozza';
    v_mancanti := v_mancanti || jsonb_build_object(
      'voce', 'ritenute IRPEF (1001)',
      'motivo', CASE WHEN v_bozze > 0
                     THEN format('%s cedolini del periodo sono ancora in bozza: le ritenute non sono dovute finché non vengono emessi', v_bozze)
                     ELSE 'nessun cedolino emesso per il periodo' END);
  END IF;

  -- ── Scrittura ─────────────────────────────────────────────────────────────
  IF p_rigenera THEN
    DELETE FROM public.f24_entries
     WHERE company_id = p_company_id AND anno = p_anno AND mese = p_mese AND stato = 'da_pagare';
  END IF;

  INSERT INTO public.f24_entries (company_id, anno, mese, tributo_code, tributo_descrizione,
                                  importo, stato, data_scadenza, note)
  SELECT p_company_id, p_anno, p_mese, v ->> 'tributo', v ->> 'descrizione',
         (v ->> 'importo')::numeric, 'da_pagare', v_scadenza,
         'Composto dai dati del gestionale. ' || (v ->> 'fonte')
    FROM jsonb_array_elements(v_voci) v
  ON CONFLICT (company_id, anno, mese, tributo_code) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', p_company_id, 'anno', p_anno, 'mese', p_mese,
    'scadenza', v_scadenza,
    'voci', v_voci,
    'totale_da_versare', round(v_totale, 2),
    'voci_mancanti', v_mancanti,
    'non_incluso', jsonb_build_array(
      'contributi INPS: servono matricola aziendale e quadro DM10, che il sistema non ha',
      'addizionali regionali e comunali: il calcolo del cedolino le esclude, metterle qui sarebbe inventarle',
      'ritenute d''acconto ai professionisti'),
    'invio_telematico', 'non implementato: il tracciato Entratel e le credenziali di invio non sono in questo sistema',
    'da_rivedere_da_un_commercialista', true);
END $function$;

COMMENT ON FUNCTION public.f24_componi(uuid, integer, integer, boolean) IS
  'Compone le righe F24 del mese dai dati che esistono (IVA e ritenute sui cedolini emessi), elencando esplicitamente le voci che mancano e quelle non incluse. Non trasmette nulla.';

REVOKE ALL ON FUNCTION public.f24_componi(uuid, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f24_componi(uuid, integer, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.giorno_lavorativo_successivo(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.giorno_lavorativo_successivo(date) TO authenticated, service_role;

-- L'ingresso storico smette di produrre un F24 vuoto.
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_f24_mese(
  p_company_id uuid, p_year integer, p_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.f24_componi(p_company_id, p_year, p_month, false);
END $function$;
