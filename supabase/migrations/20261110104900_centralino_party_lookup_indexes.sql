CREATE INDEX IF NOT EXISTS centralino_profiles_phone_idx ON public.profiles(company_id,(regexp_replace(phone,'[^0-9]','','g')));
CREATE INDEX IF NOT EXISTS centralino_contacts_phone_idx ON public.marketing_contacts(company_id,(regexp_replace(phone,'[^0-9]','','g')));
CREATE INDEX IF NOT EXISTS centralino_human_customer_idx ON public.human_call_logs(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS centralino_ai_customer_idx ON public.ai_conversations_v2(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS centralino_legacy_customer_idx ON public.ai_agent_conversations(customer_id) WHERE customer_id IS NOT NULL;
