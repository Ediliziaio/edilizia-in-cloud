-- Unique constraint per company
ALTER TABLE public.marketing_tags DROP CONSTRAINT IF EXISTS marketing_tags_company_name_unique,
  ADD CONSTRAINT marketing_tags_company_name_unique UNIQUE (company_id, name);
