-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO SUPERADMIN — Canale chat dedicato
-- -----------------------------------------------------------------------
-- Replica il pattern del canale "silvio-ai" lato cliente, ma per super_admin
-- nella platform_admin_company. Sender ID separato per distinguere i messaggi
-- di Silvio cliente vs Silvio Superadmin.
--
-- Canale: name='silvio-admin', is_dm=true, scope=platform_admin_company
-- Sender: SILVIO_ADMIN_SENDER_ID = '00000000-0000-0000-0000-000000000003'
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) RPC: ensure_user_silvio_admin_channel
--    Crea/ritorna il canale DM 1:1 tra super_admin e Silvio Admin.
--    Solo super_admin possono chiamarla — altri utenti → exception.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_user_silvio_admin_channel(p_user_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID := COALESCE(p_user_id, auth.uid());
  v_platform_company  UUID;
  v_channel_id        UUID;
  v_silvio_admin_id   UUID := '00000000-0000-0000-0000-000000000003';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id obbligatorio' USING ERRCODE = '42501';
  END IF;

  -- Solo super_admin possono avere il canale Silvio Admin
  IF NOT public.is_silvio_superadmin(v_user_id) THEN
    RAISE EXCEPTION 'Solo super_admin possono accedere a Silvio Superadmin' USING ERRCODE = '42501';
  END IF;

  -- La platform_admin_company è il container delle conversazioni team admin
  SELECT id INTO v_platform_company
  FROM public.companies
  WHERE is_platform_admin_company = true
  LIMIT 1;

  IF v_platform_company IS NULL THEN
    RAISE EXCEPTION 'Nessuna platform_admin_company configurata' USING ERRCODE = '42501';
  END IF;

  -- Cerca canale esistente per questo super_admin
  SELECT c.id INTO v_channel_id
  FROM public.internal_chat_channels c
  WHERE c.company_id = v_platform_company
    AND c.name = 'silvio-admin'
    AND c.is_dm = true
    AND c.dm_user_ids @> ARRAY[v_user_id, v_silvio_admin_id]
  LIMIT 1;

  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  -- Crea il canale DM personale
  INSERT INTO public.internal_chat_channels (
    company_id, name, description, type, is_system, is_dm, channel_emoji,
    dm_user_ids, created_by
  ) VALUES (
    v_platform_company, 'silvio-admin',
    'Silvio Superadmin — il tuo co-founder AI. Revenue, lead, churn, ticket, prodotto, operations cross-tenant.',
    'dm', true, true, '🚀',
    ARRAY[v_user_id, v_silvio_admin_id], v_user_id
  )
  RETURNING id INTO v_channel_id;

  -- Aggiungi il super_admin come membro (company_id obbligatorio dalla schema)
  INSERT INTO public.internal_chat_members (channel_id, user_id, company_id, role, last_read_at)
  VALUES (v_channel_id, v_user_id, v_platform_company, 'admin', now())
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  -- Welcome message dal sentinel Silvio Admin
  INSERT INTO public.internal_chat_messages (
    channel_id, sender_id, company_id, content, message_type
  ) VALUES (
    v_channel_id, v_silvio_admin_id, v_platform_company,
    E'Ciao Florin 👋\n\nSono **Silvio Superadmin**, il tuo co-founder AI. A differenza di Silvio cliente, io ho visione cross-tenant: posso aiutarti su revenue, lead, churn, ticket e prodotto.\n\nProva a chiedermi:\n- _Quanto è il MRR?_\n- _Chi è a rischio churn?_\n- _Riassumi i ticket aperti_\n- _Lead caldi non contattati_',
    'text'
  );

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_silvio_admin_channel(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_silvio_admin_channel(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_user_silvio_admin_channel IS
  'Crea/ritorna canale DM 1:1 tra super_admin e Silvio Admin nella platform_admin_company. Idempotente. Solo super_admin.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Bootstrap: crea canale per ogni super_admin esistente
--    Solo se la platform_admin_company è configurata
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user_id UUID;
  v_platform_company UUID;
  v_count INT := 0;
BEGIN
  SELECT id INTO v_platform_company
  FROM public.companies
  WHERE is_platform_admin_company = true
  LIMIT 1;

  IF v_platform_company IS NULL THEN
    RAISE NOTICE 'Skip bootstrap: nessuna platform_admin_company configurata';
    RETURN;
  END IF;

  FOR v_user_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'super_admin'
  LOOP
    BEGIN
      PERFORM public.ensure_user_silvio_admin_channel(v_user_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skip canale silvio-admin per user %: %', v_user_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Bootstrap silvio-admin: % canali creati', v_count;
END;
$$;

COMMIT;
