SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- The editor already writes through elevenlabs-proxy with tenant, permission and
-- read-only checks. Old broad table grants must not bypass those checks and the
-- single-use queue claim, or fabricate settled billing records.
REVOKE ALL ON public.ai_campaigns_v2,public.ai_campaign_contacts,
 public.ai_agent_conversations,public.ai_conversations_v2,public.ai_credit_usage,
 public.ai_credit_transactions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_campaigns_v2,public.ai_campaign_contacts,
 public.ai_agent_conversations,public.ai_conversations_v2,public.ai_credit_usage,
 public.ai_credit_transactions TO authenticated;
GRANT ALL ON public.ai_campaigns_v2,public.ai_campaign_contacts,
 public.ai_agent_conversations,public.ai_conversations_v2,public.ai_credit_usage,
 public.ai_credit_transactions TO service_role;
