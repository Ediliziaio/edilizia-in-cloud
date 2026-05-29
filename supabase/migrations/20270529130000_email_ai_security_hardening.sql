-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI · Security hardening (QA loop — advisor Supabase)
-- ────────────────────────────────────────────────────────────────────────────
-- 1. FIX CRITICO: v_email_inbox_classified era SECURITY DEFINER VIEW (default) →
--    bypassava la RLS di email_inbox = rischio leak cross-azienda. Ora INVOKER.
-- 2. Trigger functions: SET search_path = public (anti search-path hijack).
-- 3. Revoca EXECUTE da anon sulle RPC sensibili (restano authenticated+service_role).
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.v_email_inbox_classified;
CREATE VIEW public.v_email_inbox_classified
WITH (security_invoker = true) AS
SELECT
  e.*,
  COALESCE(e.categoria::text, e.ai_category, 'altro') AS categoria_ui,
  CASE e.entita_tipo
    WHEN 'fornitore' THEN (SELECT s.name FROM public.suppliers s WHERE s.id = e.entita_id AND s.company_id = e.company_id)
    WHEN 'operaio'   THEN (SELECT trim(concat_ws(' ', emp.first_name, emp.last_name)) FROM public.employees emp WHERE emp.id = e.entita_id AND emp.company_id = e.company_id)
    ELSE NULL
  END AS entita_nome
FROM public.email_inbox e;
GRANT SELECT ON public.v_email_inbox_classified TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_mittenti_noti_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.tg_email_regole_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_learning_dashboard(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_semantic_search(vector, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) FROM anon;
