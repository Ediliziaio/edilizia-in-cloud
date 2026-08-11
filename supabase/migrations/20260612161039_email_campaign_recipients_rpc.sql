-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.get_email_campaign_recipients(
  p_company_id uuid,
  p_campaign_id uuid,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  log_id uuid,
  email text,
  full_name text,
  status text,
  ab_variant text,
  event_timestamp timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  bounce_type text,
  unsubscribed_at timestamptz,
  error_message text,
  total_rows bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    el.id AS log_id,
    COALESCE(mc.email, '(contatto eliminato)') AS email,
    NULLIF(trim(concat_ws(' ', mc.first_name, mc.last_name)), '') AS full_name,
    el.status,
    el.ab_variant,
    el.event_timestamp,
    el.delivered_at,
    el.opened_at,
    el.clicked_at,
    el.bounced_at,
    el.bounce_type,
    el.unsubscribed_at,
    el.error_message,
    count(*) OVER() AS total_rows
  FROM public.email_logs el
  LEFT JOIN public.marketing_contacts mc ON mc.id = el.contact_id
  WHERE el.company_id = p_company_id
    AND el.campaign_id = p_campaign_id
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR p_company_id IN (
        SELECT pr.company_id FROM public.profiles pr WHERE pr.id = auth.uid()
      )
    )
    AND (
      p_status IS NULL
      OR (p_status = 'opened'  AND el.status IN ('opened','clicked'))
      OR (p_status = 'delivered' AND el.status IN ('delivered','opened','clicked'))
      OR el.status = p_status
    )
    AND (
      p_search IS NULL OR p_search = ''
      OR mc.email ILIKE '%' || p_search || '%'
      OR concat_ws(' ', mc.first_name, mc.last_name) ILIKE '%' || p_search || '%'
    )
  ORDER BY el.event_timestamp DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 500)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.get_email_campaign_recipients(uuid, uuid, text, text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_email_campaign_recipients(uuid, uuid, text, text, int, int) TO authenticated;
