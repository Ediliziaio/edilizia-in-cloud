-- ════════════════════════════════════════════════════════════════
-- FIX: save_dashboard permette di svuotare description e icon
--
-- BUG: l'UPDATE usava COALESCE(p_description, v_dashboard.description)
-- quindi era impossibile cancellare description/icon esistenti:
-- passando NULL veniva mantenuto il vecchio valore, passando stringa
-- vuota veniva memorizzata '' (semanticamente sbagliato).
--
-- Fix: distingui fra "non specificato" e "svuotato esplicito".
--   - p_description IS NULL     -> non toccare (retro-compat)
--   - btrim(p_description) = '' -> pulisci a NULL
--   - altrimenti                -> scrivi il nuovo valore
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_dashboard(
  p_dashboard_id UUID,
  p_name         TEXT,
  p_description  TEXT,
  p_scope        TEXT,
  p_icon         TEXT,
  p_layout       JSONB,
  p_note         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_company_id  UUID;
  v_dashboard   public.dashboards%ROWTYPE;
  v_next_ver    INT;
  v_new_ver_id  UUID;
BEGIN
  -- Auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for user' USING ERRCODE = '42501';
  END IF;

  -- Validazione scope
  IF p_scope IS NULL OR NOT (
       p_scope = 'personal'
    OR p_scope = 'company'
    OR p_scope LIKE 'role:%'
  ) THEN
    RAISE EXCEPTION 'Invalid scope %', COALESCE(p_scope, 'NULL') USING ERRCODE = '22023';
  END IF;

  -- Validazione layout (throws se invalido)
  PERFORM public._dashboard_validate_layout(p_layout);

  -- ═══ CREATE ═══
  IF p_dashboard_id IS NULL THEN
    IF p_name IS NULL OR btrim(p_name) = '' THEN
      RAISE EXCEPTION 'Dashboard name is required on create' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dashboards (company_id, owner_id, name, description, scope, icon)
    VALUES (
      v_company_id,
      v_user_id,
      btrim(p_name),
      -- stringa vuota -> NULL, NULL resta NULL
      NULLIF(btrim(COALESCE(p_description, '')), ''),
      p_scope,
      NULLIF(btrim(COALESCE(p_icon, '')), '')
    )
    RETURNING * INTO v_dashboard;

    INSERT INTO public.dashboard_versions (
      dashboard_id, version, layout, is_current, created_by, note
    ) VALUES (
      v_dashboard.id, 1, p_layout, true, v_user_id, p_note
    ) RETURNING id INTO v_new_ver_id;

    RETURN jsonb_build_object(
      'dashboard_id', v_dashboard.id,
      'version_id',   v_new_ver_id,
      'version',      1,
      'is_current',   true,
      'created',      true
    );
  END IF;

  -- ═══ UPDATE (append nuova versione) ═══
  SELECT * INTO v_dashboard FROM public.dashboards WHERE id = p_dashboard_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard % not found', p_dashboard_id USING ERRCODE = '22023';
  END IF;

  -- Permessi: stessa company + (owner || company_admin)
  IF v_dashboard.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Cross-company dashboard access denied' USING ERRCODE = '42501';
  END IF;

  IF v_dashboard.owner_id <> v_user_id
     AND NOT public.has_role(v_user_id, 'company_admin'::app_role) THEN
    RAISE EXCEPTION 'Only owner or company_admin can modify this dashboard' USING ERRCODE = '42501';
  END IF;

  -- Aggiorna metadati.
  -- Convenzioni:
  --   p_name: NULL/'' -> non cambia (name non puo diventare NULL/vuoto)
  --   p_description / p_icon:
  --     NULL       -> lascia invariato (retro-compat con chiamate parziali)
  --     ''         -> svuota (imposta NULL)
  --     'xxx'      -> scrive nuovo valore (trimmed)
  UPDATE public.dashboards
  SET name        = COALESCE(NULLIF(btrim(p_name), ''), v_dashboard.name),
      description = CASE
        WHEN p_description IS NULL THEN v_dashboard.description
        WHEN btrim(p_description) = '' THEN NULL
        ELSE btrim(p_description)
      END,
      scope       = p_scope,
      icon        = CASE
        WHEN p_icon IS NULL THEN v_dashboard.icon
        WHEN btrim(p_icon) = '' THEN NULL
        ELSE btrim(p_icon)
      END
  WHERE id = p_dashboard_id;

  -- Calcola prossima versione
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_ver
  FROM public.dashboard_versions
  WHERE dashboard_id = p_dashboard_id;

  -- Sposta is_current sulla nuova versione
  UPDATE public.dashboard_versions
  SET is_current = false
  WHERE dashboard_id = p_dashboard_id AND is_current = true;

  INSERT INTO public.dashboard_versions (
    dashboard_id, version, layout, is_current, created_by, note
  ) VALUES (
    p_dashboard_id, v_next_ver, p_layout, true, v_user_id, p_note
  ) RETURNING id INTO v_new_ver_id;

  RETURN jsonb_build_object(
    'dashboard_id', p_dashboard_id,
    'version_id',   v_new_ver_id,
    'version',      v_next_ver,
    'is_current',   true,
    'created',      false
  );
END $$;

REVOKE ALL ON FUNCTION public.save_dashboard(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_dashboard(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
