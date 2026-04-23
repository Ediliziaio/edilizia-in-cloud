-- MP03 — Handler production assistenza/lead/marketing/notifiche
-- Tabelle: support_tickets + wa_meta_templates + wa_notifiche_triggers +
-- wa_notifiche_cooldown + wa_notifiche_log + extensions su marketing_contacts.
-- Adattato allo schema reale:
--   - NO crm_contacts (usiamo marketing_contacts estesa)
--   - NO user_company_roles (RLS via profiles.company_id)
-- Owner: Florin Andriciuc | Data: 2026-04-23

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Extensions su marketing_contacts (uso come CRM contact universale MP03)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS opt_out BOOLEAN DEFAULT false;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS stato TEXT;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS tipo TEXT;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS qualificazione_json JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS telefono_normalized TEXT;

CREATE INDEX IF NOT EXISTS ix_marketing_contacts_tel_norm
  ON public.marketing_contacts(telefono_normalized)
  WHERE telefono_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_marketing_contacts_company_tipo_stato
  ON public.marketing_contacts(company_id, tipo, stato);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. support_tickets (ticket di assistenza)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id        UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  numero_progressivo INT,
  titolo            TEXT NOT NULL,
  descrizione       TEXT NOT NULL,
  urgenza           TEXT CHECK (urgenza IN ('alta','media','bassa')) DEFAULT 'media',
  categoria         TEXT CHECK (categoria IN (
    'problema_tecnico','richiesta_info','lamentela',
    'modifica_ordine','sollecito_pagamento','altro'
  )) DEFAULT 'altro',
  stato             TEXT CHECK (stato IN ('aperto','in_lavorazione','risolto','chiuso'))
                      DEFAULT 'aperto',
  source            TEXT DEFAULT 'whatsapp',
  channel_msg_id    TEXT,
  assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_support_tickets_company_stato
  ON public.support_tickets(company_id, stato);
CREATE INDEX IF NOT EXISTS ix_support_tickets_contact
  ON public.support_tickets(contact_id);
CREATE INDEX IF NOT EXISTS ix_support_tickets_urgenti
  ON public.support_tickets(created_at DESC)
  WHERE urgenza = 'alta' AND stato IN ('aperto', 'in_lavorazione');

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_company_read" ON public.support_tickets;
CREATE POLICY "support_tickets_company_read" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "support_tickets_company_write" ON public.support_tickets;
CREATE POLICY "support_tickets_company_write" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "support_tickets_company_update" ON public.support_tickets;
CREATE POLICY "support_tickets_company_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "support_tickets_service_all" ON public.support_tickets;
CREATE POLICY "support_tickets_service_all" ON public.support_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. wa_meta_templates (sync da Meta Business)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_meta_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wa_number_id        UUID REFERENCES public.ai_whatsapp_numbers(id) ON DELETE CASCADE,
  template_name       TEXT NOT NULL,
  template_language   TEXT NOT NULL DEFAULT 'it',
  category            TEXT,
  status              TEXT,
  components_json     JSONB,
  variables_count     INT DEFAULT 0,
  synced_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wa_number_id, template_name, template_language)
);

CREATE INDEX IF NOT EXISTS ix_wa_meta_templates_company_status
  ON public.wa_meta_templates(company_id, status);

ALTER TABLE public.wa_meta_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_meta_templates_company_read" ON public.wa_meta_templates;
CREATE POLICY "wa_meta_templates_company_read" ON public.wa_meta_templates
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "wa_meta_templates_service_all" ON public.wa_meta_templates;
CREATE POLICY "wa_meta_templates_service_all" ON public.wa_meta_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. wa_notifiche_triggers
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_notifiche_triggers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_kind       TEXT NOT NULL CHECK (trigger_kind IN (
    'fattura_scaduta','ddt_pendente','margine_basso',
    'approvazione_pendente','preventivo_inviato',
    'sal_raggiunto','fattura_emessa','custom'
  )),
  enabled            BOOLEAN DEFAULT true,
  config             JSONB DEFAULT '{}'::jsonb,
  template_name      TEXT NOT NULL,
  wa_number_id       UUID REFERENCES public.ai_whatsapp_numbers(id) ON DELETE CASCADE,
  destinatario_kind  TEXT CHECK (destinatario_kind IN ('titolare','cliente','operaio','custom')),
  destinatario_custom_phone TEXT,
  last_fired_at      TIMESTAMPTZ,
  fire_count         INT DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, trigger_kind)
);

CREATE INDEX IF NOT EXISTS ix_wa_notifiche_triggers_enabled
  ON public.wa_notifiche_triggers(company_id)
  WHERE enabled = true;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. wa_notifiche_cooldown
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_notifiche_cooldown (
  trigger_id    UUID NOT NULL REFERENCES public.wa_notifiche_triggers(id) ON DELETE CASCADE,
  subject_id    TEXT NOT NULL,
  fired_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (trigger_id, subject_id)
);

CREATE INDEX IF NOT EXISTS ix_wa_notifiche_cooldown_age
  ON public.wa_notifiche_cooldown(fired_at);

CREATE OR REPLACE FUNCTION public.cleanup_notifiche_cooldown()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.wa_notifiche_cooldown
  WHERE fired_at < now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.cleanup_notifiche_cooldown() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_notifiche_cooldown() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. wa_notifiche_log
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_notifiche_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id       UUID REFERENCES public.wa_notifiche_triggers(id) ON DELETE SET NULL,
  company_id       UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_id       TEXT,
  destinatario     TEXT,
  template_name    TEXT,
  variables_used   JSONB,
  sent_at          TIMESTAMPTZ DEFAULT now(),
  stato            TEXT DEFAULT 'sent' CHECK (stato IN ('sent','failed','delivered','read')),
  error_detail     TEXT
);

CREATE INDEX IF NOT EXISTS ix_wa_notifiche_log_ts
  ON public.wa_notifiche_log(sent_at DESC);

ALTER TABLE public.wa_notifiche_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_notifiche_cooldown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_notifiche_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_triggers_company_rw" ON public.wa_notifiche_triggers;
CREATE POLICY "notif_triggers_company_rw" ON public.wa_notifiche_triggers
  FOR ALL TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "notif_log_company_read" ON public.wa_notifiche_log;
CREATE POLICY "notif_log_company_read" ON public.wa_notifiche_log
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "notif_triggers_all_service" ON public.wa_notifiche_triggers;
CREATE POLICY "notif_triggers_all_service" ON public.wa_notifiche_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notif_cd_all_service" ON public.wa_notifiche_cooldown;
CREATE POLICY "notif_cd_all_service" ON public.wa_notifiche_cooldown
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notif_log_all_service" ON public.wa_notifiche_log;
CREATE POLICY "notif_log_all_service" ON public.wa_notifiche_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Comments self-doc
-- ───────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.support_tickets IS
  'MP03 — Ticket di assistenza clienti aperti dal bot assistenza WhatsApp.';
COMMENT ON TABLE public.wa_meta_templates IS
  'MP03 — Template Meta Business Manager sincronizzati via sync-meta-templates.';
COMMENT ON TABLE public.wa_notifiche_triggers IS
  'MP03 — Configurazione per-company dei trigger di notifiche automatiche.';
COMMENT ON TABLE public.wa_notifiche_cooldown IS
  'MP03 — Anti-spam: 1 notifica per subject_id per trigger per 24h.';
COMMENT ON TABLE public.wa_notifiche_log IS
  'MP03 — Audit log delle notifiche inviate.';

COMMIT;
