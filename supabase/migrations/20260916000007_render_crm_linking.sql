-- ═══════════════════════════════════════════════════════════════════
-- Link Render Sessions → CRM (Contatti, Opportunità, Preventivi)
-- 2026-04-09
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add contact_id + opportunity_id to all render session tables ──

-- render_sessions (infissi)
ALTER TABLE public.render_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_sessions_contact ON public.render_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_sessions_opportunity ON public.render_sessions(opportunity_id);

-- render_bagno_sessions
ALTER TABLE public.render_bagno_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_bagno_sessions_contact ON public.render_bagno_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_bagno_sessions_opportunity ON public.render_bagno_sessions(opportunity_id);

-- render_facciata_sessions
ALTER TABLE public.render_facciata_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_facciata_sessions_contact ON public.render_facciata_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_facciata_sessions_opportunity ON public.render_facciata_sessions(opportunity_id);

-- render_pavimento_sessions
ALTER TABLE public.render_pavimento_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_pavimento_sessions_contact ON public.render_pavimento_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_pavimento_sessions_opportunity ON public.render_pavimento_sessions(opportunity_id);

-- render_persiane_sessions
ALTER TABLE public.render_persiane_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_persiane_sessions_contact ON public.render_persiane_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_persiane_sessions_opportunity ON public.render_persiane_sessions(opportunity_id);

-- render_tetto_sessions
ALTER TABLE public.render_tetto_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_contact ON public.render_tetto_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_tetto_sessions_opportunity ON public.render_tetto_sessions(opportunity_id);

-- render_stanza_sessions
ALTER TABLE public.render_stanza_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_contact ON public.render_stanza_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_stanza_sessions_opportunity ON public.render_stanza_sessions(opportunity_id);

-- ── 2. Junction table: render results attached to quotes ──

CREATE TABLE IF NOT EXISTS public.quote_render_attachments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  -- polymorphic: one of these will be set
  render_session_id uuid REFERENCES public.render_sessions(id) ON DELETE CASCADE,
  render_bagno_session_id uuid REFERENCES public.render_bagno_sessions(id) ON DELETE CASCADE,
  render_facciata_session_id uuid REFERENCES public.render_facciata_sessions(id) ON DELETE CASCADE,
  render_pavimento_session_id uuid REFERENCES public.render_pavimento_sessions(id) ON DELETE CASCADE,
  render_persiane_session_id uuid REFERENCES public.render_persiane_sessions(id) ON DELETE CASCADE,
  render_tetto_session_id uuid REFERENCES public.render_tetto_sessions(id) ON DELETE CASCADE,
  render_stanza_session_id uuid REFERENCES public.render_stanza_sessions(id) ON DELETE CASCADE,
  render_type text NOT NULL CHECK (render_type IN ('infissi','bagno','facciata','pavimento','persiane','tetto','stanza')),
  image_url text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quote_render_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_quote_render_attachments" ON public.quote_render_attachments
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "sa_quote_render_attachments" ON public.quote_render_attachments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_quote_render_attachments_quote ON public.quote_render_attachments(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_render_attachments_company ON public.quote_render_attachments(company_id);
