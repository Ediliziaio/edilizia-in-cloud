-- ============================================================================
-- platform_email_templates — Editor template email transazionali (Super Admin)
-- ============================================================================
-- Permette al super_admin di personalizzare subject + html_body + text_body
-- dei template transazionali (welcome, password_reset, invoice_sent, ...).
--
-- Pattern "DB overrides, code fallback":
--   - Se esiste una riga attiva per (template_key, role_variant) → usa quella
--   - Altrimenti fallback al renderer hardcoded in code (status quo)
-- → zero breaking change, gli 8 template esistenti continuano a funzionare.
--
-- Il corpo editato è l'"inner body" (solo il contenuto centrale):
-- header, footer, branding, layout Outlook-compatible restano in code via
-- renderLayout(). Questo evita che il super_admin rompa la
-- compatibilità con client email legacy.
--
-- role_variant (NULL di default) è predisposto per Fase 2: permetterà
-- varianti di welcome.ts in base al ruolo dell'utente invitato
-- (super_admin vs company_admin vs operaio vs cliente, ecc.).
-- ============================================================================

-- 1. Tabella principale
CREATE TABLE IF NOT EXISTS public.platform_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chiave logica del template (welcome, password_reset, invoice_sent, ...).
  -- Deve matchare una entry di TEMPLATE_REGISTRY in renderTemplate.ts.
  template_key TEXT NOT NULL,

  -- Variante per ruolo. NULL = default applicato a tutti i ruoli.
  -- Fase 2: valorizzabile con 'super_admin', 'company_admin', 'company_member', ecc.
  role_variant TEXT,

  -- Oggetto email (supporta placeholder {{variable}}).
  subject TEXT NOT NULL,

  -- Corpo HTML dell'"inner body" (il contenuto centrale, senza header/footer).
  -- Il layout esterno (Outlook-safe, branding, unsubscribe) è gestito da
  -- renderLayout() in code e non è editabile per evitare breakage.
  html_body TEXT NOT NULL,

  -- Versione plain text (opzionale). Se NULL viene derivata automaticamente
  -- dal resolver strippando i tag HTML.
  text_body TEXT,

  -- Se false la riga è ignorata dal resolver (fallback al code).
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Versione incrementale ad ogni save. Semplice, non storicizzata: per
  -- rollback punto-a-punto serve un backup esterno (scope Fase 2).
  version INTEGER NOT NULL DEFAULT 1,

  -- Nota interna super_admin (es. "testata il 12/04, ok con Gmail+Outlook").
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Vincoli di integrità
  CONSTRAINT platform_email_templates_key_not_empty
    CHECK (length(btrim(template_key)) > 0),
  CONSTRAINT platform_email_templates_subject_not_empty
    CHECK (length(btrim(subject)) > 0),
  CONSTRAINT platform_email_templates_html_not_empty
    CHECK (length(btrim(html_body)) > 0)
);

-- Unique per (template_key, role_variant). NULLS NOT DISTINCT → evita due
-- default per la stessa key (NULL, NULL trattati come duplicati).
CREATE UNIQUE INDEX IF NOT EXISTS platform_email_templates_key_variant_unique
  ON public.platform_email_templates(template_key, role_variant)
  NULLS NOT DISTINCT;

-- Index per lookup rapido del resolver (enabled sempre filtrato).
CREATE INDEX IF NOT EXISTS platform_email_templates_lookup_idx
  ON public.platform_email_templates(template_key, role_variant)
  WHERE enabled = true;

-- 2. Trigger updated_at + version bump automatico
CREATE OR REPLACE FUNCTION public.platform_email_templates_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  -- version bump solo quando cambia davvero il contenuto
  IF (
    NEW.subject IS DISTINCT FROM OLD.subject OR
    NEW.html_body IS DISTINCT FROM OLD.html_body OR
    NEW.text_body IS DISTINCT FROM OLD.text_body OR
    NEW.enabled IS DISTINCT FROM OLD.enabled
  ) THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_email_templates_touch ON public.platform_email_templates;
CREATE TRIGGER platform_email_templates_touch
  BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.platform_email_templates_touch_updated();

-- 3. RLS — solo super_admin può leggere/scrivere
ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_email_templates_read ON public.platform_email_templates;
CREATE POLICY platform_email_templates_read ON public.platform_email_templates
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS platform_email_templates_write ON public.platform_email_templates;
CREATE POLICY platform_email_templates_write ON public.platform_email_templates
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 4. Commenti per documentazione
COMMENT ON TABLE public.platform_email_templates IS
  'Editor super_admin per template email transazionali. Pattern DB-override/code-fallback: se riga attiva esiste, ha priorità sul renderer hardcoded.';

COMMENT ON COLUMN public.platform_email_templates.template_key IS
  'Chiave logica template. Valori validi: welcome, password_reset, invoice_sent, quote_sent, ddt_sent, invoice_due_soon, user_invited (vedi TEMPLATE_REGISTRY in _shared/renderTemplate.ts).';

COMMENT ON COLUMN public.platform_email_templates.role_variant IS
  'Variante per ruolo destinatario. NULL = default. Fase 2 userà super_admin, company_admin, company_member.';

COMMENT ON COLUMN public.platform_email_templates.html_body IS
  'Inner body HTML (solo contenuto centrale). Header/footer/layout restano in code per compatibilità client email legacy.';

COMMENT ON COLUMN public.platform_email_templates.version IS
  'Contatore auto-incrementato ad ogni save di subject/html_body/text_body/enabled.';
