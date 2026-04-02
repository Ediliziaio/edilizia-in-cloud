-- ═══════════════════════════════════════════════════════════════════════════
-- DIARIO PRIVATO DELL'ORDINE — Migration SQL
-- Tabelle: order_events · order_messages · message_templates
-- Triggers: after_order_insert · after_order_item_status · after_installment_paid
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ENUM event_type ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.order_event_type AS ENUM (
    -- Lifecycle ordine
    'ordine_creato',
    'ordine_aggiornato',
    'ordine_duplicato',
    'ordine_eliminato',
    -- Stato
    'stato_cambiato',
    -- Articoli
    'articolo_aggiunto',
    'articolo_aggiornato',
    'articolo_stato_cambiato',
    'articolo_eliminato',
    -- Pagamenti
    'acconto_ricevuto',
    'acconto_2_ricevuto',
    'saldo_ricevuto',
    'pagamento_fornitore',
    -- Fatturazione
    'fattura_creata',
    'fattura_inviata_sdi',
    'fattura_pagata',
    'nota_credito_creata',
    -- Allegati & media
    'allegato_caricato',
    'foto_rilievo_caricata',
    'reportino_cantiere',
    -- Appuntamenti
    'appuntamento_creato',
    'appuntamento_confermato',
    'appuntamento_completato',
    -- Fornitore
    'ordine_fornitore_creato',
    'merce_arrivata',
    -- Contratto & firma
    'contratto_firmato',
    'preventivo_accettato',
    -- Giornale lavori
    'giornale_lavori_inserito',
    -- Note
    'nota_interna'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── TABELLA order_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type public.order_event_type NOT NULL,
  -- Payload flessibile: contiene i dati specifici per ogni tipo di evento
  payload    JSONB NOT NULL DEFAULT '{}',
  actor_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id   ON public.order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_company_id ON public.order_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_type       ON public.order_events(event_type);

-- ── ENUMs per messaggi ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.message_channel AS ENUM ('email','sms','whatsapp','nota_interna');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_direction AS ENUM ('out','in');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_status AS ENUM ('pending','sent','delivered','read','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── TABELLA order_messages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel    public.message_channel NOT NULL,
  direction  public.message_direction NOT NULL DEFAULT 'out',
  -- Contenuto
  subject    TEXT,
  body       TEXT NOT NULL,
  template_id UUID,
  -- Destinatario
  to_name    TEXT,
  to_phone   TEXT,
  to_email   TEXT,
  -- Stato delivery
  status        public.message_status NOT NULL DEFAULT 'pending',
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  failed_reason TEXT,
  -- ID esterno dal provider
  external_id TEXT,
  -- Thread
  reply_to_id UUID REFERENCES public.order_messages(id) ON DELETE SET NULL,
  -- Chi ha inviato
  sent_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_name TEXT,
  -- Metadati provider
  provider_meta JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON public.order_messages(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_messages_external ON public.order_messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_messages_channel  ON public.order_messages(order_id, channel);

-- ── TABELLA message_templates ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  channel    public.message_channel NOT NULL,
  subject    TEXT,
  body       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_company ON public.message_templates(company_id, channel);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates  ENABLE ROW LEVEL SECURITY;

-- order_events: solo staff della propria company
CREATE POLICY "order_events_company_isolation" ON public.order_events
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- order_messages: stesso pattern
CREATE POLICY "order_messages_company_isolation" ON public.order_messages
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- message_templates: CRUD solo alla propria company
CREATE POLICY "message_templates_company_isolation" ON public.message_templates
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Superadmin: accesso completo a tutte le tabelle
CREATE POLICY "sa_order_events"      ON public.order_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "sa_order_messages"    ON public.order_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "sa_message_templates" ON public.message_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ── TRIGGER 1: evento quando ordine viene creato ──────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_order_created()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.order_events(order_id, company_id, event_type, payload)
  VALUES (
    NEW.id,
    NEW.company_id,
    'ordine_creato',
    jsonb_build_object(
      'order_code',   NEW.order_code,
      'description',  LEFT(NEW.description, 100),
      'total_amount', NEW.total_amount
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_order_insert ON public.orders;
CREATE TRIGGER after_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_created();

-- ── TRIGGER 2: evento per cambio articolo status ──────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_order_item_status_changed()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company_id UUID;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT company_id INTO v_company_id FROM public.orders WHERE id = NEW.order_id;
  INSERT INTO public.order_events(order_id, company_id, event_type, payload)
  VALUES (
    NEW.order_id,
    v_company_id,
    'articolo_stato_cambiato',
    jsonb_build_object(
      'item_name',   NEW.name,
      'item_id',     NEW.id,
      'from_status', OLD.status,
      'to_status',   NEW.status,
      'quantity',    NEW.quantity
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_order_item_status ON public.order_items;
CREATE TRIGGER after_order_item_status
  AFTER UPDATE OF status ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_item_status_changed();

-- ── TRIGGER 3: evento per toggle pagamento (installments) ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_installment_paid()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company_id UUID;
BEGIN
  IF OLD.is_paid = NEW.is_paid THEN RETURN NEW; END IF;
  SELECT company_id INTO v_company_id FROM public.orders WHERE id = NEW.order_id;
  IF NEW.is_paid THEN
    INSERT INTO public.order_events(order_id, company_id, event_type, payload)
    VALUES (
      NEW.order_id,
      v_company_id,
      'acconto_ricevuto',
      jsonb_build_object(
        'label',     NEW.label,
        'amount',    NEW.amount,
        'paid_date', NEW.paid_date,
        'type',      NEW.type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_installment_paid ON public.order_installments;
CREATE TRIGGER after_installment_paid
  AFTER UPDATE OF is_paid ON public.order_installments
  FOR EACH ROW EXECUTE FUNCTION public.trg_installment_paid();

-- ── SUPABASE REALTIME ─────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
