-- Index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_ai_agent_branches_company ON public.ai_agent_branches(company_id);
