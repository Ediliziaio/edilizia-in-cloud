-- Registro dei cespiti nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 3).
--
-- Il registro resta la tabella cespiti del Controllo di gestione; qui prende quello che serve alla
-- partita doppia:
--   - i conti del bene, del fondo e dell'ammortamento, per cespite (proposti dalla categoria);
--   - il fondo noto a una data (fondo_iniziale al 01/01 di fondo_iniziale_anno), per chi arriva
--     con cespiti già in parte ammortizzati;
--   - le quote registrate, anno per anno (contabilita_cespiti_quote): il fondo si legge da lì, non si
--     ricostruisce più dagli anni trascorsi (resta la stima solo dove non c'è altro, e lo si dice);
--   - la riga della fattura ricevuta da cui nasce, e la cessione con plusvalenza o minusvalenza.
-- Gli ammortamenti passano in contabilita_ammortamenti: se cambiano dopo la registrazione la
-- scrittura si storna e si rifà, come rimanenze e ratei.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cespiti
  ADD COLUMN IF NOT EXISTS conto_bene_id uuid REFERENCES public.contabilita_conti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conto_fondo_id uuid REFERENCES public.contabilita_conti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conto_ammortamento_id uuid REFERENCES public.contabilita_conti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fondo_iniziale numeric(14,2),
  ADD COLUMN IF NOT EXISTS fondo_iniziale_anno integer,
  ADD COLUMN IF NOT EXISTS fattura_ricevuta_id uuid REFERENCES public.fatture_ricevute(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fattura_linea text,
  ADD COLUMN IF NOT EXISTS prezzo_cessione numeric(14,2);
DO $$ BEGIN
  ALTER TABLE public.cespiti ADD CONSTRAINT cespiti_fondo_iniziale_coerente CHECK (
    (fondo_iniziale IS NULL) = (fondo_iniziale_anno IS NULL)
    AND coalesce(fondo_iniziale, 0) >= 0 AND coalesce(fondo_iniziale, 0) <= costo_storico
    AND (fondo_iniziale_anno IS NULL OR fondo_iniziale_anno BETWEEN 2000 AND 2100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cespiti_riga_fattura_unica ON public.cespiti (fattura_ricevuta_id, fattura_linea)
  WHERE fattura_ricevuta_id IS NOT NULL;
COMMENT ON COLUMN public.cespiti.fondo_iniziale IS 'Fondo ammortamento al 01/01 di fondo_iniziale_anno, per i beni già in parte ammortizzati quando la contabilità parte qui. Dopo, il fondo è la somma delle quote registrate.';

-- Conti e fattura del cespite sono della sua azienda.
CREATE OR REPLACE FUNCTION public.cespiti_contabilita_coerente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[new.conto_bene_id, new.conto_fondo_id, new.conto_ammortamento_id]) x(id)
              WHERE x.id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.contabilita_conti c WHERE c.id = x.id AND c.company_id = new.company_id AND c.movimentabile)) THEN
    RAISE EXCEPTION 'I conti del cespite vanno scelti fra quelli movimentabili della sua azienda' USING errcode = '23514';
  END IF;
  IF new.fattura_ricevuta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fatture_ricevute f WHERE f.id = new.fattura_ricevuta_id AND f.company_id = new.company_id) THEN
    RAISE EXCEPTION 'La fattura è di un''altra azienda' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.cespiti_contabilita_coerente() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_cespiti_contabilita_coerente ON public.cespiti;
CREATE TRIGGER trg_cespiti_contabilita_coerente BEFORE INSERT OR UPDATE OF conto_bene_id, conto_fondo_id, conto_ammortamento_id, fattura_ricevuta_id, company_id
  ON public.cespiti FOR EACH ROW EXECUTE FUNCTION public.cespiti_contabilita_coerente();

