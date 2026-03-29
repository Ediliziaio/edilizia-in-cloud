-- 2. Opportunity loss reasons table (company-specific)
CREATE TABLE IF NOT EXISTS public.opportunity_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
