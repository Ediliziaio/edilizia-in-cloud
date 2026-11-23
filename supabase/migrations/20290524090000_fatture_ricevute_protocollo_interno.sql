-- Protocollo interno delle fatture ricevute (23/11/2026, richiesta di un'azienda cliente,
-- valida per tutte): un numero progressivo per anno, 1, 2, 3…, in ordine di arrivo.
--
-- Non è una seconda numerazione: è il registro protocolli IVA acquisti che già esisteva
-- (iva_sezionali / iva_protocolli, 20290421181000), che nessuna azienda aveva ancora usato
-- perché si raggiungeva solo dal Registro IVA. Qui diventa una colonna della lista delle
-- fatture ricevute: il primo numero crea da solo il sezionale «A · Registro acquisti».
--
-- Un numero annullato si può riusare: il protocollo annullato resta nello storico, ma il
-- buco nella numerazione si chiude (prima il vincolo contava anche gli annullati).
-- Chi scrive: contabilita_puo_scrivere, come per il Registro IVA.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.iva_protocolli DROP CONSTRAINT IF EXISTS iva_protocolli_sezionale_id_anno_numero_key;
CREATE UNIQUE INDEX IF NOT EXISTS iva_protocolli_numero_attivo
  ON public.iva_protocolli(sezionale_id, anno, numero) WHERE annullato_il IS NULL;

-- Il registro acquisti dell'azienda: quello con codice A, altrimenti il primo creato;
-- se non ce n'è nessuno lo crea. Interna: la chiamano solo le due funzioni qui sotto.
CREATE OR REPLACE FUNCTION public.fatture_ricevute_sezionale_acquisti(p_company uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.iva_sezionali
   WHERE company_id = p_company AND lato = 'acquisti'
   ORDER BY (codice = 'A') DESC, created_at, id LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.iva_sezionali(company_id, lato, codice, nome)
    VALUES (p_company, 'acquisti', 'A', 'Registro acquisti')
    ON CONFLICT (company_id, lato, codice) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.iva_sezionali WHERE company_id = p_company AND lato = 'acquisti' AND codice = 'A';
    END IF;
  END IF;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.fatture_ricevute_sezionale_acquisti(uuid) FROM PUBLIC, anon, authenticated;

-- Assegna (o cambia) il protocollo di una fattura ricevuta.
--  p_numero NULL → il prossimo numero libero dell'anno.
--  p_data NULL   → il giorno in cui la fattura è arrivata (SdI), altrimenti la sua data.
-- Se la fattura ha già un protocollo diverso, lo annulla col motivo dato e assegna il nuovo.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_protocolla(
  p_fattura uuid, p_numero integer DEFAULT NULL, p_data date DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  f public.fatture_ricevute; v_sez uuid; v_data date; v_anno integer; v_num integer;
  p public.iva_protocolli; v_occupata text;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(f.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE = '42501';
  END IF;
  IF f.stato = 'rifiutata' THEN RAISE EXCEPTION 'Una fattura rifiutata non si protocolla' USING ERRCODE = '22023'; END IF;
  IF p_numero IS NOT NULL AND p_numero <= 0 THEN RAISE EXCEPTION 'Il numero di protocollo parte da 1' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || f.company_id, 0));
  v_sez := public.fatture_ricevute_sezionale_acquisti(f.company_id);

  SELECT * INTO p FROM public.iva_protocolli
   WHERE company_id = f.company_id AND lato = 'acquisti' AND documento_id = f.id AND annullato_il IS NULL;
  v_data := coalesce(p_data, p.data_registrazione, f.data_ricezione_sdi::date, f.data_fattura, current_date);
  v_anno := extract(year FROM v_data)::int;

  IF p.id IS NOT NULL THEN
    IF (p_numero IS NULL OR p_numero = p.numero) AND v_data = p.data_registrazione THEN
      RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'anno', p.anno, 'data', p.data_registrazione, 'gia_presente', true);
    END IF;
    IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
      RAISE EXCEPTION 'La fattura ha già il protocollo %/%: per cambiarlo indica il motivo', p.numero, p.anno USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_numero IS NOT NULL THEN
    SELECT format('%s n. %s', r.cedente_ragione_sociale, r.numero_fattura) INTO v_occupata
      FROM public.iva_protocolli q JOIN public.fatture_ricevute r ON r.id = q.documento_id
     WHERE q.sezionale_id = v_sez AND q.anno = v_anno AND q.numero = p_numero AND q.annullato_il IS NULL AND q.documento_id <> f.id;
    IF v_occupata IS NOT NULL THEN
      RAISE EXCEPTION 'Il protocollo %/% è già della fattura %', p_numero, v_anno, v_occupata USING ERRCODE = '23505';
    END IF;
  END IF;

  IF p.id IS NOT NULL THEN
    PERFORM public.iva_annulla_protocollo(p.id, p_motivo);
  END IF;

  v_num := coalesce(p_numero, (SELECT coalesce(max(numero), 0) + 1 FROM public.iva_protocolli
                                WHERE sezionale_id = v_sez AND anno = v_anno AND annullato_il IS NULL));
  p := public.iva_assegna_protocollo(v_sez, f.id, v_data, v_num);
  RETURN jsonb_build_object('id', p.id, 'numero', p.numero, 'anno', p.anno, 'data', p.data_registrazione, 'gia_presente', false);
