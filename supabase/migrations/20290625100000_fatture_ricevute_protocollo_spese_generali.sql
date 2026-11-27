-- Protocollo «Spese generali» delle fatture ricevute (27/11/2026, richiesta di URBAN VISION,
-- valida per ogni azienda): accanto alle cartelle dei cantieri (20290604110000 — «Che1, Che2…»)
-- serve una cartella in più per le fatture che non sono di nessun cantiere (telefonia, luce,
-- affitto, software…): «SG1, SG2…», un progressivo unico per azienda che non riparte a gennaio,
-- come quello dei cantieri.
--
-- Il numero riusa la colonna protocollo_commessa_numero: una fattura o sta in un cantiere
-- (protocollo_commessa_id) o sta nelle spese generali (protocollo_spese_generali), mai in tutti e
-- due. La sigla (default «SG») è una sola per azienda e vive nelle impostazioni acquisti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. La fattura nelle spese generali: un flag. Il numero resta su protocollo_commessa_numero.
--    Aggiungere una colonna con default costante è istantaneo (niente riscrittura della tabella).
ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS protocollo_spese_generali boolean NOT NULL DEFAULT false;

-- 2. Coerenza rifatta: cantiere e spese generali si escludono; il numero c'è se e solo se la
--    fattura sta in una delle due cartelle. Vincolo NOT VALID + VALIDATE per non bloccare la
--    tabella grande con una scansione sotto lock pesante (oggi nessuna riga è «spese generali»,
--    quindi la validazione passa).
ALTER TABLE public.fatture_ricevute DROP CONSTRAINT IF EXISTS fatture_ricevute_protocollo_commessa_coerente;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fatture_ricevute_protocollo_cartella_coerente') THEN
    ALTER TABLE public.fatture_ricevute ADD CONSTRAINT fatture_ricevute_protocollo_cartella_coerente
      CHECK (
        NOT (protocollo_commessa_id IS NOT NULL AND protocollo_spese_generali)
        AND (protocollo_commessa_numero IS NULL)
            = (protocollo_commessa_id IS NULL AND NOT protocollo_spese_generali)
        AND (protocollo_commessa_numero IS NULL OR protocollo_commessa_numero > 0)
      ) NOT VALID;
    ALTER TABLE public.fatture_ricevute VALIDATE CONSTRAINT fatture_ricevute_protocollo_cartella_coerente;
  END IF;
END $$;

-- Il numero delle spese generali è unico in azienda.
CREATE UNIQUE INDEX IF NOT EXISTS fatture_ricevute_protocollo_spese_generali_unico
  ON public.fatture_ricevute(company_id, protocollo_commessa_numero)
  WHERE protocollo_spese_generali;

-- 3. La sigla della cartella spese generali, una per azienda. Sta nelle impostazioni acquisti,
--    dove abita già la configurazione del modulo fatture ricevute. NULL = «SG».
ALTER TABLE public.company_acquisti_impostazioni
  ADD COLUMN IF NOT EXISTS protocollo_spese_generali_sigla text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_acquisti_impostazioni_sg_sigla_valida') THEN
    ALTER TABLE public.company_acquisti_impostazioni ADD CONSTRAINT company_acquisti_impostazioni_sg_sigla_valida
      CHECK (protocollo_spese_generali_sigla IS NULL OR protocollo_spese_generali_sigla ~ '^[A-Za-z0-9]{1,8}$');
  END IF;
END $$;

