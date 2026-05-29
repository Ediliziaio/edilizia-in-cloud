-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-17 · Integrazione PEC (opzionale)
-- ────────────────────────────────────────────────────────────────────────────
-- La PEC ha valore legale (= raccomandata A/R). Se l'azienda NON collega una PEC
-- nulla cambia. Se la collega:
--   • i messaggi e le ricevute sono marcati e conservati (conservazione_legale)
--   • le ricevute (accettazione/consegna/mancata) si agganciano al messaggio
--   • nessuna automazione (bonifica in massa, regole) può cancellarli/nasconderli
-- Additivo e reversibile. Credenziali PEC: restano cifrate (riuso IMAP), mai qui.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Casella PEC (estende il collegamento caselle esistente) ──────────────
ALTER TABLE public.email_oauth_connections ADD COLUMN IF NOT EXISTS is_pec boolean NOT NULL DEFAULT false;
ALTER TABLE public.email_oauth_connections ADD COLUMN IF NOT EXISTS pec_provider text;       -- aruba|legalmail|poste|register|...
ALTER TABLE public.email_oauth_connections ADD COLUMN IF NOT EXISTS pec_certificata boolean NOT NULL DEFAULT false;

-- ── 2. Marcatura messaggio PEC + collegamento ricevute ──────────────────────
ALTER TABLE public.email_inbox ADD COLUMN IF NOT EXISTS is_pec boolean NOT NULL DEFAULT false;
ALTER TABLE public.email_inbox ADD COLUMN IF NOT EXISTS pec_tipo text;            -- messaggio|accettazione|consegna|mancata_consegna
ALTER TABLE public.email_inbox ADD COLUMN IF NOT EXISTS pec_messaggio_id uuid;    -- la ricevuta punta al messaggio
ALTER TABLE public.email_inbox ADD COLUMN IF NOT EXISTS pec_stato text;           -- inviata|accettata|consegnata|mancata
ALTER TABLE public.email_inbox ADD COLUMN IF NOT EXISTS conservazione_legale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_inbox_pec     ON public.email_inbox (company_id, is_pec) WHERE is_pec = true;
CREATE INDEX IF NOT EXISTS idx_email_inbox_pec_msg ON public.email_inbox (pec_messaggio_id) WHERE pec_messaggio_id IS NOT NULL;

-- ── 3. Classificazione PEC + aggancio ricevute (BEFORE INSERT) ──────────────
-- Riconosce, dai segnali standard (header X-Ricevuta/X-Riferimento-Message-ID,
-- prefissi oggetto DPR 68/2005, o casella marcata PEC), se l'email è PEC e di
-- che tipo. Le ricevute si collegano al messaggio originale e ne aggiornano lo stato.
CREATE OR REPLACE FUNCTION public.pec_classifica_su_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_h jsonb := coalesce(NEW.headers, '{}'::jsonb);  -- NULL headers → '{}' (l'op. jsonb ? su NULL darebbe NULL)
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

  -- Ricevuta → collega al messaggio originale e aggiornane lo stato di spedizione
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

DROP TRIGGER IF EXISTS trg_pec_classifica ON public.email_inbox;
CREATE TRIGGER trg_pec_classifica BEFORE INSERT ON public.email_inbox
  FOR EACH ROW EXECUTE FUNCTION public.pec_classifica_su_insert();

-- ── 4. GUARDRAIL LEGALE: la bonifica in massa non tocca MAI la PEC ──────────
-- Re-crea bonifica_archivia_categoria aggiungendo "AND e.is_pec = false".
CREATE OR REPLACE FUNCTION public.bonifica_archivia_categoria(p_categoria text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_uid uuid; v_ids uuid[]; v_azione uuid;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_company := public.get_effective_company_id(); v_uid := auth.uid();
  SELECT array_agg(e.id) INTO v_ids FROM public.email_inbox e
   WHERE e.company_id = v_company AND e.is_trashed=false AND e.is_archived=false AND e.is_read=false AND e.is_personale=false
     AND e.is_pec = false                                   -- ← materiale PEC mai archiviato in massa
     AND (e.user_id = v_uid OR e.user_id IS NULL)
     AND COALESCE(e.categoria::text, e.ai_category, 'altro') = p_categoria;
  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN RETURN jsonb_build_object('count', 0); END IF;
  UPDATE public.email_inbox SET is_archived = true, is_read = true WHERE id = ANY(v_ids);
  INSERT INTO public.bonifica_azioni (company_id, gruppo, azione, email_ids, created_by)
    VALUES (v_company, p_categoria, 'archivia', v_ids, v_uid) RETURNING id INTO v_azione;
  RETURN jsonb_build_object('count', array_length(v_ids,1), 'azione_id', v_azione);
END $$;
REVOKE EXECUTE ON FUNCTION public.bonifica_archivia_categoria(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonifica_archivia_categoria(text) TO authenticated, service_role;

COMMENT ON COLUMN public.email_inbox.is_pec IS 'MP-EMAIL-AI-17: messaggio/ricevuta PEC (valore legale). Escluso dalle azioni distruttive automatiche.';
COMMENT ON FUNCTION public.pec_classifica_su_insert() IS 'MP-EMAIL-AI-17: marca le email PEC e aggancia le ricevute al messaggio originale aggiornandone lo stato.';
