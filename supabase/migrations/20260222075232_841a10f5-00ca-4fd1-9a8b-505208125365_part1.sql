-- 2. marketing_custom_fields
CREATE TABLE IF NOT EXISTS public.marketing_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options text[] DEFAULT '{}',
  section text NOT NULL DEFAULT 'general_info',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
