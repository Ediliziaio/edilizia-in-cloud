-- Storico dei passaggi di stadio delle opportunità marketing.
-- Serve alla Dashboard commerciale per la VELOCITY tra gli stadi (tempo medio
-- che un'opportunità passa in ciascuno stadio prima di avanzare): senza questo
-- log avevamo solo lo stadio CORRENTE + stage_changed_at, non la storia.
--
-- Un trigger su marketing_opportunities registra una riga ad ogni INSERT e ad
-- ogni cambio di stage_id. Idempotente.

CREATE TABLE IF NOT EXISTS public.marketing_opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.marketing_opportunities(id) ON DELETE CASCADE,
  stage_id uuid,
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mosh_opp ON public.marketing_opportunity_stage_history(opportunity_id, entered_at);
CREATE INDEX IF NOT EXISTS idx_mosh_company ON public.marketing_opportunity_stage_history(company_id, stage_id, entered_at);

ALTER TABLE public.marketing_opportunity_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mosh super admin all" ON public.marketing_opportunity_stage_history;
CREATE POLICY "mosh super admin all" ON public.marketing_opportunity_stage_history
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "mosh company members" ON public.marketing_opportunity_stage_history;
CREATE POLICY "mosh company members" ON public.marketing_opportunity_stage_history
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_marketing_opportunity_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.marketing_opportunity_stage_history (company_id, opportunity_id, stage_id, entered_at)
    VALUES (NEW.company_id, NEW.id, NEW.stage_id, COALESCE(NEW.created_at, now()));
  ELSIF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.marketing_opportunity_stage_history (company_id, opportunity_id, stage_id, entered_at)
    VALUES (NEW.company_id, NEW.id, NEW.stage_id, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_mkt_opp_stage ON public.marketing_opportunities;
CREATE TRIGGER trg_log_mkt_opp_stage
  AFTER INSERT OR UPDATE OF stage_id ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_marketing_opportunity_stage();

-- Backfill: una riga iniziale per le opportunità già esistenti (stadio attuale,
-- entered_at = stage_changed_at o created_at). Così la velocity ha un punto di
-- partenza anche per lo storico pregresso.
INSERT INTO public.marketing_opportunity_stage_history (company_id, opportunity_id, stage_id, entered_at)
SELECT o.company_id, o.id, o.stage_id, COALESCE(o.stage_changed_at, o.created_at, now())
FROM public.marketing_opportunities o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.marketing_opportunity_stage_history h WHERE h.opportunity_id = o.id
  );
