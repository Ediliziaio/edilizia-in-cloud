-- ============================================================================
-- outreach_tag_counts — conteggi ESATTI per lista (tag) su marketing_contacts
-- ============================================================================
-- Prima il cockpit outreach raggruppava i tag client-side su un campione di
-- 1000 righe (PostgREST max-rows) → badge e conteggi lista erano il campione,
-- non il totale reale (~89k). Questa RPC aggrega server-side sull'intero
-- dataset, con la definizione di "contattabile" allineata al motore invii:
-- email presente AND optout_email = false.
--
-- Ritorna JSON:
--   { total, total_email, total_contactable, untagged, untagged_email,
--     lists: [{ tag, total, email, contactable }],   -- ord. desc per total
--     sources: [{ source, total }] }
-- ============================================================================

CREATE OR REPLACE FUNCTION public.outreach_tag_counts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_email    boolean;
  v_result      jsonb;
  v_lists       jsonb;
  v_sources     jsonb;
  v_total       bigint;
  v_total_email bigint;
  v_total_ctc   bigint;
  v_untagged    bigint;
  v_untagged_em bigint;
BEGIN
  -- Solo super_admin: il cockpit outreach è admin-piattaforma.
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  -- Totali contatti
  SELECT
    count(*),
    count(*) FILTER (WHERE email IS NOT NULL AND email <> ''),
    count(*) FILTER (WHERE email IS NOT NULL AND email <> '' AND COALESCE(optout_email, false) = false),
    count(*) FILTER (WHERE COALESCE(array_length(tags, 1), 0) = 0),
    count(*) FILTER (WHERE COALESCE(array_length(tags, 1), 0) = 0 AND email IS NOT NULL AND email <> '')
  INTO v_total, v_total_email, v_total_ctc, v_untagged, v_untagged_em
  FROM public.marketing_contacts
  WHERE company_id = p_company_id;

  -- Conteggi per tag (unnest sull'array tags, sfrutta idx_mc_tags_gin sul filtro company)
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total')::bigint DESC), '[]'::jsonb)
  INTO v_lists
  FROM (
    SELECT jsonb_build_object(
      'tag', tag,
      'total', count(*),
      'email', count(*) FILTER (WHERE email IS NOT NULL AND email <> ''),
      'contactable', count(*) FILTER (WHERE email IS NOT NULL AND email <> '' AND COALESCE(optout_email, false) = false)
    ) AS t
    FROM public.marketing_contacts mc, unnest(mc.tags) AS tag
    WHERE mc.company_id = p_company_id
    GROUP BY tag
  ) s;

  -- Breakdown per sorgente
  SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'total')::bigint DESC), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT jsonb_build_object(
      'source', COALESCE(NULLIF(trim(source), ''), '—'),
      'total', count(*)
    ) AS t
    FROM public.marketing_contacts
    WHERE company_id = p_company_id
    GROUP BY COALESCE(NULLIF(trim(source), ''), '—')
  ) s;

  v_result := jsonb_build_object(
    'total',             v_total,
    'total_email',       v_total_email,
    'total_contactable', v_total_ctc,
    'untagged',          v_untagged,
    'untagged_email',    v_untagged_em,
    'lists',             v_lists,
    'sources',           v_sources
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.outreach_tag_counts(uuid) TO authenticated;