-- Le quote registrate: una per cespite e anno, scritte solo dalle funzioni di registrazione.
CREATE TABLE IF NOT EXISTS public.contabilita_cespiti_quote (
  cespite_id uuid NOT NULL REFERENCES public.cespiti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio integer NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  quota numeric(14,2) NOT NULL CHECK (quota >= 0),
  origine text NOT NULL CHECK (origine IN ('ammortamenti', 'cessione')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cespite_id, esercizio)
);
CREATE INDEX IF NOT EXISTS contabilita_cespiti_quote_azienda_idx ON public.contabilita_cespiti_quote (company_id, esercizio);
COMMENT ON TABLE public.contabilita_cespiti_quote IS 'Quote di ammortamento registrate in contabilità, per cespite e anno: il fondo del registro si legge da qui.';
ALTER TABLE public.contabilita_cespiti_quote ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contabilita_cespiti_quote FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contabilita_cespiti_quote FROM authenticated;
GRANT SELECT ON public.contabilita_cespiti_quote TO authenticated;
-- permesso contabilita_cespiti_quote: la legge chi legge la contabilità; la scrivono solo le funzioni.
DROP POLICY IF EXISTS contabilita_cespiti_quote_lettura ON public.contabilita_cespiti_quote;
CREATE POLICY contabilita_cespiti_quote_lettura ON public.contabilita_cespiti_quote FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));

