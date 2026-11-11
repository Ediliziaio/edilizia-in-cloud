-- Fine anno: le correzioni della revisione di rimanenze e ratei/risconti (11/11/2026, docs/piano-assestamenti-fine-anno.md).
--
-- 1. contabilita_assegna_ruolo accetta solo i ruoli di fine anno, sul conto della natura giusta, e non
--    toglie più in silenzio un altro ruolo al conto scelto: prima, scegliere «Ricavi» (20.01) come
--    variazione dei lavori in corso fermava le scritture automatiche delle fatture.
-- 2. L'anteprima dice «da aggiornare» quando la scrittura registrata non è più quella che verrebbe
--    oggi (rimanenza cambiata dal Controllo di gestione, anno prima registrato dopo, elenco dei ratei
--    cambiato): prima diceva «registrate» e basta.
-- 3. Le rimanenze chiedono i conti solo per quello che c'è: un'azienda senza magazzino non sceglie i
--    conti dei materiali.
-- 4. Su cg_rimanenze_magazzino il browser legge soltanto: scrive contabilita_rimanenze.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Le righe di una scrittura registrata sono le stesse di quelle calcolate (conto, dare, avere, al centesimo)?
CREATE OR REPLACE FUNCTION public.contabilita_righe_uguali(p_scrittura uuid, p_righe jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', round(dare, 2), 'avere', round(avere, 2))
                           ORDER BY conto_id, round(dare, 2), round(avere, 2))
            FROM public.contabilita_righe WHERE scrittura_id = p_scrittura)
         IS NOT DISTINCT FROM
         (SELECT jsonb_agg(jsonb_build_object('conto_id', (y->>'conto_id')::uuid, 'dare', round(coalesce((y->>'dare')::numeric, 0), 2), 'avere', round(coalesce((y->>'avere')::numeric, 0), 2))
                           ORDER BY (y->>'conto_id')::uuid, round(coalesce((y->>'dare')::numeric, 0), 2), round(coalesce((y->>'avere')::numeric, 0), 2))
            FROM jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) y);