-- 4. Legge la sigla (default «SG»). SECURITY DEFINER per non dipendere dalle policy della tabella
--    impostazioni: basta poter leggere la contabilità.
CREATE OR REPLACE FUNCTION public.company_sigla_spese_generali_leggi(p_company uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_sigla text;
BEGIN
  IF NOT public.contabilita_puo_leggere(p_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di leggere la contabilità' USING ERRCODE = '42501';
  END IF;
  SELECT protocollo_spese_generali_sigla INTO v_sigla
    FROM public.company_acquisti_impostazioni WHERE company_id = p_company;
  RETURN coalesce(nullif(btrim(coalesce(v_sigla, '')), ''), 'SG');
END $function$;
REVOKE ALL ON FUNCTION public.company_sigla_spese_generali_leggi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_sigla_spese_generali_leggi(uuid) TO authenticated;

-- 5. Imposta la sigla delle spese generali. La cambia chi scrive la contabilità. Vuota = torna «SG».
CREATE OR REPLACE FUNCTION public.company_sigla_spese_generali(p_company uuid, p_sigla text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_sigla text;
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di cambiare la sigla delle spese generali' USING ERRCODE = '42501';
  END IF;
  v_sigla := nullif(btrim(coalesce(p_sigla, '')), '');
  IF v_sigla IS NOT NULL AND v_sigla !~ '^[A-Za-z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'La sigla è da 1 a 8 lettere o numeri, senza spazi (es. SG)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.company_acquisti_impostazioni (company_id, protocollo_spese_generali_sigla, updated_by, updated_at)
    VALUES (p_company, v_sigla, auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE
    SET protocollo_spese_generali_sigla = EXCLUDED.protocollo_spese_generali_sigla,
        updated_by = auth.uid(), updated_at = now();
  RETURN jsonb_build_object('company', p_company, 'sigla', coalesce(v_sigla, 'SG'));
END $function$;
REVOKE ALL ON FUNCTION public.company_sigla_spese_generali(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_sigla_spese_generali(uuid, text) TO authenticated;

-- 6. Assegna (o cambia) il protocollo spese generali di una fattura.
--    p_numero NULL → il primo numero libero delle spese generali di quell'azienda.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_protocolla_spese_generali(
  p_fattura uuid, p_numero integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE f public.fatture_ricevute; v_num integer; v_occupata text; v_sigla text;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(f.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE = '42501';
  END IF;
  IF f.stato = 'rifiutata' THEN RAISE EXCEPTION 'Una fattura rifiutata non si protocolla' USING ERRCODE = '22023'; END IF;
  IF p_numero IS NOT NULL AND p_numero <= 0 THEN RAISE EXCEPTION 'Il numero di protocollo parte da 1' USING ERRCODE = '22023'; END IF;

  v_sigla := public.company_sigla_spese_generali_leggi(f.company_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('protocollo-spese-generali:' || f.company_id, 0));
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF f.protocollo_spese_generali AND (p_numero IS NULL OR p_numero = f.protocollo_commessa_numero) THEN
    RETURN jsonb_build_object('spese_generali', true, 'sigla', v_sigla,
                              'numero', f.protocollo_commessa_numero, 'gia_presente', true);
  END IF;
  IF p_numero IS NOT NULL THEN
    SELECT format('%s n. %s', r.cedente_ragione_sociale, r.numero_fattura) INTO v_occupata
      FROM public.fatture_ricevute r
     WHERE r.company_id = f.company_id AND r.protocollo_spese_generali
       AND r.protocollo_commessa_numero = p_numero AND r.id <> f.id;
    IF v_occupata IS NOT NULL THEN
      RAISE EXCEPTION 'Il protocollo % è già della fattura %', v_sigla || p_numero, v_occupata USING ERRCODE = '23505';
    END IF;
  END IF;
  v_num := coalesce(p_numero, (SELECT coalesce(max(protocollo_commessa_numero), 0) + 1
                                 FROM public.fatture_ricevute
                                WHERE company_id = f.company_id AND protocollo_spese_generali));
  UPDATE public.fatture_ricevute
     SET protocollo_commessa_id = NULL, protocollo_spese_generali = true,
         protocollo_commessa_numero = v_num, updated_at = now()
   WHERE id = f.id;
  RETURN jsonb_build_object('spese_generali', true, 'sigla', v_sigla, 'numero', v_num, 'gia_presente', false);
END $function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_protocolla_spese_generali(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_protocolla_spese_generali(uuid, integer) TO authenticated;

-- 7. Numera in un colpo le fatture senza protocollo che non sono di nessun cantiere, in ordine di
--    arrivo, nella cartella spese generali. Le già numerate (cantiere o SG) tengono il loro numero.
--    p_primo → da dove partire (altrimenti dall'ultimo SG dell'azienda).
CREATE OR REPLACE FUNCTION public.fatture_ricevute_protocolla_spese_generali_blocco(
  p_company uuid, p_primo integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; v_num integer; v_quante integer := 0; v_primo integer; v_ultimo integer; v_sigla text;
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare le fatture' USING ERRCODE = '42501';
  END IF;
  IF p_primo IS NOT NULL AND p_primo <= 0 THEN
    RAISE EXCEPTION 'Il primo numero parte da 1' USING ERRCODE = '22023';
  END IF;
  v_sigla := public.company_sigla_spese_generali_leggi(p_company);
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('statement_timeout', '120s', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('protocollo-spese-generali:' || p_company, 0));
  FOR r IN
    SELECT f.id
      FROM public.fatture_ricevute f
     WHERE f.company_id = p_company AND f.stato <> 'rifiutata'
       AND f.protocollo_commessa_id IS NULL AND NOT f.protocollo_spese_generali
       AND public.fattura_ricevuta_cantiere(f.id) IS NULL
     ORDER BY coalesce(f.data_ricezione_sdi::date, f.data_fattura), f.data_fattura, f.created_at, f.id
  LOOP
    v_num := coalesce(nullif(p_primo, 0) + v_quante,
                      (SELECT coalesce(max(protocollo_commessa_numero), 0) + 1
                         FROM public.fatture_ricevute
                        WHERE company_id = p_company AND protocollo_spese_generali));
    WHILE EXISTS (SELECT 1 FROM public.fatture_ricevute q
                   WHERE q.company_id = p_company AND q.protocollo_spese_generali
                     AND q.protocollo_commessa_numero = v_num) LOOP
      v_num := v_num + 1;
    END LOOP;
    UPDATE public.fatture_ricevute
       SET protocollo_commessa_id = NULL, protocollo_spese_generali = true,
           protocollo_commessa_numero = v_num, updated_at = now()
     WHERE id = r.id;
    IF v_quante = 0 THEN v_primo := v_num; END IF;
    v_ultimo := v_num; v_quante := v_quante + 1;
  END LOOP;
  RETURN jsonb_build_object('sigla', v_sigla, 'quante', v_quante, 'primo', v_primo, 'ultimo', v_ultimo);
END $function$;
REVOKE ALL ON FUNCTION public.fatture_ricevute_protocolla_spese_generali_blocco(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatture_ricevute_protocolla_spese_generali_blocco(uuid, integer) TO authenticated;

-- 8. Toglie il protocollo (cantiere o spese generali): esteso per azzerare anche il flag SG.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_sprotocolla_commessa(p_fattura uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE f public.fatture_ricevute;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(f.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE = '42501';
  END IF;
  UPDATE public.fatture_ricevute
     SET protocollo_commessa_id = NULL, protocollo_spese_generali = false,
         protocollo_commessa_numero = NULL, updated_at = now()
   WHERE id = f.id;
  RETURN jsonb_build_object('commessa', f.protocollo_commessa_id, 'numero', f.protocollo_commessa_numero,
                            'tolto', f.protocollo_commessa_id IS NOT NULL OR f.protocollo_spese_generali);
END $function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_sprotocolla_commessa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_sprotocolla_commessa(uuid) TO authenticated;
