-- Rimanenze finali nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 1).
--
-- Le rimanenze esistevano solo nel Controllo di gestione e non arrivavano mai al libro giornale.
-- Ora, a fine anno:
--   - lavori in corso su ordinazione: cg_rimanenze_lavori (la stessa del CdG, una fonte sola);
--   - materiali di magazzino: cg_rimanenze_magazzino (nuova, gemella);
--   - una scrittura al 31/12 (origine «rimanenze») chiude le iniziali (il saldo del conto nel giornale)
--     e apre le finali sulla variazione. Se i valori cambiano si storna e si rifà.
-- I conti sono ruoli: 04.01 materiali, 04.02 lavori in corso (attivo), 30.30 variazione materiali
-- (B.11), 20.03 variazione lavori in corso (A.3). Senza il conto il programma lo dice e non registra.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.cg_rimanenze_magazzino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio integer NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  importo numeric(14,2) NOT NULL DEFAULT 0 CHECK (importo >= 0),
  fonte text NOT NULL DEFAULT 'manuale' CHECK (fonte IN ('manuale', 'calcolata')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, esercizio)
);
COMMENT ON TABLE public.cg_rimanenze_magazzino IS 'Rimanenze finali di materiali di magazzino per esercizio: le legge la contabilità generale (contabilita_rimanenze).';

ALTER TABLE public.cg_rimanenze_magazzino ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cg_rimanenze_magazzino FROM anon;
GRANT SELECT ON public.cg_rimanenze_magazzino TO authenticated;
-- permesso cg_rimanenze_magazzino: la legge chi legge la contabilità; si scrive solo da contabilita_rimanenze.
DROP POLICY IF EXISTS cg_rimanenze_magazzino_lettura ON public.cg_rimanenze_magazzino;
CREATE POLICY cg_rimanenze_magazzino_lettura ON public.cg_rimanenze_magazzino FOR SELECT TO authenticated
  USING (public.contabilita_puo_leggere(company_id));

-- Il saldo (dare − avere) di un conto a fine esercizio, senza la scrittura delle rimanenze di
-- quell'esercizio (e i suoi storni): è la rimanenza iniziale ancora aperta sul conto.
CREATE OR REPLACE FUNCTION public.contabilita_saldo_senza_rimanenze(p_company uuid, p_conto uuid, p_anno int)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(sum(r.dare - r.avere), 0)
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id = r.scrittura_id
   WHERE s.company_id = p_company AND r.conto_id = p_conto AND s.data_registrazione <= make_date(p_anno, 12, 31)
     AND NOT (s.origine = 'rimanenze' AND s.esercizio = p_anno)
     AND NOT (s.origine = 'storno' AND EXISTS (
       SELECT 1 FROM public.contabilita_scritture o WHERE o.id = s.storno_di AND o.origine = 'rimanenze' AND o.esercizio = p_anno));
$$;
REVOKE ALL ON FUNCTION public.contabilita_saldo_senza_rimanenze(uuid, uuid, int) FROM PUBLIC, anon, authenticated;

-- Anteprima e registrazione. p_lavori / p_materiali: le rimanenze finali da salvare (NULL = lascia
-- quella salvata; se non c'è, nessuna). In anteprima propone i valori calcolati.
CREATE OR REPLACE FUNCTION public.contabilita_rimanenze(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true,
  p_lavori numeric DEFAULT NULL, p_materiali numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('rimanenze:' || p_company || ':' || p_anno)::uuid;
  v_ini_lav numeric := 0; v_ini_mat numeric := 0; v_fin_lav numeric; v_fin_mat numeric;
  v_prop_lav numeric; v_prop_mat numeric; v_righe jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_vecchia record; v_registrata boolean; v_righe_vecchie jsonb;
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

  -- Conti che servono: solo per quello che c'è da scrivere.
  IF (v_ini_lav <> 0 OR coalesce(v_fin_lav, 0) <> 0) OR p_anteprima THEN
    IF NOT k ? '04.02' THEN v_mancano := array_append(v_mancano, '04.02'); END IF;
    IF NOT k ? '20.03' THEN v_mancano := array_append(v_mancano, '20.03'); END IF;
  END IF;
  IF (v_ini_mat <> 0 OR coalesce(v_fin_mat, 0) <> 0) OR p_anteprima THEN
    IF NOT k ? '04.01' THEN v_mancano := array_append(v_mancano, '04.01'); END IF;
    IF NOT k ? '30.30' THEN v_mancano := array_append(v_mancano, '30.30'); END IF;
  END IF;

  -- Chiude le iniziali, apre le finali, sulla variazione.
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

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'rimanenze' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrata := v_vecchia.id IS NOT NULL;

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno → Conti delle scritture di fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    -- Uguale a quella registrata: niente da fare.
    IF v_registrata THEN
      SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', dare, 'avere', avere) ORDER BY conto_id, dare, avere)
        INTO v_righe_vecchie FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id;
    END IF;
    IF NOT v_registrata OR v_righe_vecchie IS DISTINCT FROM (
         SELECT jsonb_agg(jsonb_build_object('conto_id', (x->>'conto_id')::uuid, 'dare', round(coalesce((x->>'dare')::numeric, 0), 2), 'avere', round(coalesce((x->>'avere')::numeric, 0), 2))
                ORDER BY (x->>'conto_id')::uuid, round(coalesce((x->>'dare')::numeric, 0), 2), round(coalesce((x->>'avere')::numeric, 0), 2))
           FROM jsonb_array_elements(v_righe) x) THEN
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
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lavori', jsonb_build_object('iniziali', v_ini_lav, 'finali', v_fin_lav, 'proposta', v_prop_lav),
    'materiali', jsonb_build_object('iniziali', v_ini_mat, 'finali', v_fin_mat, 'proposta', v_prop_mat),
    'registrata', v_registrata,
    'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_rimanenze(uuid, int, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_rimanenze(uuid, int, boolean, numeric, numeric) TO authenticated, service_role;

-- Assegna un ruolo a un conto del piano (un conto per ruolo nell'azienda): il conto che faceva da
-- ruolo prima lo perde. Natura e sezione restano quelle del conto.
CREATE OR REPLACE FUNCTION public.contabilita_assegna_ruolo(p_company uuid, p_ruolo text, p_conto uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF p_ruolo !~ '^[0-9]{2}\.[0-9]{2}$' THEN RAISE EXCEPTION 'Ruolo non valido' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contabilita_conti WHERE id = p_conto AND company_id = p_company AND movimentabile AND attivo) THEN
    RAISE EXCEPTION 'Il conto non è un conto movimentabile di questa azienda' USING ERRCODE = '22023';
  END IF;
  UPDATE public.contabilita_conti SET codice_standard = NULL WHERE company_id = p_company AND codice_standard = p_ruolo AND id <> p_conto;
  UPDATE public.contabilita_conti SET codice_standard = p_ruolo WHERE id = p_conto;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_assegna_ruolo(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_assegna_ruolo(uuid, text, uuid) TO authenticated, service_role;
