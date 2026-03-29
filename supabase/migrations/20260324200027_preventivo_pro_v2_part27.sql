CREATE INDEX IF NOT EXISTS idx_qi_parent
  ON public.quote_items(parent_item_id) WHERE parent_item_id IS NOT NULL;
