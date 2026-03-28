-- Unique constraint to prevent duplicate tags per company
CREATE UNIQUE INDEX company_tags_company_tag_unique ON public.company_tags (company_id, tag);
