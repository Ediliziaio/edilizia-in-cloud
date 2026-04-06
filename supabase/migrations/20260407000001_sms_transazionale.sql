-- ============================================================
-- Modulo SMS Transazionale (messaggi individuali + automazioni)
-- Separato dal modulo SMS Marketing (campagne bulk)
-- ============================================================

-- ─── sms_messages ─────────────────────────────────────────────
-- Storico messaggi SMS inviati e ricevuti (transazionali)
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','delivered','failed','received')),
  to_number       TEXT NOT NULL,
  from_number     TEXT NOT NULL,
  body            TEXT NOT NULL,
  telnyx_id       TEXT,
  trigger_type    TEXT CHECK (trigger_type IN ('manual','automation','api')),
  trigger_ref     UUID,
  trigger_entity  TEXT CHECK (trigger_entity IN ('preventivo','cantiere','fattura','intervento','documento')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_messages_company ON public.sms_messages;
CREATE POLICY sms_messages_company ON public.sms_messages
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_sms_messages_company_created
  ON public.sms_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status
  ON public.sms_messages(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_telnyx_id
  ON public.sms_messages(telnyx_id) WHERE telnyx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_trigger
  ON public.sms_messages(company_id, trigger_entity, trigger_ref)
  WHERE trigger_ref IS NOT NULL;

-- ─── sms_automations ──────────────────────────────────────────
-- Regole di automazione SMS (invio automatico su eventi)
CREATE TABLE IF NOT EXISTS public.sms_automations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  descrizione      TEXT,
  trigger_evento   TEXT NOT NULL
    CHECK (trigger_evento IN (
      'preventivo_firmato','preventivo_inviato',
      'fattura_scaduta',
      'cantiere_iniziato','cantiere_completato',
      'intervento_programmato',
      'documento_caricato',
      'pagamento_ricevuto'
    )),
  delay_minuti     INT NOT NULL DEFAULT 0,
  template_body    TEXT NOT NULL,
  tipo_destinatario TEXT NOT NULL DEFAULT 'cliente'
    CHECK (tipo_destinatario IN ('cliente','tecnico','custom_number')),
  numero_custom    TEXT,
  attiva           BOOLEAN NOT NULL DEFAULT TRUE,
  contatore_invii  INT NOT NULL DEFAULT 0,
  ultima_esecuzione TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_automations_company ON public.sms_automations;
CREATE POLICY sms_automations_company ON public.sms_automations
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_sms_automations_company
  ON public.sms_automations(company_id);
CREATE INDEX IF NOT EXISTS idx_sms_automations_evento
  ON public.sms_automations(company_id, trigger_evento)
  WHERE attiva = TRUE;

-- ─── sms_automation_logs ──────────────────────────────────────
-- Log esecuzioni automazioni SMS (audit trail)
CREATE TABLE IF NOT EXISTS public.sms_automation_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  UUID NOT NULL REFERENCES public.sms_automations(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sms_message_id UUID REFERENCES public.sms_messages(id) ON DELETE SET NULL,
  trigger_ref    UUID,
  trigger_entity TEXT,
  status         TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','failed','skipped')),
  error_message  TEXT,
  eseguita_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_automation_logs_company ON public.sms_automation_logs;
CREATE POLICY sms_automation_logs_company ON public.sms_automation_logs
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_sms_auto_logs_automation
  ON public.sms_automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_sms_auto_logs_company
  ON public.sms_automation_logs(company_id, eseguita_at DESC);

-- ─── Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_sms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sms_messages_updated_at ON public.sms_messages;
CREATE TRIGGER trg_sms_messages_updated_at
  BEFORE UPDATE ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_sms_updated_at();

DROP TRIGGER IF EXISTS trg_sms_automations_updated_at ON public.sms_automations;
CREATE TRIGGER trg_sms_automations_updated_at
  BEFORE UPDATE ON public.sms_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_sms_updated_at();
