-- Blocco di pubblicazione lato servizio e approvazioni legate al contenuto.
SET LOCAL lock_timeout = '3s';
CREATE TABLE IF NOT EXISTS public.meta_campaign_publication_locks (
  campaign_id uuid PRIMARY KEY REFERENCES public.meta_campaigns(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_campaign_publication_locks_company_idx ON public.meta_campaign_publication_locks(company_id);
ALTER TABLE public.meta_campaign_publication_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_campaign_publication_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.meta_campaign_publication_locks TO service_role;
COMMENT ON TABLE public.meta_campaign_publication_locks IS
  'Un claim per bozza. In caso di interruzione non scade: verificare gli oggetti su Meta prima del recupero.';

CREATE OR REPLACE FUNCTION public.guard_meta_campaign_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meta_campaign_publication_locks WHERE campaign_id = OLD.id)
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Pubblicazione in corso: attendi l’esito prima di modificare o eliminare la campagna.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.builder_state IS DISTINCT FROM OLD.builder_state
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.daily_budget_cents IS DISTINCT FROM OLD.daily_budget_cents
     OR NEW.budget_mode IS DISTINCT FROM OLD.budget_mode
     OR (OLD.ad_account_id IS NOT NULL AND NEW.ad_account_id IS DISTINCT FROM OLD.ad_account_id) THEN
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    IF OLD.approved_at IS NOT NULL AND OLD.meta_campaign_id IS NULL THEN NEW.status := 'draft'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_meta_campaign_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_meta_campaign_publication ON public.meta_campaigns;
CREATE TRIGGER trg_guard_meta_campaign_publication BEFORE UPDATE OR DELETE ON public.meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_meta_campaign_publication();
