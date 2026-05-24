BEGIN;

-- Centralizza i controlli usati dalle RLS per evitare policy duplicate e query
-- client-side troppo larghe su DM/gruppi privati.
CREATE OR REPLACE FUNCTION public.internal_chat_company_allowed(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_company_id = public.get_my_company_id()
    OR (
      public.is_silvio_superadmin()
      AND p_company_id = public.get_platform_admin_company_id()
    );
$$;

CREATE OR REPLACE FUNCTION public.internal_chat_membership_allowed(
  p_channel_id UUID,
  p_company_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND public.internal_chat_company_allowed(p_company_id)
    AND EXISTS (
      SELECT 1
      FROM public.internal_chat_members m
      WHERE m.channel_id = p_channel_id
        AND m.company_id = p_company_id
        AND m.user_id = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.internal_chat_can_manage_members(
  p_channel_id UUID,
  p_company_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND public.internal_chat_company_allowed(p_company_id)
    AND (
      EXISTS (
        SELECT 1
        FROM public.internal_chat_channels c
        WHERE c.id = p_channel_id
          AND c.company_id = p_company_id
          AND c.created_by = p_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.internal_chat_members m
        WHERE m.channel_id = p_channel_id
          AND m.company_id = p_company_id
          AND m.user_id = p_user_id
          AND m.role IN ('admin', 'owner')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.internal_chat_company_allowed(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_chat_membership_allowed(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_chat_can_manage_members(UUID, UUID, UUID) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_internal_chat_members_company_user_channel
  ON public.internal_chat_members(company_id, user_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_internal_chat_messages_company_channel_created
  ON public.internal_chat_messages(company_id, channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_chat_channels_dm_user_ids
  ON public.internal_chat_channels USING GIN (dm_user_ids);

-- Canali: visibili/modificabili solo ai membri. La creazione resta consentita
-- all'utente autenticato della company, poi le membership vengono inserite subito.
DROP POLICY IF EXISTS "icc_sel" ON public.internal_chat_channels;
CREATE POLICY "icc_sel" ON public.internal_chat_channels
  FOR SELECT TO authenticated
  USING (
    public.internal_chat_membership_allowed(id, company_id)
    OR (
      public.internal_chat_company_allowed(company_id)
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "icc_ins" ON public.internal_chat_channels;
CREATE POLICY "icc_ins" ON public.internal_chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.internal_chat_company_allowed(company_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "icc_upd" ON public.internal_chat_channels;
CREATE POLICY "icc_upd" ON public.internal_chat_channels
  FOR UPDATE TO authenticated
  USING (
    public.internal_chat_membership_allowed(id, company_id)
  )
  WITH CHECK (
    public.internal_chat_membership_allowed(id, company_id)
  );

DROP POLICY IF EXISTS "icc_del" ON public.internal_chat_channels;
CREATE POLICY "icc_del" ON public.internal_chat_channels
  FOR DELETE TO authenticated
  USING (
    public.internal_chat_company_allowed(company_id)
    AND created_by = auth.uid()
  );

-- Membri: un membro vede la lista membri dei propri canali. La creazione membri
-- è consentita solo al creator/admin del canale: l'auto-join su gruppi/DM privati
-- non deve essere possibile via API.
DROP POLICY IF EXISTS "icm_sel" ON public.internal_chat_members;
CREATE POLICY "icm_sel" ON public.internal_chat_members
  FOR SELECT TO authenticated
  USING (
    public.internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icm_ins" ON public.internal_chat_members;
CREATE POLICY "icm_ins" ON public.internal_chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.internal_chat_company_allowed(company_id)
    AND public.internal_chat_can_manage_members(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icm_upd" ON public.internal_chat_members;
CREATE POLICY "icm_upd" ON public.internal_chat_members
  FOR UPDATE TO authenticated
  USING (
    public.internal_chat_company_allowed(company_id)
    AND (
      user_id = auth.uid()
      OR public.internal_chat_can_manage_members(channel_id, company_id)
    )
  )
  WITH CHECK (
    public.internal_chat_company_allowed(company_id)
    AND (
      user_id = auth.uid()
      OR public.internal_chat_can_manage_members(channel_id, company_id)
    )
  );

DROP POLICY IF EXISTS "icm_del" ON public.internal_chat_members;
CREATE POLICY "icm_del" ON public.internal_chat_members
  FOR DELETE TO authenticated
  USING (
    public.internal_chat_company_allowed(company_id)
    AND (
      user_id = auth.uid()
      OR public.internal_chat_can_manage_members(channel_id, company_id)
    )
  );

-- Messaggi: DM e gruppi sono realmente privati anche via API, non solo filtrati
-- dal frontend.
DROP POLICY IF EXISTS "icmsg_sel" ON public.internal_chat_messages;
CREATE POLICY "icmsg_sel" ON public.internal_chat_messages
  FOR SELECT TO authenticated
  USING (
    public.internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icmsg_ins" ON public.internal_chat_messages;
CREATE POLICY "icmsg_ins" ON public.internal_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icmsg_upd" ON public.internal_chat_messages;
CREATE POLICY "icmsg_upd" ON public.internal_chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.internal_chat_membership_allowed(channel_id, company_id)
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.internal_chat_membership_allowed(channel_id, company_id)
  );

DROP POLICY IF EXISTS "icmsg_del" ON public.internal_chat_messages;
CREATE POLICY "icmsg_del" ON public.internal_chat_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.internal_chat_membership_allowed(channel_id, company_id)
  );

CREATE OR REPLACE FUNCTION public.get_internal_chat_sidebar_state(
  p_company_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  channel_id UUID,
  last_message JSONB,
  unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped_memberships AS (
    SELECT m.channel_id, m.last_read_at
    FROM public.internal_chat_members m
    WHERE m.company_id = p_company_id
      AND m.user_id = p_user_id
      AND p_user_id = auth.uid()
      AND public.internal_chat_company_allowed(p_company_id)
  )
  SELECT
    sm.channel_id,
    CASE WHEN lm.id IS NULL THEN NULL ELSE to_jsonb(lm) END AS last_message,
    COALESCE(unread.unread_count, 0)::INTEGER AS unread_count
  FROM scoped_memberships sm
  LEFT JOIN LATERAL (
    SELECT msg.*
    FROM public.internal_chat_messages msg
    WHERE msg.company_id = p_company_id
      AND msg.channel_id = sm.channel_id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS unread_count
    FROM public.internal_chat_messages msg
    WHERE msg.company_id = p_company_id
      AND msg.channel_id = sm.channel_id
      AND msg.sender_id <> p_user_id
      AND (sm.last_read_at IS NULL OR msg.created_at > sm.last_read_at)
  ) unread ON TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.get_internal_chat_sidebar_state(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_internal_chat_sidebar_state IS
  'Aggrega ultimo messaggio e non letti dei soli canali di cui auth.uid() e membro, evitando N+1 e leakage dei DM.';

COMMIT;
