-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.outreach_brands (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              text NOT NULL,
  from_name         text,
  reply_to          text,
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','archived')),
  default_daily_cap integer NOT NULL DEFAULT 40 CHECK (default_daily_cap >= 0),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_brands_company
  ON public.outreach_brands (company_id, status);

ALTER TABLE public.outreach_sending_domains ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_sender_accounts  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_sequences        ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_send_queue       ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_senders_brand
  ON public.outreach_sender_accounts (brand_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_brand
  ON public.outreach_send_queue (brand_id, status);

DROP TRIGGER IF EXISTS trg_outreach_brands_updated ON public.outreach_brands;
CREATE TRIGGER trg_outreach_brands_updated BEFORE UPDATE ON public.outreach_brands
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();

ALTER TABLE public.outreach_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_brands_super ON public.outreach_brands;
CREATE POLICY outreach_brands_super ON public.outreach_brands
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS outreach_brands_service ON public.outreach_brands;
CREATE POLICY outreach_brands_service ON public.outreach_brands
  FOR ALL TO service_role USING (true) WITH CHECK (true);
