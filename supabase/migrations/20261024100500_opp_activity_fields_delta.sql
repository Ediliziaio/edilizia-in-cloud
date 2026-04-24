-- Sales OS — Sprint 1.2 (delta): applica campi activity tracking se mancanti.
-- Necessario perché migration 20261024100000 era stata marcata applied ma
-- con contenuto errato durante un rename. Questa è idempotente.

BEGIN;

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN DEFAULT FALSE;

UPDATE public.marketing_opportunities
SET last_activity_at = updated_at
WHERE last_activity_at IS NULL;

UPDATE public.marketing_opportunities
SET stage_changed_at = updated_at
WHERE stage_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_opportunity_on_contact_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.marketing_opportunities
    SET last_activity_at = NEW.created_at
    WHERE contact_id = NEW.contact_id
      AND status = 'open'
      AND (last_activity_at IS NULL OR last_activity_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opp_contact_activity
  ON public.marketing_contact_activities;
CREATE TRIGGER trg_opp_contact_activity
AFTER INSERT ON public.marketing_contact_activities
FOR EACH ROW EXECUTE FUNCTION public.touch_opportunity_on_contact_activity();

CREATE OR REPLACE FUNCTION public.touch_opportunity_stage_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_changed_at := NOW();
  END IF;
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.value IS DISTINCT FROM OLD.value
     OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.next_action IS DISTINCT FROM OLD.next_action THEN
    NEW.last_activity_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opp_stage_changed
  ON public.marketing_opportunities;
CREATE TRIGGER trg_opp_stage_changed
BEFORE UPDATE ON public.marketing_opportunities
FOR EACH ROW EXECUTE FUNCTION public.touch_opportunity_stage_changed();

CREATE INDEX IF NOT EXISTS idx_opp_last_activity_at
  ON public.marketing_opportunities(company_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_opp_stage_changed_at
  ON public.marketing_opportunities(stage_id, stage_changed_at DESC);

COMMIT;
