CREATE OR REPLACE FUNCTION public.admin_apply_feature_rollout(
  p_feature_key text,
  p_enable uuid[],
  p_remove jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_enabled integer;
  v_removed integer;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.has_role(auth.uid(), 'super_admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Rollout riservato agli amministratori' USING ERRCODE = '42501';
  END IF;

  IF p_enable IS NULL OR jsonb_typeof(p_remove) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Anteprima della distribuzione non valida' USING ERRCODE = '22023';
  END IF;

  -- Serializza le distribuzioni per la stessa funzionalità.
  PERFORM 1 FROM public.platform_feature_flags WHERE key = p_feature_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funzionalità non trovata' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_remove) AS preview(company_id uuid)
    WHERE preview.company_id = ANY (p_enable)
  ) THEN
    RAISE EXCEPTION 'Anteprima della distribuzione non valida' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.company_feature_overrides AS existing (company_id, feature_key, is_enabled, access_level)
  SELECT company.id, p_feature_key, true, 'enabled'::public.feature_access_level
  FROM public.companies AS company
  WHERE company.id = ANY (p_enable)
  ORDER BY company.id
  ON CONFLICT (company_id, feature_key) DO UPDATE
  SET is_enabled = true,
      access_level = 'enabled',
      expires_at = CASE WHEN existing.expires_at <= now() THEN NULL ELSE existing.expires_at END,
      updated_at = now();
  GET DIAGNOSTICS v_enabled = ROW_COUNT;

  -- Rimuove solo le eccezioni effettivamente mostrate nell'anteprima.
  DELETE FROM public.company_feature_overrides AS existing
  USING jsonb_to_recordset(p_remove) AS preview(
    id uuid, company_id uuid, is_enabled boolean, access_level public.feature_access_level,
    expires_at timestamptz, limit_value numeric, price_override numeric, updated_at timestamptz
  )
  WHERE existing.feature_key = p_feature_key
    AND existing.id = preview.id
    AND existing.company_id = preview.company_id
    AND existing.is_enabled IS NOT DISTINCT FROM preview.is_enabled
    AND existing.access_level IS NOT DISTINCT FROM preview.access_level
    AND existing.expires_at IS NOT DISTINCT FROM preview.expires_at
    AND existing.limit_value IS NOT DISTINCT FROM preview.limit_value
    AND existing.price_override IS NOT DISTINCT FROM preview.price_override
    AND existing.updated_at IS NOT DISTINCT FROM preview.updated_at;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_enabled <> cardinality(p_enable) OR v_removed <> jsonb_array_length(p_remove) THEN
    RAISE EXCEPTION 'Anteprima della distribuzione da aggiornare' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_feature_rollout(text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_feature_rollout(text, uuid[], jsonb) TO authenticated;
