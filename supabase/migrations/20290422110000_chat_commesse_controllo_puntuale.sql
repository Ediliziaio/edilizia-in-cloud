-- Per le note di commessa basta controllare la visibilità della commessa
-- del canale. Usare orders_visibili qui poteva valutare l'intera vista
-- durante una lettura dei partecipanti, anche per una chat privata.
SET LOCAL lock_timeout = '2s';

ALTER POLICY icc_sel_order ON public.internal_chat_channels
  USING (
    order_id IS NOT NULL
    AND public.internal_chat_company_allowed(company_id)
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND private.office_visible_order(order_id)
  );

ALTER POLICY icc_ins ON public.internal_chat_channels
  WITH CHECK (
    public.internal_chat_company_allowed(company_id)
    AND created_by = (SELECT auth.uid())
    AND (order_id IS NULL OR (
      NOT (SELECT public.utente_e_cliente_esterno())
      AND private.office_visible_order(order_id)
    ))
  );

ALTER POLICY icm_sel_order ON public.internal_chat_members
  USING (
    public.internal_chat_company_allowed(company_id)
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND private.office_visible_order((
      SELECT ch.order_id
      FROM public.internal_chat_channels ch
      WHERE ch.id = internal_chat_members.channel_id
        AND ch.company_id = internal_chat_members.company_id
    ))
  );

ALTER POLICY icm_ins_order ON public.internal_chat_members
  WITH CHECK (
    public.internal_chat_company_allowed(company_id)
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND private.office_visible_order((
      SELECT ch.order_id
      FROM public.internal_chat_channels ch
      WHERE ch.id = internal_chat_members.channel_id
        AND ch.company_id = internal_chat_members.company_id
    ))
  );

ALTER POLICY icmsg_sel_order ON public.internal_chat_messages
  USING (
    public.internal_chat_company_allowed(company_id)
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND private.office_visible_order((
      SELECT ch.order_id
      FROM public.internal_chat_channels ch
      WHERE ch.id = internal_chat_messages.channel_id
        AND ch.company_id = internal_chat_messages.company_id
    ))
  );

ALTER POLICY icmsg_ins_order ON public.internal_chat_messages
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.internal_chat_company_allowed(company_id)
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND private.office_visible_order((
      SELECT ch.order_id
      FROM public.internal_chat_channels ch
      WHERE ch.id = internal_chat_messages.channel_id
        AND ch.company_id = internal_chat_messages.company_id
    ))
  );