END $function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_protocolla(uuid, integer, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_protocolla(uuid, integer, date, text) TO authenticated;

-- Numera in un colpo tutte le fatture dell'anno ancora senza protocollo, in ordine di
-- arrivo (giorno SdI, poi data fattura, poi inserimento). Le già numerate tengono il loro
-- numero; le nuove continuano dal più alto, o da p_primo se indicato. Restituisce quante.
CREATE OR REPLACE FUNCTION public.fatture_ricevute_protocolla_anno(p_company uuid, p_anno integer, p_primo integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_sez uuid; v_num integer; v_fatte integer := 0; r record;
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare le fatture' USING ERRCODE = '42501';
  END IF;
  IF p_anno NOT BETWEEN 2000 AND 2100 OR (p_primo IS NOT NULL AND p_primo <= 0) THEN
    RAISE EXCEPTION 'Anno o primo numero non validi' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  v_sez := public.fatture_ricevute_sezionale_acquisti(p_company);
  v_num := coalesce(p_primo, (SELECT coalesce(max(numero), 0) + 1 FROM public.iva_protocolli
                               WHERE sezionale_id = v_sez AND anno = p_anno AND annullato_il IS NULL));
  FOR r IN
    SELECT f.id, coalesce(f.data_ricezione_sdi::date, f.data_fattura) AS giorno
      FROM public.fatture_ricevute f
     WHERE f.company_id = p_company AND f.stato <> 'rifiutata'
       AND extract(year FROM coalesce(f.data_ricezione_sdi::date, f.data_fattura))::int = p_anno
       AND NOT EXISTS (SELECT 1 FROM public.iva_protocolli q
                        WHERE q.company_id = p_company AND q.lato = 'acquisti' AND q.documento_id = f.id AND q.annullato_il IS NULL)
     ORDER BY giorno, f.data_fattura, f.created_at, f.id
  LOOP
    -- Salta i numeri già presi (dati a mano o rimasti da un primo numero indicato).
    WHILE EXISTS (SELECT 1 FROM public.iva_protocolli q WHERE q.sezionale_id = v_sez AND q.anno = p_anno AND q.numero = v_num AND q.annullato_il IS NULL) LOOP
      v_num := v_num + 1;
    END LOOP;
    PERFORM public.iva_assegna_protocollo(v_sez, r.id, r.giorno, v_num);
    v_num := v_num + 1;
    v_fatte := v_fatte + 1;
  END LOOP;
  RETURN v_fatte;
END $function$;
REVOKE ALL ON FUNCTION public.fatture_ricevute_protocolla_anno(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatture_ricevute_protocolla_anno(uuid, integer, integer) TO authenticated;
