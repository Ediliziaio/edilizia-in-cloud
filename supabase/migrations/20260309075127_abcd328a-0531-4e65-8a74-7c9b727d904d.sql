
-- Internal chat system

CREATE TABLE public.internal_chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  type TEXT NOT NULL DEFAULT 'group',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_icc_company ON public.internal_chat_channels(company_id);
ALTER TABLE public.internal_chat_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icc_sel" ON public.internal_chat_channels FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "icc_ins" ON public.internal_chat_channels FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "icc_upd" ON public.internal_chat_channels FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "icc_del" ON public.internal_chat_channels FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND created_by = auth.uid());

CREATE TABLE public.internal_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.internal_chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
CREATE INDEX idx_icm_ch ON public.internal_chat_members(channel_id);
CREATE INDEX idx_icm_user ON public.internal_chat_members(user_id);
ALTER TABLE public.internal_chat_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icm_sel" ON public.internal_chat_members FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "icm_ins" ON public.internal_chat_members FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "icm_upd" ON public.internal_chat_members FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND user_id = auth.uid());
CREATE POLICY "icm_del" ON public.internal_chat_members FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());

CREATE TABLE public.internal_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.internal_chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES public.internal_chat_messages(id) ON DELETE SET NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_icmsg_ch ON public.internal_chat_messages(channel_id, created_at);
CREATE INDEX idx_icmsg_sender ON public.internal_chat_messages(sender_id);
ALTER TABLE public.internal_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icmsg_sel" ON public.internal_chat_messages FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
CREATE POLICY "icmsg_ins" ON public.internal_chat_messages FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id() AND sender_id = auth.uid());
CREATE POLICY "icmsg_upd" ON public.internal_chat_messages FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND sender_id = auth.uid());
CREATE POLICY "icmsg_del" ON public.internal_chat_messages FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND sender_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_chat_messages;
