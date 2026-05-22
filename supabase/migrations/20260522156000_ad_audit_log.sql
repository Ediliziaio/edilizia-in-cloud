-- ============================================================================
-- AD AUDIT LOG — chi ha fatto cosa quando nel modulo Pubblicità
-- ============================================================================
-- Tracking di ogni azione rilevante: create / update / publish / pause /
-- archive / approve / reject / auto-pause / sync.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ad_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  /** Tipo entità: meta_campaign | meta_ad_set | meta_ad | google_campaign | spend_guard | rule */
  entity_type TEXT NOT NULL,
  /** UUID dell'entità modificata */
  entity_id UUID,
  /** Nome leggibile (per UI) — denormalizzato perché entità potrebbe essere eliminata */
  entity_name TEXT,

  /** Azione: created | updated | published | paused | activated | archived | approved | rejected | auto_paused | synced | deleted | exported */
  action TEXT NOT NULL,

  /** Chi: user_id se utente, NULL se sistema */
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT, -- denormalizzato (es. "Mario Rossi")
  /** Se NULL e performed_by NULL → azione automatica (cron, spend guard, automation rule) */
  is_automatic BOOLEAN NOT NULL DEFAULT false,

  /** Cambiamenti: dizionario {field: {old, new}} */
  changes JSONB DEFAULT '{}'::jsonb,

  /** Note libere (es. motivazione rifiuto, "spend_guard: daily_cap exceeded") */
  notes TEXT,

  /** IP e user agent per audit completo */
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_audit_log_company ON public.ad_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_audit_log_entity ON public.ad_audit_log(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_audit_log_action ON public.ad_audit_log(company_id, action);
CREATE INDEX IF NOT EXISTS idx_ad_audit_log_user ON public.ad_audit_log(performed_by, created_at DESC);

-- ============================================================================
-- RLS — solo SELECT, no INSERT diretto da utenti
-- ============================================================================
ALTER TABLE public.ad_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company audit log" ON public.ad_audit_log;
CREATE POLICY "Users can view own company audit log"
  ON public.ad_audit_log FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Solo service_role può inserire (via SECURITY DEFINER da edge fn o trigger)
-- Nessuna policy INSERT/UPDATE/DELETE per authenticated → bloccati di default

COMMENT ON TABLE public.ad_audit_log IS 'Audit trail completo modulo Pubblicità. Chi/cosa/quando per ogni azione.';

-- ============================================================================
-- TRIGGER — auto-log su meta_campaigns INSERT/UPDATE rilevanti
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_meta_campaign_action()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_user_name TEXT;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := CASE NEW.status
        WHEN 'published' THEN 'published'
        WHEN 'active' THEN 'activated'
        WHEN 'paused' THEN 'paused'
        WHEN 'archived' THEN 'archived'
        WHEN 'review' THEN 'submitted_for_approval'
        WHEN 'error' THEN 'errored'
        ELSE 'status_changed'
      END;
      v_changes := jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status));
    ELSE
      -- Solo modifica campi non-status (es. budget, name)
      RETURN NEW; -- skip log per piccole edit di builder_state
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Lookup user name
  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = auth.uid() LIMIT 1;

  INSERT INTO public.ad_audit_log (
    company_id, entity_type, entity_id, entity_name,
    action, performed_by, performed_by_name, is_automatic, changes
  )
  VALUES (
    NEW.company_id, 'meta_campaign', NEW.id, NEW.name,
    v_action, auth.uid(), v_user_name,
    auth.uid() IS NULL, v_changes
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_meta_campaigns_audit ON public.meta_campaigns;
CREATE TRIGGER trg_meta_campaigns_audit
  AFTER INSERT OR UPDATE ON public.meta_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.log_meta_campaign_action();
