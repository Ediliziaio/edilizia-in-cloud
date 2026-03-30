-- ============================================================
-- 4. updated_at trigger for documenti_fiscali
-- ============================================================
DROP FUNCTION IF EXISTS public.trg_set_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
