-- Sales OS — Sprint 1.2: campi last_activity_at + stage_changed_at
-- + is_decision_maker su marketing_contacts.
--
-- Fix i TODO in src/lib/dealHealthScore.ts dove usavano updated_at
-- come proxy per last_activity_at → dati inaccurati per DealHealth.

BEGIN;

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS is_decision_maker BOOLEAN DEFAULT FALSE;

-- Backfill: last_activity_at = updated_at iniziale.
-- (marketing_contact_activities non ha opportunity_id direttamente,
-- quindi usiamo updated_at come fallback per il backfill.)
UPDATE public.marketing_opportunities
SET last_activity_at = updated_at
WHERE last_activity_at IS NULL;

-- Backfill stage_changed_at = updated_at (approssimazione)
UPDATE public.marketing_opportunities
SET stage_changed_at = updated_at
WHERE stage_changed_at IS NULL;

-- Trigger: aggiorna last_activity_at del contatto collegato quando arriva
-- una nuova activity. Propaga a tutte le opportunità aperte di quel contatto.
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

-- Trigger: aggiorna stage_changed_at quando cambia stage_id.
CREATE OR REPLACE FUNCTION public.touch_opportunity_stage_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_changed_at := NOW();
  END IF;
  -- Aggiorna anche last_activity_at se qualunque campo business cambia
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

COMMENT ON COLUMN public.marketing_opportunities.last_activity_at IS
  'Ultima attività registrata (activity inserita, campo business modificato). Usato per DealHealth e stalled opportunities.';
COMMENT ON COLUMN public.marketing_opportunities.stage_changed_at IS
  'Timestamp ultimo cambio di stage. Usato per calcolare days_in_stage.';
COMMENT ON COLUMN public.marketing_contacts.is_decision_maker IS
  'Flag manuale: true se il contatto è il decisore finale. Migliora accuratezza DealHealth.';

COMMIT;
