-- Trigger updated_at for ai_campaigns_v2
DROP FUNCTION IF EXISTS public.trg_campaigns_v2_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION public.trg_campaigns_v2_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.aggiornato_il := now();
  RETURN NEW;
END;
$$;
