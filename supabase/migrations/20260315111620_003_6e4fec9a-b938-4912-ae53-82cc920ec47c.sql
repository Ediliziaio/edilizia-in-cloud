-- 3. Performance index on ai_elevenlabs_config
CREATE INDEX IF NOT EXISTS idx_ai_elevenlabs_config_company_id ON public.ai_elevenlabs_config(company_id);
