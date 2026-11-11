-- Ratei e risconti nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 2).
--
-- Un elenco per esercizio: costo o ricavo, conto, importo, periodo dal/al. Il programma calcola a
-- giorni la quota di competenza da spostare:
--   - risconto attivo  (costo pagato/fatturato che vale anche per l'anno dopo): D 07.02 / A costo
--   - risconto passivo (ricavo fatturato che vale anche per l'anno dopo):       D ricavo / A 14.02
--   - rateo attivo     (ricavo maturato e non ancora fatturato):                D 07.01 / A ricavo
--   - rateo passivo    (costo maturato e non ancora fatturato):                 D costo / A 14.01
-- Scrittura al 31/12 (origine «ratei_risconti») e il suo storno all'01/01 dell'anno dopo (origine
-- «riapertura_ratei_risconti»): la competenza torna dove deve, senza mano. Se l'elenco cambia, le due
-- scritture si stornano e si rifanno.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.contabilita_ratei_risconti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio integer NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  tipo text NOT NULL CHECK (tipo IN ('rateo_attivo', 'rateo_passivo', 'risconto_attivo', 'risconto_passivo')),
  descrizione text NOT NULL CHECK (length(btrim(descrizione)) > 0),
  conto_id uuid NOT NULL REFERENCES public.contabilita_conti(id),
  importo numeric(14,2) NOT NULL CHECK (importo > 0),
  dal date NOT NULL,
  al date NOT NULL,
  fattura_ricevuta_id uuid REFERENCES public.fatture_ricevute(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (al >= dal)
);
CREATE INDEX IF NOT EXISTS contabilita_ratei_risconti_esercizio_idx ON public.contabilita_ratei_risconti (company_id, esercizio);
COMMENT ON TABLE public.contabilita_ratei_risconti IS 'Ratei e risconti di fine esercizio: la quota di competenza si calcola a giorni (contabilita_quota_rateo_risconto).';

-- Il conto è un costo (risconto attivo, rateo passivo) o un ricavo (risconto passivo, rateo attivo)
-- movimentabile della stessa azienda; la fattura, se c'è, è della stessa azienda.
CREATE OR REPLACE FUNCTION public.contabilita_ratei_risconti_coerente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_natura text;
  v_attesa text := CASE WHEN new.tipo IN ('risconto_attivo', 'rateo_passivo') THEN 'costo' ELSE 'ricavo' END;
BEGIN
  SELECT natura INTO v_natura FROM public.contabilita_conti
   WHERE id = new.conto_id AND company_id = new.company_id AND movimentabile AND attivo;
  IF v_natura IS NULL THEN RAISE EXCEPTION 'Il conto non è un conto movimentabile di questa azienda' USING errcode = '23514'; END IF;
  IF v_natura <> v_attesa THEN
    RAISE EXCEPTION 'Per un % serve un conto di %', replace(new.tipo, '_', ' '), v_attesa USING errcode = '23514';
  END IF;
  IF new.fattura_ricevuta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fatture_ricevute f WHERE f.id = new.fattura_ricevuta_id AND f.company_id = new.company_id) THEN
    RAISE EXCEPTION 'La fattura è di un''altra azienda' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ratei_risconti_coerente() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_contabilita_ratei_risconti_coerente ON public.contabilita_ratei_risconti;
CREATE TRIGGER trg_contabilita_ratei_risconti_coerente BEFORE INSERT OR UPDATE ON public.contabilita_ratei_risconti
  FOR EACH ROW EXECUTE FUNCTION public.contabilita_ratei_risconti_coerente();

ALTER TABLE public.contabilita_ratei_risconti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contabilita_ratei_risconti FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contabilita_ratei_risconti TO authenticated;
-- permesso contabilita_ratei_risconti: la legge chi legge la contabilità, la scrive chi la scrive.
DROP POLICY IF EXISTS contabilita_ratei_risconti_lettura ON public.contabilita_ratei_risconti;
CREATE POLICY contabilita_ratei_risconti_lettura ON public.contabilita_ratei_risconti FOR SELECT TO authenticated
  USING (public.contabilita_puo_leggere(company_id));
DROP POLICY IF EXISTS contabilita_ratei_risconti_scrittura ON public.contabilita_ratei_risconti;
CREATE POLICY contabilita_ratei_risconti_scrittura ON public.contabilita_ratei_risconti FOR ALL TO authenticated
  USING (public.contabilita_puo_scrivere(company_id)) WITH CHECK (public.contabilita_puo_scrivere(company_id));

-- La quota da spostare, a giorni (estremi compresi). Rateo: i giorni fino al 31/12; risconto: i giorni dopo.
CREATE OR REPLACE FUNCTION public.contabilita_quota_rateo_risconto(p_tipo text, p_importo numeric, p_dal date, p_al date, p_anno int)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_al < p_dal THEN 0 ELSE round(p_importo * (
    CASE WHEN p_tipo LIKE 'rateo%'
      THEN greatest(0, least(p_al, make_date(p_anno, 12, 31)) - p_dal + 1)
      ELSE greatest(0, p_al - greatest(p_dal, make_date(p_anno + 1, 1, 1)) + 1) END
  )::numeric / (p_al - p_dal + 1), 2) END;
$$;
REVOKE ALL ON FUNCTION public.contabilita_quota_rateo_risconto(text, numeric, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_quota_rateo_risconto(text, numeric, date, date, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.contabilita_ratei_risconti_registra(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  v_id_storno uuid := md5('riapertura_ratei_risconti:' || p_company || ':' || p_anno)::uuid;
  x record; v_q numeric; v_righe jsonb := '[]'::jsonb; v_elenco jsonb := '[]'::jsonb; v_mancano text[] := '{}';
  v_ruolo text; v_vecchia record; v_vecchia_ap record; v_righe_vecchie jsonb; v_registrata boolean; v_tot numeric := 0;
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

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF v_registrata THEN
      SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', dare, 'avere', avere) ORDER BY conto_id, dare, avere)
        INTO v_righe_vecchie FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id;
    END IF;
    IF NOT v_registrata OR v_righe_vecchie IS DISTINCT FROM (
         SELECT jsonb_agg(jsonb_build_object('conto_id', (y->>'conto_id')::uuid, 'dare', round(coalesce((y->>'dare')::numeric, 0), 2), 'avere', round(coalesce((y->>'avere')::numeric, 0), 2))
                ORDER BY (y->>'conto_id')::uuid, round(coalesce((y->>'dare')::numeric, 0), 2), round(coalesce((y->>'avere')::numeric, 0), 2))
           FROM jsonb_array_elements(v_righe) y) THEN
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
    END IF;
  END IF;
  RETURN jsonb_build_object('voci', v_elenco, 'totale', v_tot, 'registrata', v_registrata, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_ratei_risconti_registra(uuid, int, boolean) TO authenticated, service_role;