$$;
REVOKE ALL ON FUNCTION public.contabilita_righe_uguali(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contabilita_assegna_ruolo(p_company uuid, p_ruolo text, p_conto uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  -- I ruoli che si scelgono da Fine anno, con la natura del conto che li fa.
  v_natura text := CASE p_ruolo
    WHEN '04.01' THEN 'attivo' WHEN '04.02' THEN 'attivo' WHEN '07.01' THEN 'attivo' WHEN '07.02' THEN 'attivo'
    WHEN '14.01' THEN 'passivo' WHEN '14.02' THEN 'passivo' WHEN '20.03' THEN 'ricavo' WHEN '30.30' THEN 'costo' END;
  c record;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF v_natura IS NULL THEN RAISE EXCEPTION 'Ruolo non assegnabile da Fine anno: %', p_ruolo USING ERRCODE = '22023'; END IF;
  SELECT codice, natura, codice_standard INTO c FROM public.contabilita_conti
   WHERE id = p_conto AND company_id = p_company AND movimentabile AND attivo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Il conto non è un conto movimentabile di questa azienda' USING ERRCODE = '22023'; END IF;
  IF c.natura <> v_natura THEN RAISE EXCEPTION 'Per questo ruolo serve un conto di natura «%»', v_natura USING ERRCODE = '22023'; END IF;
  IF c.codice_standard IS NOT NULL AND c.codice_standard <> p_ruolo THEN
    RAISE EXCEPTION 'Il conto % fa già da %: scegline un altro, o crealo nel Piano dei conti', c.codice, c.codice_standard USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_conti SET codice_standard = NULL WHERE company_id = p_company AND codice_standard = p_ruolo AND id <> p_conto;
  UPDATE public.contabilita_conti SET codice_standard = p_ruolo WHERE id = p_conto;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_assegna_ruolo(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_assegna_ruolo(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_rimanenze(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true,
  p_lavori numeric DEFAULT NULL, p_materiali numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('rimanenze:' || p_company || ':' || p_anno)::uuid;
  v_ini_lav numeric := 0; v_ini_mat numeric := 0; v_fin_lav numeric; v_fin_mat numeric;
  v_prop_lav numeric; v_prop_mat numeric; v_righe jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_vecchia record; v_registrata boolean; v_da_aggiornare boolean := false;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_lavori, 0) < 0 OR coalesce(p_materiali, 0) < 0 THEN RAISE EXCEPTION 'Le rimanenze non sono negative' USING ERRCODE = '22023'; END IF;

  -- Proposte: lavori in corso dalle commesse (maturato − fatturato), materiali dalla giacenza × costo medio.
  SELECT round(coalesce(sum(lavori_in_corso), 0), 2) INTO v_prop_lav FROM public.v_cg_lavori_in_corso WHERE company_id = p_company;
  SELECT round(coalesce(sum(greatest(quantity, 0) * coalesce(unit_cost, 0)), 0), 2) INTO v_prop_mat
    FROM public.warehouse_stock WHERE company_id = p_company;

  IF NOT p_anteprima THEN
    IF p_lavori IS NOT NULL THEN
      INSERT INTO public.cg_rimanenze_lavori (company_id, esercizio, importo, fonte, created_by)
      VALUES (p_company, p_anno, round(p_lavori, 2), CASE WHEN round(p_lavori, 2) = v_prop_lav THEN 'calcolata' ELSE 'manuale' END, auth.uid())
      ON CONFLICT (company_id, esercizio) DO UPDATE SET importo = EXCLUDED.importo, fonte = EXCLUDED.fonte, updated_at = now();
    END IF;
    IF p_materiali IS NOT NULL THEN
      INSERT INTO public.cg_rimanenze_magazzino (company_id, esercizio, importo, fonte, created_by)
      VALUES (p_company, p_anno, round(p_materiali, 2), CASE WHEN round(p_materiali, 2) = v_prop_mat THEN 'calcolata' ELSE 'manuale' END, auth.uid())
      ON CONFLICT (company_id, esercizio) DO UPDATE SET importo = EXCLUDED.importo, fonte = EXCLUDED.fonte, updated_at = now();
    END IF;
  END IF;
  SELECT importo INTO v_fin_lav FROM public.cg_rimanenze_lavori WHERE company_id = p_company AND esercizio = p_anno;
  SELECT importo INTO v_fin_mat FROM public.cg_rimanenze_magazzino WHERE company_id = p_company AND esercizio = p_anno;

  IF k ? '04.02' THEN v_ini_lav := public.contabilita_saldo_senza_rimanenze(p_company, (k->>'04.02')::uuid, p_anno); END IF;
  IF k ? '04.01' THEN v_ini_mat := public.contabilita_saldo_senza_rimanenze(p_company, (k->>'04.01')::uuid, p_anno); END IF;

  -- Conti che servono: solo per quello che c'è (un'azienda senza magazzino non sceglie i conti dei materiali).
  IF v_ini_lav <> 0 OR coalesce(v_fin_lav, 0) <> 0 OR v_prop_lav <> 0 THEN
    IF NOT k ? '04.02' THEN v_mancano := array_append(v_mancano, '04.02'); END IF;
    IF NOT k ? '20.03' THEN v_mancano := array_append(v_mancano, '20.03'); END IF;
  END IF;
  IF v_ini_mat <> 0 OR coalesce(v_fin_mat, 0) <> 0 OR v_prop_mat <> 0 THEN
    IF NOT k ? '04.01' THEN v_mancano := array_append(v_mancano, '04.01'); END IF;
    IF NOT k ? '30.30' THEN v_mancano := array_append(v_mancano, '30.30'); END IF;
  END IF;

  -- Chiude le iniziali, apre le finali, sulla variazione. Senza i conti non si scrive niente.
  IF cardinality(v_mancano) = 0 THEN
    IF v_ini_lav <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'20.03', 'dare', v_ini_lav, 'Rimanenze iniziali lavori in corso')
                         || public.contabilita_riga(k->>'04.02', 'avere', v_ini_lav, 'Rimanenze iniziali lavori in corso');
    END IF;
    IF coalesce(v_fin_lav, 0) <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'04.02', 'dare', v_fin_lav, 'Rimanenze finali lavori in corso')
                         || public.contabilita_riga(k->>'20.03', 'avere', v_fin_lav, 'Rimanenze finali lavori in corso');
    END IF;
    IF v_ini_mat <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'30.30', 'dare', v_ini_mat, 'Rimanenze iniziali materiali')
                         || public.contabilita_riga(k->>'04.01', 'avere', v_ini_mat, 'Rimanenze iniziali materiali');
    END IF;
    IF coalesce(v_fin_mat, 0) <> 0 THEN
      v_righe := v_righe || public.contabilita_riga(k->>'04.01', 'dare', v_fin_mat, 'Rimanenze finali materiali')
                         || public.contabilita_riga(k->>'30.30', 'avere', v_fin_mat, 'Rimanenze finali materiali');
    END IF;
  END IF;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'rimanenze' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  -- Registrata, ma i valori di oggi (CdG, anno prima) non sono più quelli: va rifatta.
  v_da_aggiornare := v_registrata AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrata OR v_da_aggiornare THEN
      IF v_registrata THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Rimanenze cambiate', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id),
          'storno', v_vecchia.id, v_vecchia.id);
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Rimanenze',
          'Rimanenze iniziali e finali ' || p_anno, NULL, NULL, v_righe, 'rimanenze', v_id, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lavori', jsonb_build_object('iniziali', v_ini_lav, 'finali', v_fin_lav, 'proposta', v_prop_lav),
    'materiali', jsonb_build_object('iniziali', v_ini_mat, 'finali', v_fin_mat, 'proposta', v_prop_mat),
    'registrata', v_registrata,
    'da_aggiornare', v_da_aggiornare,
    'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_rimanenze(uuid, int, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_rimanenze(uuid, int, boolean, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_ratei_risconti_registra(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  v_id_storno uuid := md5('riapertura_ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  x record; v_q numeric; v_righe jsonb := '[]'::jsonb; v_elenco jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_ruolo text; v_vecchia record; v_vecchia_ap record; v_registrata boolean; v_da_aggiornare boolean := false; v_tot numeric := 0;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  FOR x IN SELECT r.*, c.codice, c.descrizione AS conto_descrizione FROM public.contabilita_ratei_risconti r
             JOIN public.contabilita_conti c ON c.id = r.conto_id
            WHERE r.company_id = p_company AND r.esercizio = p_anno ORDER BY r.tipo, r.created_at LOOP
    v_q := public.contabilita_quota_rateo_risconto(x.tipo, x.importo, x.dal, x.al, p_anno);
    v_ruolo := CASE x.tipo WHEN 'risconto_attivo' THEN '07.02' WHEN 'rateo_attivo' THEN '07.01' WHEN 'risconto_passivo' THEN '14.02' ELSE '14.01' END;
    IF NOT k ? v_ruolo AND NOT v_ruolo = ANY (v_mancano) THEN v_mancano := array_append(v_mancano, v_ruolo); END IF;
    v_elenco := v_elenco || jsonb_build_array(jsonb_build_object('id', x.id, 'tipo', x.tipo, 'descrizione', x.descrizione,
      'conto', x.codice || ' ' || x.conto_descrizione, 'importo', x.importo, 'dal', x.dal, 'al', x.al, 'quota', v_q));
    -- Senza il conto del ruolo la riga non si scrive: l'anteprima lo segnala, la registrazione si ferma.
    IF v_q > 0 AND k ? v_ruolo THEN
      v_tot := v_tot + v_q;
      -- Attivi: in dare il conto di rateo/risconto; passivi: in avere. Il costo/ricavo dall'altra parte.
      IF x.tipo IN ('risconto_attivo', 'rateo_attivo') THEN
        v_righe := v_righe || public.contabilita_riga(k->>v_ruolo, 'dare', v_q, x.descrizione) || public.contabilita_riga(x.conto_id::text, 'avere', v_q, x.descrizione);
      ELSE
        v_righe := v_righe || public.contabilita_riga(x.conto_id::text, 'dare', v_q, x.descrizione) || public.contabilita_riga(k->>v_ruolo, 'avere', v_q, x.descrizione);
      END IF;
    END IF;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ratei_risconti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;
  -- Registrati, ma l'elenco di oggi non è più quello: vanno rifatti.
  v_da_aggiornare := v_registrata AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno, nel riquadro dei conti da usare)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrata OR v_da_aggiornare THEN
      -- Via le due di prima (31/12 e la sua riapertura all'01/01), poi le nuove.
      IF v_registrata THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, v_vecchia.data_registrazione, 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ratei e risconti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
        SELECT * INTO v_vecchia_ap FROM public.contabilita_scritture s
         WHERE s.company_id = p_company AND s.origine = 'riapertura_ratei_risconti' AND s.origine_id = v_id_storno
           AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
         ORDER BY s.created_at DESC LIMIT 1;
        IF v_vecchia_ap.id IS NOT NULL THEN
          PERFORM public.contabilita_inserisci_scrittura(p_company, v_vecchia_ap.data_registrazione, 'Storno n. ' || v_vecchia_ap.numero || '/' || v_vecchia_ap.esercizio,
            'Ratei e risconti cambiati', NULL, NULL,
            (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
               FROM public.contabilita_righe WHERE scrittura_id = v_vecchia_ap.id), 'storno', v_vecchia_ap.id, v_vecchia_ap.id);
        END IF;
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ratei e risconti',
          'Ratei e risconti al 31/12/' || p_anno, NULL, NULL, v_righe, 'ratei_risconti', v_id, NULL);
        -- All'01/01 dell'anno dopo la stessa scrittura al contrario: la competenza torna sui costi e ricavi.
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno + 1, 1, 1), 'Riapertura ratei e risconti',
          'Storno dei ratei e risconti del ' || p_anno, NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', y->>'conto_id', 'dare', coalesce((y->>'avere')::numeric, 0), 'avere', coalesce((y->>'dare')::numeric, 0), 'descrizione', y->>'descrizione'))
             FROM jsonb_array_elements(v_righe) y),
          'riapertura_ratei_risconti', v_id_storno, NULL);
      END IF;
      v_registrata := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('voci', v_elenco, 'totale', v_tot, 'registrata', v_registrata, 'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cg_rimanenze_magazzino FROM authenticated;
