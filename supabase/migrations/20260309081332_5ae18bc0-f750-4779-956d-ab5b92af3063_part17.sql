-- 6. bank_categorization_rules
CREATE TABLE IF NOT EXISTS public.bank_categorization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0,
  match_field text NOT NULL DEFAULT 'description',
  match_value text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains',
  category text NOT NULL,
  category_icon text,
  auto_apply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
