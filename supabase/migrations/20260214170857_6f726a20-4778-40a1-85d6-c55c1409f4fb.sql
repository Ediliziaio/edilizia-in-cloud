CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sender_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'company',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all support messages"
  ON public.support_messages FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company admins can manage their support messages"
  ON public.support_messages FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Staff can view support messages if permitted"
  ON public.support_messages FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_tickets'::text)
    AND company_id = get_user_company_id(auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;