-- Hardening "Note interne di commessa":
-- 1) un solo canale per commessa (evita frammentazione + rottura maybeSingle)
-- 2) i canali DI COMMESSA (order_id NOT NULL) sono note INTERNE del team:
--    visibili/scrivibili da tutto il team aziendale, non solo dai membri.
--    (La membership resta il driver di notifiche/@menzioni e "chi è nel gruppo".)
-- Tutte le policy sono ADDITIVE e scopate ai soli canali order → i canali
-- normali di Chat Team restano invariati (membership-only).

-- Helper SECURITY DEFINER: true se il canale è di commessa. Evita ricorsione RLS
-- (non dipende dalle policy di internal_chat_channels).
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

-- Un solo canale per commessa.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_internal_chat_channels_order
  ON public.internal_chat_channels(order_id)
  WHERE order_id IS NOT NULL;

-- Canale di commessa visibile a tutto il team aziendale.
DROP POLICY IF EXISTS icc_sel_order ON public.internal_chat_channels;
CREATE POLICY icc_sel_order ON public.internal_chat_channels
  FOR SELECT
  USING (order_id IS NOT NULL AND internal_chat_company_allowed(company_id));

-- Messaggi dei canali di commessa: leggibili e scrivibili dal team aziendale.
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

-- Membri dei canali di commessa: elenco visibile e aggiungibile dal team aziendale.
DROP POLICY IF EXISTS icm_sel_order ON public.internal_chat_members;
CREATE POLICY icm_sel_order ON public.internal_chat_members
  FOR SELECT
  USING (internal_chat_company_allowed(company_id) AND internal_chat_is_order_channel(channel_id));

DROP POLICY IF EXISTS icm_ins_order ON public.internal_chat_members;
CREATE POLICY icm_ins_order ON public.internal_chat_members
  FOR INSERT
  WITH CHECK (internal_chat_company_allowed(company_id) AND internal_chat_is_order_channel(channel_id));
