-- 2. ALTER ai_knowledge_base_v2 - add missing columns
ALTER TABLE public.ai_knowledge_base_v2
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.ai_kb_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS parole_chiave text[],
  ADD COLUMN IF NOT EXISTS utilizzi integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
