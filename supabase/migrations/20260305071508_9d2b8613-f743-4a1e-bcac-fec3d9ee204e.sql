CREATE TABLE IF NOT EXISTS public.warehouse_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6b7280',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);
