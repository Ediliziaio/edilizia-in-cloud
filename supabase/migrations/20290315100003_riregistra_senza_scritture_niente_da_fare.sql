-- Cambiare il conto di una fattura che non è in contabilità generale non dà più «Accesso negato»
-- (12/11/2026).
--
-- Dopo ogni cambio di conto l'app chiede alla contabilità generale di rifare la scrittura della
-- fattura. La funzione controllava il permesso della contabilità prima di guardare se una
-- scrittura c'era: chi non ha quel permesso riceveva «Accesso negato» anche quando non c'era
-- niente da rifare (un'azienda senza contabilità generale ha zero scritture), e l'avviso
-- «Contabilità generale non aggiornata» faceva credere che il conto non fosse cambiato.
-- Ora: senza scritture della fattura la risposta è «niente da fare», a chiunque veda l'azienda;
-- con scritture da rifare il permesso della contabilità resta obbligatorio.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.contabilita_riregistra_documento(p_company uuid, p_documento uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
DECLARE s record; v_anno int; v_stornate int := 0; v_esito jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR public.user_can_access_company(p_company) IS NOT TRUE) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Niente in contabilità per questo documento: non c'è niente da rifare, per nessuno.
  IF NOT EXISTS (SELECT 1 FROM public.contabilita_scritture c
                  WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
                    AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)) THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  FOR s IN
    SELECT * FROM public.contabilita_scritture c
     WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)
  LOOP
    v_anno := s.esercizio;
    -- Alla data della scrittura (il primo giorno libero se il giornale è stampato fin lì): storno e
    -- scrittura nuova restano nello stesso esercizio.
    PERFORM public.contabilita_inserisci_scrittura(s.company_id, public.contabilita_data_utile(s.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
      coalesce(nullif(btrim(p_motivo), ''), 'Documento registrato di nuovo'), s.documento_numero, s.documento_data,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id),
      'storno', s.id, s.id);
    v_stornate := v_stornate + 1;
  END LOOP;
  IF v_anno IS NULL THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  v_esito := public.contabilita_genera_da_documenti(p_company, v_anno, p_documento);
  IF jsonb_array_length(coalesce(v_esito->'errori', '[]'::jsonb)) > 0
     OR coalesce((v_esito->>'fatture_emesse')::int, 0) + coalesce((v_esito->>'fatture_ricevute')::int, 0) = 0 THEN
    RAISE EXCEPTION 'Il documento non si può registrare di nuovo (%): la scrittura di prima resta com''era',
      coalesce(v_esito->'errori'->>0, 'nessuna scrittura generata') USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('stornate', v_stornate, 'esito', v_esito);
END $function$;
