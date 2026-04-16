-- Promotes flo.andriciuc@gmail.com (current auth user) to super_admin and
-- grants full platform permissions. Idempotent: safe to re-run.
--
-- Context: la migrazione precedente 20260310084317 inseriva permissions per
-- un user_id storico (119fa4f5-...); se l'account auth è stato ricreato o
-- l'id è cambiato, le permissions restano orfane e l'utente non vede il
-- pannello admin né può impersonare le aziende.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = 'flo.andriciuc@gmail.com'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'flo.andriciuc@gmail.com non trovato in auth.users; nessuna azione.';
    RETURN;
  END IF;

  -- Assicura il ruolo super_admin in user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Assicura permessi pieni per la piattaforma
  INSERT INTO public.super_admin_permissions (
    user_id, can_manage_companies, can_manage_plans, can_manage_tickets,
    can_manage_referrals, can_manage_admins, can_view_platform_stats,
    allowed_company_ids
  )
  VALUES (
    v_user_id, true, true, true, true, true, true, NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    can_manage_companies    = EXCLUDED.can_manage_companies,
    can_manage_plans        = EXCLUDED.can_manage_plans,
    can_manage_tickets      = EXCLUDED.can_manage_tickets,
    can_manage_referrals    = EXCLUDED.can_manage_referrals,
    can_manage_admins       = EXCLUDED.can_manage_admins,
    can_view_platform_stats = EXCLUDED.can_view_platform_stats,
    allowed_company_ids     = EXCLUDED.allowed_company_ids,
    updated_at              = now();
END
$$;