-- I ruoli dei conti di un cespite, dalla categoria e dalla descrizione (quando il cespite non ha i suoi).
CREATE OR REPLACE FUNCTION public.contabilita_cespite_ruoli(p_categoria text, p_sottocategoria text, p_descrizione text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN lower(coalesce(p_categoria, '')) LIKE 'immater%' THEN
      -- Le immateriali si ammortizzano in diretta: il fondo è il conto del bene.
      jsonb_build_object('bene', b, 'fondo', b, 'ammortamento', '30.20')
    ELSE jsonb_build_object('ammortamento', '30.21',
      'bene', CASE WHEN t ~ '(fabbricat|immobil|capannon|terren)' THEN '02.01'
                   WHEN t ~ '(impiant|macchin|gru|escavat)' THEN '02.02'
                   WHEN t ~ '(automezz|autocarr|furgon|veicol|auto )' THEN '02.04'
                   WHEN t ~ '(mobil|arred|ufficio|computer|pc |stampant)' THEN '02.05'
                   ELSE '02.03' END,
      'fondo', CASE WHEN t ~ '(fabbricat|immobil|capannon|terren)' THEN '02.90'
                    WHEN t ~ '(impiant|macchin|gru|escavat)' THEN '02.91'
                    WHEN t ~ '(attrezz|ponteggi|utensil)' THEN '02.92'
                    ELSE '02.93' END) END
  FROM (SELECT lower(coalesce(p_sottocategoria, '') || ' ' || coalesce(p_descrizione, '') || ' ') AS t,
               CASE WHEN lower(coalesce(p_sottocategoria, '') || ' ' || coalesce(p_descrizione, '')) ~ '(software|licenz)' THEN '01.01' ELSE '01.02' END AS b) x;
$$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_ruoli(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_ruoli(text, text, text) TO authenticated, service_role;

-- I conti di un cespite: i suoi, altrimenti quelli dei ruoli. Restituisce gli id e i ruoli che mancano.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_conti(c public.cespiti, k jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE r jsonb := public.contabilita_cespite_ruoli(c.categoria, c.sottocategoria, c.descrizione); v_out jsonb := '{}'::jsonb;
  v_mancano text[] := '{}'; x text; v_id uuid;
BEGIN
  FOREACH x IN ARRAY ARRAY['bene', 'fondo', 'ammortamento'] LOOP
    v_id := CASE x WHEN 'bene' THEN c.conto_bene_id WHEN 'fondo' THEN c.conto_fondo_id ELSE c.conto_ammortamento_id END;
    -- Un'immateriale senza fondo proprio usa il conto del bene che le è stato dato.
    IF v_id IS NULL AND x = 'fondo' AND lower(coalesce(c.categoria, '')) LIKE 'immater%' THEN v_id := c.conto_bene_id; END IF;
    IF v_id IS NULL AND k ? (r->>x) THEN v_id := (k->>(r->>x))::uuid; END IF;
    IF v_id IS NULL THEN v_mancano := array_append(v_mancano, r->>x); END IF;
    v_out := v_out || jsonb_build_object(x, v_id);
  END LOOP;
  RETURN v_out || jsonb_build_object('ruoli', r, 'mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_conti(public.cespiti, jsonb) FROM PUBLIC, anon, authenticated;

-- L'aliquota del cespite (o quella dalla vita utile).
CREATE OR REPLACE FUNCTION public.contabilita_cespite_aliquota(c public.cespiti)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT coalesce(nullif(c.aliquota_amm, 0), CASE WHEN c.vita_utile_mesi > 0 THEN round(1200.0 / c.vita_utile_mesi, 4) END);
$$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_aliquota(public.cespiti) FROM PUBLIC, anon, authenticated;

-- Il fondo al 01/01 di un anno: fondo noto (o stimato) a un anno base, più le quote registrate da lì.
-- Stimato vuol dire: il cespite è più vecchio della prima quota registrata e nessuno ha detto il fondo.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_fondo(c public.cespiti, p_anno int)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_aliq numeric := public.contabilita_cespite_aliquota(c); v_piena numeric; v_base int; v_fondo numeric; v_acq int := extract(year FROM c.data_acquisto)::int;
BEGIN
  v_piena := round(c.costo_storico * coalesce(v_aliq, 0) / 100, 2);
  v_base := coalesce(c.fondo_iniziale_anno,
    (SELECT min(esercizio) FROM public.contabilita_cespiti_quote q WHERE q.cespite_id = c.id), p_anno);
  IF p_anno < v_base THEN v_base := p_anno; END IF;
  IF c.fondo_iniziale_anno IS NOT NULL AND v_base = c.fondo_iniziale_anno THEN
    v_fondo := c.fondo_iniziale;
  ELSE
    -- Stima con le regole di sempre: metà quota il primo anno, poi quote piene.
    v_fondo := CASE WHEN v_base - v_acq <= 0 THEN 0 ELSE least(c.costo_storico, round(v_piena * (v_base - v_acq - 0.5), 2)) END;
  END IF;
  v_fondo := v_fondo + coalesce((SELECT sum(quota) FROM public.contabilita_cespiti_quote q
                                  WHERE q.cespite_id = c.id AND q.esercizio >= v_base AND q.esercizio < p_anno), 0);
  RETURN jsonb_build_object('fondo', least(c.costo_storico, v_fondo),
    'stimato', NOT (c.fondo_iniziale_anno IS NOT NULL AND c.fondo_iniziale_anno <= p_anno) AND v_acq < v_base);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_fondo(public.cespiti, int) FROM PUBLIC, anon, authenticated;

-- La quota dell'anno: metà il primo anno, piena dopo; nell'anno di cessione in proporzione ai giorni
-- fino alla data di cessione. Mai oltre il residuo.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_quota(c public.cespiti, p_anno int, p_fondo numeric, p_fino_al date DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN a IS NULL THEN 0 ELSE greatest(0, least(c.costo_storico - p_fondo, round(
    CASE WHEN p_fino_al IS NOT NULL
      THEN c.costo_storico * a / 100 * (p_fino_al - greatest(make_date(p_anno, 1, 1), c.data_acquisto) + 1)::numeric
           / (make_date(p_anno + 1, 1, 1) - make_date(p_anno, 1, 1))
      WHEN extract(year FROM c.data_acquisto)::int = p_anno THEN c.costo_storico * a / 200
      ELSE c.costo_storico * a / 100 END, 2))) END
  FROM (SELECT public.contabilita_cespite_aliquota(c) AS a) x;
$$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_quota(public.cespiti, int, numeric, date) FROM PUBLIC, anon, authenticated;

-- Gli ammortamenti dell'anno: anteprima o registrazione, rifatta se cambiano.
CREATE OR REPLACE FUNCTION public.contabilita_ammortamenti(p_company uuid, p_anno int, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb := public.contabilita_conti_per_ruolo(p_company);
  v_id uuid := md5('ammortamenti:' || p_company || ':' || p_anno)::uuid;
  c public.cespiti; v_conti jsonb; v_f jsonb; v_q numeric; v_quote jsonb := '[]'::jsonb; v_righe jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_mancano text[] := '{}'; v_vecchia record; v_registrati boolean; v_da_aggiornare boolean := false;
  v_per_cespite jsonb := '[]'::jsonb; x text;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Esercizio non valido' USING ERRCODE = '22023'; END IF;

  FOR c IN
    SELECT * FROM public.cespiti ce
     WHERE ce.company_id = p_company AND ce.data_acquisto IS NOT NULL AND extract(year FROM ce.data_acquisto) <= p_anno
       AND coalesce(ce.costo_storico, 0) > 0
       -- Dismesso prima dell'anno: niente. Ceduto nell'anno in contabilità: la quota sta nella cessione.
       AND (ce.data_dismissione IS NULL OR extract(year FROM ce.data_dismissione) >= p_anno)
       AND NOT (coalesce(extract(year FROM ce.data_dismissione) = p_anno, false) AND public.contabilita_documento_registrato(p_company, 'cessione_cespite', ce.id))
     ORDER BY ce.codice NULLS LAST, ce.descrizione, ce.id
  LOOP
    IF public.contabilita_cespite_aliquota(c) IS NULL THEN CONTINUE; END IF;
    v_f := public.contabilita_cespite_fondo(c, p_anno);
    v_q := public.contabilita_cespite_quota(c, p_anno, (v_f->>'fondo')::numeric);
    v_conti := public.contabilita_cespite_conti(c, k);
    v_quote := v_quote || jsonb_build_array(jsonb_build_object('id', c.id, 'cespite', c.descrizione, 'codice', c.codice,
      'categoria', c.categoria, 'costo', c.costo_storico, 'aliquota', public.contabilita_cespite_aliquota(c),
      'fondo_inizio', (v_f->>'fondo')::numeric, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
      'residuo', c.costo_storico - (v_f->>'fondo')::numeric - v_q,
      'conto_bene', v_conti->>'bene', 'conto_fondo', v_conti->>'fondo', 'conto_ammortamento', v_conti->>'ammortamento',
      'ruoli', v_conti->'ruoli'));
    IF v_q <= 0 THEN CONTINUE; END IF;
    FOR x IN SELECT jsonb_array_elements_text(v_conti->'mancanti') LOOP
      IF NOT x = ANY (v_mancano) AND x IN (v_conti->'ruoli'->>'fondo', v_conti->'ruoli'->>'ammortamento') THEN
        v_mancano := array_append(v_mancano, x);
      END IF;
    END LOOP;
    IF v_conti->>'fondo' IS NOT NULL AND v_conti->>'ammortamento' IS NOT NULL THEN
      v_righe := v_righe || public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, c.descrizione)
                         || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, c.descrizione);
      v_per_cespite := v_per_cespite || jsonb_build_array(jsonb_build_object('id', c.id, 'quota', v_q));
    END IF;
    v_tot := v_tot + v_q;
  END LOOP;

  SELECT * INTO v_vecchia FROM public.contabilita_scritture s
   WHERE s.company_id = p_company AND s.origine = 'ammortamenti' AND s.origine_id = v_id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = s.id)
   ORDER BY s.created_at DESC LIMIT 1;
  v_registrati := v_vecchia.id IS NOT NULL;
  v_da_aggiornare := v_registrati AND cardinality(v_mancano) = 0 AND NOT public.contabilita_righe_uguali(v_vecchia.id, v_righe);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF NOT v_registrati OR v_da_aggiornare THEN
      IF v_registrati THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, v_vecchia.data_registrazione, 'Storno n. ' || v_vecchia.numero || '/' || v_vecchia.esercizio,
          'Ammortamenti cambiati', NULL, NULL,
          (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
             FROM public.contabilita_righe WHERE scrittura_id = v_vecchia.id), 'storno', v_vecchia.id, v_vecchia.id);
      END IF;
      IF jsonb_array_length(v_righe) > 0 THEN
        PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Ammortamenti',
          'Quote di ammortamento ' || p_anno, NULL, NULL, v_righe, 'ammortamenti', v_id, NULL);
      END IF;
      -- Il registro segue il giornale: le quote dell'anno sono quelle appena scritte.
      DELETE FROM public.contabilita_cespiti_quote WHERE company_id = p_company AND esercizio = p_anno AND origine = 'ammortamenti';
      INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
      SELECT (y->>'id')::uuid, p_company, p_anno, (y->>'quota')::numeric, 'ammortamenti' FROM jsonb_array_elements(v_per_cespite) y;
      v_registrati := jsonb_array_length(v_righe) > 0;
      v_da_aggiornare := false;
    END IF;
  END IF;
  RETURN jsonb_build_object('quote', v_quote, 'totale', v_tot, 'registrati', v_registrati,
    'da_aggiornare', v_da_aggiornare, 'conti_mancanti', to_jsonb(v_mancano));
END $$;
REVOKE ALL ON FUNCTION public.contabilita_ammortamenti(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_ammortamenti(uuid, int, boolean) TO authenticated, service_role;

-- Fine anno: gli ammortamenti vengono da contabilita_ammortamenti; il TFR resta com'era.
CREATE OR REPLACE FUNCTION public.contabilita_fine_anno(p_company uuid, p_anno integer, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  k jsonb; v_amm jsonb; v_lordo numeric; v_tfr numeric; v_id_tfr uuid; v_fatte jsonb := '[]'::jsonb; v_prima boolean;
BEGIN
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(p_company) ELSE public.contabilita_puo_scrivere(p_company) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  k := public.contabilita_conti_per_ruolo(p_company);
  v_id_tfr := md5('tfr:' || p_company || ':' || p_anno)::uuid;

  v_amm := public.contabilita_ammortamenti(p_company, p_anno, true);
  IF NOT p_anteprima AND (v_amm->>'totale')::numeric > 0 AND (NOT (v_amm->>'registrati')::boolean OR (v_amm->>'da_aggiornare')::boolean) THEN
    v_amm := public.contabilita_ammortamenti(p_company, p_anno, false);
    v_fatte := v_fatte || '["ammortamenti"]'::jsonb;
  END IF;

  SELECT coalesce(sum(lordo), 0) INTO v_lordo FROM public.hr_cedolini
   WHERE company_id = p_company AND anno = p_anno AND stato IN ('emesso', 'pagato');
  v_tfr := round(v_lordo / 13.5, 2);

  IF NOT p_anteprima AND v_tfr > 0 AND NOT public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr) THEN
    IF NOT (k ? '30.12' AND k ? '12.01') THEN
      RAISE EXCEPTION 'Mancano i conti per l''accantonamento TFR (30.12, 12.01)' USING ERRCODE = '22023';
    END IF;
    PERFORM public.contabilita_inserisci_scrittura(p_company, make_date(p_anno, 12, 31), 'Accantonamento TFR',
      'Quota TFR ' || p_anno || ' sulle retribuzioni dei cedolini', NULL, NULL,
      public.contabilita_riga(k->>'30.12', 'dare', v_tfr, NULL) || public.contabilita_riga(k->>'12.01', 'avere', v_tfr, NULL),
      'tfr', v_id_tfr, NULL);
    v_fatte := v_fatte || '["tfr"]'::jsonb;
  END IF;
  v_prima := (v_amm->>'registrati')::boolean;
  RETURN jsonb_build_object('ammortamenti', v_amm->'quote', 'totale_ammortamenti', (v_amm->>'totale')::numeric,
    'retribuzioni', v_lordo, 'tfr', v_tfr,
    -- «Registrati» solo se il giornale è ancora quello giusto: un registro cambiato chiede di rifarli.
    'ammortamenti_registrati', v_prima AND NOT (v_amm->>'da_aggiornare')::boolean,
    'ammortamenti_da_aggiornare', (v_amm->>'da_aggiornare')::boolean,
    'conti_mancanti_ammortamenti', v_amm->'conti_mancanti',
    'tfr_registrato', public.contabilita_documento_registrato(p_company, 'tfr', v_id_tfr),
    'registrate', v_fatte);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_fine_anno(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_fine_anno(uuid, integer, boolean) TO authenticated, service_role;

-- Cessione o dismissione: quota fino alla data, via il bene e il suo fondo, plusvalenza o minusvalenza
-- sul prezzo. Il prezzo va in dare sul conto scelto: il conto di ricavo su cui è andata la fattura di
-- vendita (così il ricavo diventa plusvalenza o minusvalenza), oppure banca o cassa se incassato senza
-- fattura. Prezzo zero = rottamazione: tutto il residuo è minusvalenza.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_cessione(p_cespite uuid, p_data date, p_prezzo numeric,
  p_conto_prezzo uuid DEFAULT NULL, p_anteprima boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c public.cespiti; k jsonb; v_anno int; v_f jsonb; v_fondo numeric; v_q numeric; v_residuo numeric; v_diff numeric;
  v_conti jsonb; v_righe jsonb; v_mancano text[] := '{}'; v_desc text; v_amm_reg boolean;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT (CASE WHEN p_anteprima THEN public.contabilita_puo_leggere(c.company_id) ELSE public.contabilita_puo_scrivere(c.company_id) END)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_data IS NULL OR p_data < c.data_acquisto THEN RAISE EXCEPTION 'La data di cessione non può precedere l''acquisto' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_prezzo, -1) < 0 THEN RAISE EXCEPTION 'Il prezzo di cessione non è negativo (zero per una rottamazione)' USING ERRCODE = '22023'; END IF;
  IF public.contabilita_documento_registrato(c.company_id, 'cessione_cespite', c.id) THEN
    RAISE EXCEPTION 'La cessione di questo cespite è già registrata: annullala prima di rifarla' USING ERRCODE = '22023';
  END IF;
  k := public.contabilita_conti_per_ruolo(c.company_id);
  v_anno := extract(year FROM p_data)::int;
  v_f := public.contabilita_cespite_fondo(c, v_anno);
  v_fondo := (v_f->>'fondo')::numeric;
  v_q := public.contabilita_cespite_quota(c, v_anno, v_fondo, p_data);
  v_residuo := c.costo_storico - v_fondo - v_q;
  v_diff := round(p_prezzo - v_residuo, 2);
  v_conti := public.contabilita_cespite_conti(c, k);
  SELECT array_agg(x) INTO v_mancano FROM jsonb_array_elements_text(v_conti->'mancanti') x;
  v_mancano := coalesce(v_mancano, '{}');
  IF v_diff > 0 AND NOT k ? '20.04' THEN v_mancano := array_append(v_mancano, '20.04'); END IF;
  IF v_diff < 0 AND NOT k ? '30.40' THEN v_mancano := array_append(v_mancano, '30.40'); END IF;
  v_amm_reg := public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid);

  IF NOT p_anteprima THEN
    IF cardinality(v_mancano) > 0 THEN
      RAISE EXCEPTION 'Manca il conto per: % (indicalo nel registro dei cespiti o in Fine anno)', array_to_string(v_mancano, ', ') USING ERRCODE = '22023';
    END IF;
    IF p_prezzo > 0 AND (p_conto_prezzo IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.contabilita_conti WHERE id = p_conto_prezzo AND company_id = c.company_id AND movimentabile AND attivo)) THEN
      RAISE EXCEPTION 'Indica su quale conto sta il prezzo di vendita' USING ERRCODE = '22023';
    END IF;
    v_desc := 'Cessione ' || c.descrizione;
    v_righe := public.contabilita_riga(v_conti->>'ammortamento', 'dare', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'avere', v_q, 'Quota ' || v_anno || ' fino alla cessione')
            || public.contabilita_riga(v_conti->>'fondo', 'dare', v_fondo + v_q, 'Chiusura del fondo')
            || public.contabilita_riga(v_conti->>'bene', 'avere', c.costo_storico, 'Uscita del bene')
            || public.contabilita_riga(p_conto_prezzo::text, 'dare', p_prezzo, 'Prezzo di cessione')
            || CASE WHEN v_diff > 0 THEN public.contabilita_riga(k->>'20.04', 'avere', v_diff, 'Plusvalenza')
                    ELSE public.contabilita_riga(k->>'30.40', 'dare', -v_diff, 'Minusvalenza') END;
    PERFORM public.contabilita_inserisci_scrittura(c.company_id, p_data, 'Cessione cespite', v_desc, NULL, NULL,
      v_righe, 'cessione_cespite', c.id, NULL);
    UPDATE public.cespiti SET data_dismissione = p_data, is_active = false, prezzo_cessione = p_prezzo,
           fondo_amm = least(costo_storico, v_fondo + v_q), updated_at = now()
     WHERE id = c.id;
    INSERT INTO public.contabilita_cespiti_quote (cespite_id, company_id, esercizio, quota, origine)
    VALUES (c.id, c.company_id, v_anno, v_q, 'cessione')
    ON CONFLICT (cespite_id, esercizio) DO UPDATE SET quota = EXCLUDED.quota, origine = EXCLUDED.origine, created_at = now();
    -- Ammortamenti dell'anno già registrati: si rifanno senza questo cespite, che ha la quota nella cessione.
    IF v_amm_reg THEN PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false); END IF;
  END IF;
  RETURN jsonb_build_object('fondo_inizio', v_fondo, 'fondo_stimato', (v_f->>'stimato')::boolean, 'quota', v_q,
    'residuo', v_residuo, 'prezzo', p_prezzo, 'plusvalenza', greatest(v_diff, 0), 'minusvalenza', greatest(-v_diff, 0),
    'conti_mancanti', to_jsonb(v_mancano), 'registrata', NOT p_anteprima);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_cessione(uuid, date, numeric, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_cessione(uuid, date, numeric, uuid, boolean) TO authenticated, service_role;

-- Annulla una cessione registrata per errore: storno, il cespite torna attivo, via la quota.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_annulla_cessione(p_cespite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.cespiti; s record; v_anno int;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(c.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = c.company_id AND x.origine = 'cessione_cespite' AND x.origine_id = c.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Nessuna cessione registrata per questo cespite' USING ERRCODE = '22023'; END IF;
  v_anno := extract(year FROM s.data_registrazione)::int;
  PERFORM public.contabilita_inserisci_scrittura(c.company_id, s.data_registrazione, 'Storno n. ' || s.numero || '/' || s.esercizio,
    'Cessione annullata', NULL, NULL,
    (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
       FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
  DELETE FROM public.contabilita_cespiti_quote WHERE cespite_id = c.id AND esercizio = v_anno AND origine = 'cessione';
  UPDATE public.cespiti SET data_dismissione = NULL, is_active = true, prezzo_cessione = NULL, updated_at = now() WHERE id = c.id;
  IF public.contabilita_documento_registrato(c.company_id, 'ammortamenti', md5('ammortamenti:' || c.company_id || ':' || v_anno)::uuid) THEN
    PERFORM public.contabilita_ammortamenti(c.company_id, v_anno, false);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_annulla_cessione(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_annulla_cessione(uuid) TO authenticated, service_role;

-- Un cespite da una riga di fattura ricevuta: costo = imponibile della riga più l'IVA che non si
-- detrae; la riga passa sul conto del bene. Se la fattura era già registrata, la sua scrittura si
-- storna e si rifà con la riga sul conto nuovo.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_da_fattura(p_fattura uuid, p_linea text, p_descrizione text,
  p_categoria text, p_sottocategoria text, p_aliquota numeric, p_conto_bene uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f record; r jsonb; v_costo numeric; v_id uuid; k jsonb; v_ruoli jsonb; v_conto uuid; s record;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(f.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_categoria NOT IN ('materiale', 'immateriale') THEN RAISE EXCEPTION 'Categoria: materiale o immateriale' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_aliquota, 0) <= 0 OR p_aliquota > 100 THEN RAISE EXCEPTION 'Aliquota di ammortamento fra 0 e 100' USING ERRCODE = '22023'; END IF;
  SELECT x INTO r FROM jsonb_array_elements(coalesce(f.righe, '[]'::jsonb)) WITH ORDINALITY t(x, n)
   WHERE coalesce(nullif(x->>'numero_linea', ''), n::text) = p_linea LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'Riga % non trovata nella fattura', p_linea USING ERRCODE = '22023'; END IF;
  v_costo := round(coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0)
    * (1 + coalesce(nullif(r->>'aliquota_iva', '')::numeric, 0) / 100 * (1 - coalesce(f.detraibilita_percentuale, 100) / 100.0)), 2);
  IF v_costo <= 0 THEN RAISE EXCEPTION 'La riga non ha un importo positivo' USING ERRCODE = '22023'; END IF;

  k := public.contabilita_conti_per_ruolo(f.company_id);
  v_ruoli := public.contabilita_cespite_ruoli(p_categoria, p_sottocategoria, coalesce(nullif(btrim(p_descrizione), ''), r->>'descrizione'));
  v_conto := coalesce(p_conto_bene, (k->>(v_ruoli->>'bene'))::uuid);
  IF v_conto IS NULL THEN
    RAISE EXCEPTION 'Manca il conto del bene (%): sceglilo o crealo nel Piano dei conti', v_ruoli->>'bene' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cespiti (company_id, descrizione, categoria, sottocategoria, data_acquisto, costo_storico, aliquota_amm,
                              conto_bene_id, fattura_ricevuta_id, fattura_linea, created_by, note)
  VALUES (f.company_id, coalesce(nullif(btrim(p_descrizione), ''), left(r->>'descrizione', 200)), p_categoria, nullif(btrim(p_sottocategoria), ''),
          f.data_fattura, v_costo, p_aliquota, v_conto, f.id, p_linea, auth.uid(),
          'Dalla fattura ' || coalesce(f.numero_fattura, '') || ' di ' || coalesce(f.cedente_ragione_sociale, ''))
  RETURNING id INTO v_id;
  UPDATE public.fatture_ricevute SET conti_righe = conti_righe || jsonb_build_object(p_linea, 'conto:' || v_conto) WHERE id = f.id;

  SELECT * INTO s FROM public.contabilita_scritture x
   WHERE x.company_id = f.company_id AND x.origine = 'fattura_ricevuta' AND x.origine_id = f.id
     AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = x.id)
   ORDER BY x.created_at DESC LIMIT 1;
  IF s.id IS NOT NULL THEN
    PERFORM public.contabilita_inserisci_scrittura(f.company_id, s.data_registrazione, 'Storno n. ' || s.numero || '/' || s.esercizio,
      'Riga ' || p_linea || ' passata fra i cespiti', NULL, NULL,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id), 'storno', s.id, s.id);
    PERFORM public.contabilita_genera_da_documenti(f.company_id, extract(year FROM f.data_fattura)::int, f.id);
    IF NOT public.contabilita_documento_registrato(f.company_id, 'fattura_ricevuta', f.id) THEN
      RAISE EXCEPTION 'La fattura non si è registrata di nuovo: niente è stato cambiato' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_da_fattura(uuid, text, text, text, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_da_fattura(uuid, text, text, text, text, numeric, uuid) TO authenticated, service_role;

-- I conti, il fondo iniziale del cespite: li scrive chi scrive la contabilità.
CREATE OR REPLACE FUNCTION public.contabilita_cespite_imposta(p_cespite uuid, p_conto_bene uuid, p_conto_fondo uuid,
  p_conto_ammortamento uuid, p_fondo_iniziale numeric, p_fondo_iniziale_anno int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.cespiti;
BEGIN
  SELECT * INTO c FROM public.cespiti WHERE id = p_cespite;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cespite non trovato' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.contabilita_puo_scrivere(c.company_id) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Il fondo iniziale non si cambia sotto quote già registrate da quell'anno in poi.
  IF (p_fondo_iniziale, p_fondo_iniziale_anno) IS DISTINCT FROM (c.fondo_iniziale, c.fondo_iniziale_anno)
     AND EXISTS (SELECT 1 FROM public.contabilita_cespiti_quote q WHERE q.cespite_id = c.id
                  AND q.esercizio < greatest(coalesce(p_fondo_iniziale_anno, 0), coalesce(c.fondo_iniziale_anno, 0), 2000)) THEN
    RAISE EXCEPTION 'Ci sono quote registrate prima di quell''anno: il fondo si legge già dal giornale' USING ERRCODE = '22023';
  END IF;
  UPDATE public.cespiti SET conto_bene_id = p_conto_bene, conto_fondo_id = p_conto_fondo, conto_ammortamento_id = p_conto_ammortamento,
         fondo_iniziale = p_fondo_iniziale, fondo_iniziale_anno = p_fondo_iniziale_anno, updated_at = now()
   WHERE id = c.id;
END $$;
REVOKE ALL ON FUNCTION public.contabilita_cespite_imposta(uuid, uuid, uuid, uuid, numeric, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_cespite_imposta(uuid, uuid, uuid, uuid, numeric, int) TO authenticated, service_role;

-- Plusvalenze e minusvalenze si scelgono da Fine anno, come gli altri ruoli.
CREATE OR REPLACE FUNCTION public.contabilita_assegna_ruolo(p_company uuid, p_ruolo text, p_conto uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_natura text := CASE p_ruolo
    WHEN '04.01' THEN 'attivo' WHEN '04.02' THEN 'attivo' WHEN '07.01' THEN 'attivo' WHEN '07.02' THEN 'attivo'
    WHEN '14.01' THEN 'passivo' WHEN '14.02' THEN 'passivo' WHEN '20.03' THEN 'ricavo' WHEN '30.30' THEN 'costo'
    WHEN '20.04' THEN 'ricavo' WHEN '30.40' THEN 'costo'
    WHEN '01.01' THEN 'attivo' WHEN '01.02' THEN 'attivo'
    WHEN '02.01' THEN 'attivo' WHEN '02.02' THEN 'attivo' WHEN '02.03' THEN 'attivo' WHEN '02.04' THEN 'attivo' WHEN '02.05' THEN 'attivo'
    WHEN '02.90' THEN 'attivo' WHEN '02.91' THEN 'attivo' WHEN '02.92' THEN 'attivo' WHEN '02.93' THEN 'attivo'
    WHEN '30.20' THEN 'costo' WHEN '30.21' THEN 'costo' END;
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
