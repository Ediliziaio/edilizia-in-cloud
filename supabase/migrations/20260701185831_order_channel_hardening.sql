-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.internal_chat_is_order_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_chat_channels c
    WHERE c.id = p_channel_id AND c.order_id IS NOT NULL
  );
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_internal_chat_channels_order
  ON public.internal_chat_channels(order_id)
  WHERE order_id IS NOT NULL;

DROP POLICY IF EXISTS icc_sel_order ON public.internal_chat_channels;
CREATE POLICY icc_sel_order ON public.internal_chat_channels
  FOR SELECT
  USING (order_id IS NOT NULL AND internal_chat_company_allowed(company_id));

DROP POLICY IF EXISTS icmsg_sel_order ON public.internal_chat_messages;
CREATE POLICY icmsg_sel_order ON public.internal_chat_messages
  FOR SELECT
  USING (internal_chat_company_allowed(company_id) AND internal_chat_is_order_channel(channel_id));

DROP POLICY IF EXISTS icmsg_ins_order ON public.internal_chat_messages;
CREATE POLICY icmsg_ins_order ON public.internal_chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND internal_chat_company_allowed(company_id)
    AND internal_chat_is_order_channel(channel_id)
  );

DROP POLICY IF EXISTS icm_sel_order ON public.internal_chat_members;
CREATE POLICY icm_sel_order ON public.internal_chat_members
  FOR SELECT
  USING (internal_chat_company_allowed(company_id) AND internal_chat_is_order_channel(channel_id));

DROP POLICY IF EXISTS icm_ins_order ON public.internal_chat_members;
CREATE POLICY icm_ins_order ON public.internal_chat_members
  FOR INSERT
  WITH CHECK (internal_chat_company_allowed(company_id) AND internal_chat_is_order_channel(channel_id));
