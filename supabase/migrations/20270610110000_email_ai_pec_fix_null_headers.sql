-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-17 · FIX — headers NULL marcava per errore email normali come PEC
-- ────────────────────────────────────────────────────────────────────────────
-- Con headers NULL l'operatore jsonb `?` restituiva NULL → v_is_pec NULL →
-- `IF NOT NULL` non eseguiva il RETURN → tutte le email senza header venivano
-- marcate is_pec. Fix: normalizzare headers a '{}' e coalesce sul guard.
-- (Trovato dal test fixture: una email "Preventivo ristrutturazione" risultava PEC.)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pec_classifica_su_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h jsonb := coalesce(NEW.headers, '{}'::jsonb);
  v_conn_pec boolean := false;
  v_subj text := lower(coalesce(NEW.subject, ''));
  v_xric text := lower(coalesce(v_h->>'X-Ricevuta', v_h->>'x-ricevuta', ''));
  v_rif  text := coalesce(v_h->>'X-Riferimento-Message-ID', v_h->>'x-riferimento-message-id', '');
  v_tipo text := 'messaggio';
  v_is_pec boolean := false;
  v_msg_id uuid;
BEGIN
  IF NEW.oauth_connection_id IS NOT NULL THEN
    SELECT coalesce(is_pec, false) INTO v_conn_pec FROM public.email_oauth_connections WHERE id = NEW.oauth_connection_id;
  END IF;

  v_is_pec := coalesce(v_conn_pec, false)
    OR v_xric <> ''
    OR (v_h ? 'X-Riferimento-Message-ID') OR (v_h ? 'x-riferimento-message-id')
    OR v_subj LIKE 'accettazione:%' OR v_subj LIKE 'consegna:%' OR v_subj LIKE 'avvenuta consegna:%'
    OR v_subj LIKE 'mancata consegna:%' OR v_subj LIKE 'errore consegna%'
    OR v_subj LIKE 'preavviso di mancata consegna:%' OR v_subj LIKE 'anomalia messaggio:%'
    OR v_subj LIKE 'posta certificata:%';

  IF NOT coalesce(v_is_pec, false) THEN RETURN NEW; END IF;

  IF v_xric = 'accettazione' OR v_subj LIKE 'accettazione:%' THEN
    v_tipo := 'accettazione';
  ELSIF v_xric = 'avvenuta-consegna' OR v_subj LIKE 'consegna:%' OR v_subj LIKE 'avvenuta consegna:%' THEN
    v_tipo := 'consegna';
  ELSIF v_xric IN ('errore-consegna', 'preavviso-errore-consegna', 'non-accettazione')
        OR v_subj LIKE 'mancata consegna:%' OR v_subj LIKE 'errore consegna%'
        OR v_subj LIKE 'preavviso di mancata consegna:%' THEN
    v_tipo := 'mancata_consegna';
  ELSE
    v_tipo := 'messaggio';
  END IF;

  NEW.is_pec := true;
  NEW.conservazione_legale := true;
  NEW.pec_tipo := v_tipo;

  IF v_tipo <> 'messaggio' AND v_rif <> '' THEN
    SELECT id INTO v_msg_id FROM public.email_inbox
     WHERE company_id = NEW.company_id AND message_id = v_rif
     ORDER BY received_at DESC LIMIT 1;
    IF v_msg_id IS NOT NULL THEN
      NEW.pec_messaggio_id := v_msg_id;
      UPDATE public.email_inbox SET
        pec_stato = CASE
          WHEN v_tipo = 'consegna' THEN 'consegnata'
          WHEN v_tipo = 'mancata_consegna' THEN 'mancata'
          WHEN v_tipo = 'accettazione' AND coalesce(pec_stato, '') <> 'consegnata' THEN 'accettata'
          ELSE pec_stato END,
        is_pec = true, conservazione_legale = true
      WHERE id = v_msg_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;
