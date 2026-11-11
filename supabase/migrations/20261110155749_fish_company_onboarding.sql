CREATE TABLE public.ai_fish_connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  number_mode text NOT NULL CHECK(number_mode IN ('existing','new')),
  existing_number text CHECK(existing_number IS NULL OR existing_number ~ '^\+[1-9][0-9]{7,14}$'),
  carrier text NOT NULL DEFAULT '' CHECK(length(carrier)<=120),
  sip_available text NOT NULL DEFAULT 'unknown' CHECK(sip_available IN ('yes','no','unknown')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','in_review','awaiting_company','ready','cancelled')),
  platform_notes text NOT NULL DEFAULT '' CHECK(length(platform_notes)<=1000),
  company_reply text NOT NULL DEFAULT '' CHECK(length(company_reply)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_agents_v2(company_id,id) ON DELETE CASCADE,
  CHECK((number_mode='existing' AND existing_number IS NOT NULL) OR (number_mode='new' AND existing_number IS NULL))
);
CREATE UNIQUE INDEX fish_connection_one_open_idx ON public.ai_fish_connection_requests(company_id,agent_id) WHERE status IN ('requested','in_review','awaiting_company');
CREATE INDEX fish_connection_company_date_idx ON public.ai_fish_connection_requests(company_id,created_at DESC);
CREATE INDEX fish_connection_agent_date_idx ON public.ai_fish_connection_requests(company_id,agent_id,created_at DESC);
ALTER TABLE public.ai_fish_connection_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_connection_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_fish_connection_requests TO authenticated;
GRANT ALL ON public.ai_fish_connection_requests TO service_role;
CREATE POLICY fish_connection_read ON public.ai_fish_connection_requests FOR SELECT TO authenticated USING (
  (company_id=public.get_my_company_id() AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='company_admin'))
  OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin')
);
COMMENT ON TABLE public.ai_fish_connection_requests IS 'Requests for assisted phone setup. No carrier order, line activation or phone call is performed by submitting a request.';
