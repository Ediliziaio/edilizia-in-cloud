-- Tracking outreach atomico: incrementa i contatori open/click in UN solo UPDATE
-- (elimina il read-then-write del tracker lead-scraper-track che perdeva eventi
-- concorrenti: due pixel/click simultanei si sovrascrivevano il contatore).
-- Chiamata SOLO dal service_role (edge fn lead-scraper-track).
-- Applicata in prod via MCP il 2026-06-30.
CREATE OR REPLACE FUNCTION public.lead_scraper_track_bump(p_id uuid, p_kind text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lead_scraper_outreach SET
    open_count  = CASE WHEN p_kind = 'open'  THEN coalesce(open_count, 0) + 1 ELSE open_count END,
    click_count = CASE WHEN p_kind = 'click' THEN coalesce(click_count, 0) + 1 ELSE click_count END,
    opened_at   = coalesce(opened_at, now()),
    clicked_at  = CASE WHEN p_kind = 'click' THEN coalesce(clicked_at, now()) ELSE clicked_at END,
    status      = CASE
                    WHEN p_kind = 'click' AND status IS DISTINCT FROM 'replied' THEN 'clicked'
                    WHEN p_kind = 'open'  AND status = 'sent' THEN 'opened'
                    ELSE status
                  END
  WHERE id = p_id;
$$;

REVOKE EXECUTE ON FUNCTION public.lead_scraper_track_bump(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lead_scraper_track_bump(uuid, text) TO service_role;
