-- ============================================================================
-- Outreach — livello "Brand" (workspace mittente) per cold multi-brand
-- ============================================================================
-- Ogni Brand = pool ISOLATO di domini + caselle, con identità (from_name,
-- reply_to) e cap propri. Le sequenze spediscono dal pool del loro brand; il
-- dispatcher filtra le caselle per brand dell'item in coda. Così 5 domini per
-- "Edilizia in Cloud cold" e altri 5 per "Marketing edile" restano separati e
-- non si contaminano la reputazione. Additiva e idempotente.
--
-- NOTA: applicare via MCP apply_migration (vedi project_migration_workflow).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outreach_brands (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              text NOT NULL,
  from_name         text,          -- identità mittente del brand (override display casella)
  reply_to          text,          -- reply-to del brand
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','archived')),
  default_daily_cap integer NOT NULL DEFAULT 40 CHECK (default_daily_cap >= 0),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_brands_company
  ON public.outreach_brands (company_id, status);

-- Aggancio del brand alle entità esistenti
ALTER TABLE public.outreach_sending_domains ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_sender_accounts  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_sequences        ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;
ALTER TABLE public.outreach_send_queue       ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.outreach_brands(id) ON DELETE SET NULL;

-- Indici per il filtro del dispatcher (caselle del brand) e per la coda
CREATE INDEX IF NOT EXISTS idx_outreach_senders_brand
  ON public.outreach_sender_accounts (brand_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_brand
  ON public.outreach_send_queue (brand_id, status);

-- Trigger updated_at (riusa la funzione del modulo)
DROP TRIGGER IF EXISTS trg_outreach_brands_updated ON public.outreach_brands;
CREATE TRIGGER trg_outreach_brands_updated BEFORE UPDATE ON public.outreach_brands
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();

-- RLS: super_admin (console) + service_role (cron/edge)
ALTER TABLE public.outreach_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_brands_super ON public.outreach_brands;
CREATE POLICY outreach_brands_super ON public.outreach_brands
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS outreach_brands_service ON public.outreach_brands;
CREATE POLICY outreach_brands_service ON public.outreach_brands
  FOR ALL TO service_role USING (true) WITH CHECK (true);
