-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-13 · Invio, Follow-up e Sequenze in uscita
-- ────────────────────────────────────────────────────────────────────────────
-- Il modulo più delicato della saga: solleciti e ricontatti AUTOMATIZZATI ma
-- con le quattro garanzie del cap.2:
--   1) STOP alla risposta, sempre (trigger su email_inbox in arrivo)
--   2) Consenso + disiscrizione (opt_out via email_suppressions esistente)
--   3) Human-in-the-loop: i TESTI vanno approvati prima di attivare la sequenza;
--      ogni sequenza sceglie se inviare in automatico o con conferma (alert).
--   4) Volume sotto controllo (limite_invii_giorno per sequenza).
--
-- Riusa l'infrastruttura esistente: invio via email_outbox + edge `email-send`;
-- bounce/spam/opt-out via `email_suppressions` (popolata da email-provider-webhook).
-- Niente azione irreversibile senza conferma: modalita_invio DEFAULT 'conferma'.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Definizione sequenza (template + step + modalità) ────────────────────
CREATE TABLE IF NOT EXISTS public.sequenze (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome                text NOT NULL,
  tipo                text NOT NULL DEFAULT 'followup_preventivo'
                        CHECK (tipo IN ('followup_preventivo','sollecito_pagamento','ricontatto_opportunita','conferma_appuntamento','altro')),
  attiva              boolean NOT NULL DEFAULT false,
  -- 'conferma' (default, sicuro): l'azienda vede l'alert e approva ogni invio.
  -- 'automatico': l'invio parte da solo (entro stop/limiti). Scelta nelle impostazioni.
  modalita_invio      text NOT NULL DEFAULT 'conferma'
                        CHECK (modalita_invio IN ('conferma','automatico')),
  -- step: [{ offset_giorni:int, oggetto:text, corpo_template:text, condizione_stop:text }]
  step                jsonb NOT NULL DEFAULT '[]'::jsonb,
  limite_invii_giorno int NOT NULL DEFAULT 50 CHECK (limite_invii_giorno BETWEEN 1 AND 500),
  oauth_connection_id uuid REFERENCES public.email_oauth_connections(id) ON DELETE SET NULL,
  -- approvazione obbligatoria dei testi prima dell'attivazione (cap.7)
  approvata_da        uuid REFERENCES auth.users(id),
  approvata_at        timestamptz,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Esecuzione: un destinatario arruolato in una sequenza ────────────────
CREATE TABLE IF NOT EXISTS public.sequenze_esecuzioni (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequenza_id         uuid NOT NULL REFERENCES public.sequenze(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  destinatario        text NOT NULL,                 -- email
  destinatario_nome   text,
  thread_id           uuid,                          -- soft (email_inbox.thread_id / email_threads.id)
  entita_tipo         text,                          -- opportunita|preventivo|scadenza|cliente|...
  entita_id           uuid,
  oauth_connection_id uuid REFERENCES public.email_oauth_connections(id) ON DELETE SET NULL,
  variabili           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {nome, importo, scadenza, ...}
  ancora_at           timestamptz NOT NULL DEFAULT now(),  -- riferimento per gli offset
  step_corrente       int NOT NULL DEFAULT 0,
  stato               text NOT NULL DEFAULT 'attiva'
                        CHECK (stato IN ('attiva','in_attesa_conferma','in_pausa','fermata_risposta','completata','opt_out','bounce','annullata')),
  prossimo_invio_at   timestamptz,
  ultimo_invio_at     timestamptz,
  fermata_motivo      text,
  optout_token        uuid NOT NULL DEFAULT gen_random_uuid(),  -- per link disiscrizione
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Log/coda di ogni invio (inviato o in attesa di conferma) ─────────────
CREATE TABLE IF NOT EXISTS public.sequenze_invii (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  esecuzione_id   uuid NOT NULL REFERENCES public.sequenze_esecuzioni(id) ON DELETE CASCADE,
  sequenza_id     uuid NOT NULL REFERENCES public.sequenze(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_index      int NOT NULL,
  outbox_id       uuid REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  oggetto         text,
  corpo_anteprima text,
  stato           text NOT NULL DEFAULT 'in_attesa_conferma'
                    CHECK (stato IN ('in_attesa_conferma','inviato','saltato','errore','annullato')),
  errore          text,
  creato_at       timestamptz NOT NULL DEFAULT now(),
  inviato_at      timestamptz
);

-- ── Indici ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sequenze_company       ON public.sequenze (company_id, attiva);
CREATE INDEX IF NOT EXISTS idx_seq_esec_company_stato  ON public.sequenze_esecuzioni (company_id, stato);
-- per il tick: trova le esecuzioni dovute
CREATE INDEX IF NOT EXISTS idx_seq_esec_dovute         ON public.sequenze_esecuzioni (prossimo_invio_at) WHERE stato = 'attiva';
-- per il trigger stop-on-reply: match destinatario↔mittente in arrivo (solo attive)
CREATE INDEX IF NOT EXISTS idx_seq_esec_destinatario   ON public.sequenze_esecuzioni (company_id, lower(destinatario))
  WHERE stato IN ('attiva','in_attesa_conferma','in_pausa');
CREATE INDEX IF NOT EXISTS idx_seq_esec_optout         ON public.sequenze_esecuzioni (optout_token);
CREATE INDEX IF NOT EXISTS idx_seq_invii_esecuzione    ON public.sequenze_invii (esecuzione_id, step_index);
CREATE INDEX IF NOT EXISTS idx_seq_invii_attesa        ON public.sequenze_invii (company_id, stato) WHERE stato = 'in_attesa_conferma';

-- updated_at touch
CREATE OR REPLACE FUNCTION public.sequenze_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_sequenze_touch ON public.sequenze;
CREATE TRIGGER trg_sequenze_touch BEFORE UPDATE ON public.sequenze
  FOR EACH ROW EXECUTE FUNCTION public.sequenze_touch_updated();
DROP TRIGGER IF EXISTS trg_seq_esec_touch ON public.sequenze_esecuzioni;
CREATE TRIGGER trg_seq_esec_touch BEFORE UPDATE ON public.sequenze_esecuzioni
  FOR EACH ROW EXECUTE FUNCTION public.sequenze_touch_updated();

-- ════════════════════════════════════════════════════════════════════════════
-- STOP-ON-REPLY (cap.2 — la garanzia numero uno)
-- Appena arriva un'email IN ARRIVO dal destinatario, ferma ogni sua sequenza.
-- Robusto: gira a prescindere da quale percorso inserisce l'email (poller,
-- import, ecc.). La copia "sent" che inseriamo noi è esclusa (mailbox_folder).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sequenze_stop_on_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Esclude la copia locale delle email inviate da noi
  IF coalesce(NEW.mailbox_folder, '') = 'sent' THEN
    RETURN NEW;
  END IF;
  IF NEW.from_email IS NULL OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.sequenze_esecuzioni e
     SET stato = 'fermata_risposta',
         fermata_motivo = 'Risposta del destinatario ricevuta',
         updated_at = now()
   WHERE e.company_id = NEW.company_id
     AND lower(e.destinatario) = lower(NEW.from_email)
     AND e.stato IN ('attiva','in_attesa_conferma','in_pausa');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sequenze_stop_on_reply ON public.email_inbox;
CREATE TRIGGER trg_sequenze_stop_on_reply
  AFTER INSERT ON public.email_inbox
  FOR EACH ROW EXECUTE FUNCTION public.sequenze_stop_on_reply();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC
-- ════════════════════════════════════════════════════════════════════════════

-- Approva i testi e attiva la sequenza (cap.7: niente attivazione senza approvazione).
CREATE OR REPLACE FUNCTION public.sequenza_approva_attiva(p_sequenza_id uuid, p_attiva boolean DEFAULT true)
RETURNS public.sequenze LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sequenze;
BEGIN
  SELECT * INTO r FROM public.sequenze WHERE id = p_sequenza_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sequenza_inesistente'; END IF;
  IF r.company_id <> public.get_effective_company_id() OR NOT public.is_email_staff_interno() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;
  IF p_attiva AND (r.step IS NULL OR jsonb_array_length(r.step) = 0) THEN
    RAISE EXCEPTION 'sequenza_senza_step';
  END IF;
  UPDATE public.sequenze
     SET attiva = p_attiva,
         approvata_da = CASE WHEN p_attiva THEN auth.uid() ELSE approvata_da END,
         approvata_at = CASE WHEN p_attiva THEN now() ELSE approvata_at END
   WHERE id = p_sequenza_id
   RETURNING * INTO r;
  RETURN r;
END $$;

-- Arruola un destinatario (es. "attiva follow-up" dalla singola opportunità/preventivo).
CREATE OR REPLACE FUNCTION public.sequenza_enroll(
  p_sequenza_id uuid,
  p_destinatario text,
  p_destinatario_nome text DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_entita_tipo text DEFAULT NULL,
  p_entita_id uuid DEFAULT NULL,
  p_variabili jsonb DEFAULT '{}'::jsonb,
  p_ancora_at timestamptz DEFAULT now(),
  p_oauth_connection_id uuid DEFAULT NULL
) RETURNS public.sequenze_esecuzioni LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.sequenze;
  e public.sequenze_esecuzioni;
  v_offset int;
  v_conn uuid;
BEGIN
  SELECT * INTO s FROM public.sequenze WHERE id = p_sequenza_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sequenza_inesistente'; END IF;
  IF s.company_id <> public.get_effective_company_id() OR NOT public.is_email_staff_interno() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;
  IF NOT s.attiva THEN RAISE EXCEPTION 'sequenza_non_attiva'; END IF;
  IF p_destinatario IS NULL OR position('@' in p_destinatario) = 0 THEN
    RAISE EXCEPTION 'destinatario_non_valido';
  END IF;

  -- Niente doppioni: se c'è già un'esecuzione viva per questo destinatario+sequenza, ritornala.
  SELECT * INTO e FROM public.sequenze_esecuzioni
   WHERE sequenza_id = p_sequenza_id AND lower(destinatario) = lower(p_destinatario)
     AND stato IN ('attiva','in_attesa_conferma','in_pausa')
   LIMIT 1;
  IF FOUND THEN RETURN e; END IF;

  v_offset := coalesce((s.step -> 0 ->> 'offset_giorni')::int, 0);
  v_conn := coalesce(p_oauth_connection_id, s.oauth_connection_id);

  INSERT INTO public.sequenze_esecuzioni (
    sequenza_id, company_id, destinatario, destinatario_nome, thread_id,
    entita_tipo, entita_id, oauth_connection_id, variabili, ancora_at,
    step_corrente, stato, prossimo_invio_at, created_by
  ) VALUES (
    p_sequenza_id, s.company_id, p_destinatario, p_destinatario_nome, p_thread_id,
    p_entita_tipo, p_entita_id, v_conn, coalesce(p_variabili,'{}'::jsonb), p_ancora_at,
    0, 'attiva', p_ancora_at + make_interval(days => v_offset), auth.uid()
  ) RETURNING * INTO e;
  RETURN e;
END $$;

-- Conferma/salta un invio in attesa (modalità 'conferma'), poi avanza l'esecuzione.
-- Chiamata dal frontend DOPO che email-send è andato a buon fine (azione='inviato')
-- oppure per saltare lo step (azione='saltato').
CREATE OR REPLACE FUNCTION public.sequenza_invio_conferma(p_invio_id uuid, p_azione text)
RETURNS public.sequenze_esecuzioni LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.sequenze_invii;
  e   public.sequenze_esecuzioni;
  s   public.sequenze;
  v_next int;
  v_offset int;
BEGIN
  IF p_azione NOT IN ('inviato','saltato') THEN RAISE EXCEPTION 'azione_non_valida'; END IF;
  SELECT * INTO inv FROM public.sequenze_invii WHERE id = p_invio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invio_inesistente'; END IF;
  IF inv.company_id <> public.get_effective_company_id() OR NOT public.is_email_staff_interno() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;
  IF inv.stato <> 'in_attesa_conferma' THEN RAISE EXCEPTION 'invio_gia_gestito'; END IF;

  SELECT * INTO e FROM public.sequenze_esecuzioni WHERE id = inv.esecuzione_id;
  SELECT * INTO s FROM public.sequenze WHERE id = inv.sequenza_id;

  UPDATE public.sequenze_invii
     SET stato = p_azione, inviato_at = CASE WHEN p_azione='inviato' THEN now() ELSE inviato_at END
   WHERE id = p_invio_id;

  -- Avanza: lo step appena gestito è inv.step_index → calcola il prossimo
  v_next := inv.step_index + 1;
  IF v_next >= jsonb_array_length(s.step) THEN
    UPDATE public.sequenze_esecuzioni
       SET stato='completata', step_corrente=v_next,
           ultimo_invio_at = CASE WHEN p_azione='inviato' THEN now() ELSE ultimo_invio_at END
     WHERE id = e.id RETURNING * INTO e;
  ELSE
    v_offset := coalesce((s.step -> v_next ->> 'offset_giorni')::int, 0);
    UPDATE public.sequenze_esecuzioni
       SET stato='attiva', step_corrente=v_next,
           prossimo_invio_at = e.ancora_at + make_interval(days => v_offset),
           ultimo_invio_at = CASE WHEN p_azione='inviato' THEN now() ELSE ultimo_invio_at END
     WHERE id = e.id RETURNING * INTO e;
  END IF;
  RETURN e;
END $$;

-- Pausa / stop / riprendi manuale (cruscotto).
CREATE OR REPLACE FUNCTION public.sequenza_esecuzione_stato(p_esecuzione_id uuid, p_stato text)
RETURNS public.sequenze_esecuzioni LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.sequenze_esecuzioni;
BEGIN
  IF p_stato NOT IN ('attiva','in_pausa','annullata') THEN RAISE EXCEPTION 'stato_non_valido'; END IF;
  SELECT * INTO e FROM public.sequenze_esecuzioni WHERE id = p_esecuzione_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'esecuzione_inesistente'; END IF;
  IF e.company_id <> public.get_effective_company_id() OR NOT public.is_email_staff_interno() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;
  -- non si "resuscita" una sequenza fermata da risposta/opt-out/bounce
  IF e.stato IN ('fermata_risposta','opt_out','bounce','completata') AND p_stato = 'attiva' THEN
    RAISE EXCEPTION 'esecuzione_non_riavviabile';
  END IF;
  UPDATE public.sequenze_esecuzioni SET stato = p_stato WHERE id = p_esecuzione_id RETURNING * INTO e;
  RETURN e;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — staff interno + service_role + super_admin (come MP-14/15)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sequenze            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequenze_esecuzioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequenze_invii      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sequenze_staff ON public.sequenze;
CREATE POLICY sequenze_staff ON public.sequenze FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS sequenze_service ON public.sequenze;
CREATE POLICY sequenze_service ON public.sequenze FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sequenze_super ON public.sequenze;
CREATE POLICY sequenze_super ON public.sequenze FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS seq_esec_staff ON public.sequenze_esecuzioni;
CREATE POLICY seq_esec_staff ON public.sequenze_esecuzioni FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS seq_esec_service ON public.sequenze_esecuzioni;
CREATE POLICY seq_esec_service ON public.sequenze_esecuzioni FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seq_esec_super ON public.sequenze_esecuzioni;
CREATE POLICY seq_esec_super ON public.sequenze_esecuzioni FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS seq_invii_staff ON public.sequenze_invii;
CREATE POLICY seq_invii_staff ON public.sequenze_invii FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS seq_invii_service ON public.sequenze_invii;
CREATE POLICY seq_invii_service ON public.sequenze_invii FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seq_invii_super ON public.sequenze_invii;
CREATE POLICY seq_invii_super ON public.sequenze_invii FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- RPC: niente esecuzione anonima
REVOKE EXECUTE ON FUNCTION public.sequenza_approva_attiva(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sequenza_enroll(uuid, text, text, uuid, text, uuid, jsonb, timestamptz, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sequenza_invio_conferma(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sequenza_esecuzione_stato(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sequenza_approva_attiva(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sequenza_enroll(uuid, text, text, uuid, text, uuid, jsonb, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sequenza_invio_conferma(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sequenza_esecuzione_stato(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.sequenze IS 'MP-EMAIL-AI-13: definizione sequenze in uscita (follow-up/solleciti/ricontatti). modalita_invio conferma|automatico. Approvazione testi obbligatoria prima di attiva.';
COMMENT ON TABLE public.sequenze_esecuzioni IS 'MP-EMAIL-AI-13: destinatari arruolati. Stop-on-reply via trigger su email_inbox. Opt-out/bounce via email_suppressions.';
COMMENT ON TABLE public.sequenze_invii IS 'MP-EMAIL-AI-13: coda/log invii per step. in_attesa_conferma = human-in-the-loop.';
