-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.silvio_ads_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid,
  platform text NOT NULL DEFAULT 'meta',
  obiettivo text,
  budget_giornaliero_eur numeric,
  durata_giorni integer,
  area_geografica text,
  target jsonb DEFAULT '{}'::jsonb,
  copy_varianti jsonb DEFAULT '[]'::jsonb,
  creativita_concept text,
  stato text NOT NULL DEFAULT 'bozza',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS silvio_ads_campaigns_company_idx
  ON public.silvio_ads_campaigns (company_id, created_at DESC);

ALTER TABLE public.silvio_ads_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silvio_ads_campaigns_read ON public.silvio_ads_campaigns;
CREATE POLICY silvio_ads_campaigns_read ON public.silvio_ads_campaigns
  FOR SELECT TO authenticated
  USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

GRANT SELECT ON public.silvio_ads_campaigns TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.silvio_crea_bozza_campagna_ads(
  p_company_id uuid, p_platform text, p_obiettivo text, p_budget_giornaliero numeric,
  p_durata_giorni integer, p_area text, p_target jsonb, p_copy jsonb, p_concept text, p_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id mancante'; END IF;
  INSERT INTO public.silvio_ads_campaigns(
    company_id, created_by, platform, obiettivo, budget_giornaliero_eur,
    durata_giorni, area_geografica, target, copy_varianti, creativita_concept, note
  ) VALUES (
    p_company_id, auth.uid(),
    COALESCE(NULLIF(lower(p_platform), ''), 'meta'),
    p_obiettivo, p_budget_giornaliero, p_durata_giorni, p_area,
    COALESCE(p_target, '{}'::jsonb), COALESCE(p_copy, '[]'::jsonb), p_concept, p_note
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.silvio_lista_bozze_campagne_ads(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, platform, obiettivo, budget_giornaliero_eur, durata_giorni,
           area_geografica, stato, created_at
      FROM public.silvio_ads_campaigns
     WHERE company_id = p_company_id AND stato <> 'archiviata'
     ORDER BY created_at DESC
     LIMIT 25
  ) x;
$$;

REVOKE ALL ON FUNCTION public.silvio_crea_bozza_campagna_ads(uuid, text, text, numeric, integer, text, jsonb, jsonb, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_lista_bozze_campagne_ads(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_crea_bozza_campagna_ads(uuid, text, text, numeric, integer, text, jsonb, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_lista_bozze_campagne_ads(uuid) TO authenticated, service_role;
