-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-SA-INTEL-01: helper service-role-only per il worker (espongono msg grezzi → SOLO worker)
CREATE OR REPLACE FUNCTION public.sa_companies_with_recent_silvio_msgs(p_hours int DEFAULT 24, p_limit int DEFAULT 30)
RETURNS TABLE(company_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT m.company_id
  FROM public.internal_chat_messages m
  JOIN public.internal_chat_channels c ON c.id = m.channel_id
  WHERE c.is_system = true AND c.is_dm = true
    AND '00000000-0000-0000-0000-000000000002' = ANY(c.dm_user_ids)
    AND m.sender_id <> '00000000-0000-0000-0000-000000000002'
    AND coalesce(m.message_type,'text') = 'text'
    AND m.created_at > now() - make_interval(hours => GREATEST(coalesce(p_hours,24),1))
  LIMIT GREATEST(coalesce(p_limit,30),1);
$$;

CREATE OR REPLACE FUNCTION public.sa_recent_silvio_user_messages(p_company_id uuid, p_hours int DEFAULT 24, p_limit int DEFAULT 60)
RETURNS TABLE(content text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT m.content
  FROM public.internal_chat_messages m
  JOIN public.internal_chat_channels c ON c.id = m.channel_id
  WHERE m.company_id = p_company_id
    AND c.is_system = true AND c.is_dm = true
    AND '00000000-0000-0000-0000-000000000002' = ANY(c.dm_user_ids)
    AND m.sender_id <> '00000000-0000-0000-0000-000000000002'
    AND coalesce(m.message_type,'text') = 'text' AND m.content IS NOT NULL AND length(trim(m.content)) > 0
    AND m.created_at > now() - make_interval(hours => GREATEST(coalesce(p_hours,24),1))
  ORDER BY m.created_at DESC
  LIMIT GREATEST(coalesce(p_limit,60),1);
$$;

-- Espongono contenuto grezzo cross-tenant → SOLO service_role (il worker). Mai authenticated/anon.
REVOKE EXECUTE ON FUNCTION public.sa_companies_with_recent_silvio_msgs(int,int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sa_recent_silvio_user_messages(uuid,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sa_companies_with_recent_silvio_msgs(int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.sa_recent_silvio_user_messages(uuid,int,int) TO service_role;
