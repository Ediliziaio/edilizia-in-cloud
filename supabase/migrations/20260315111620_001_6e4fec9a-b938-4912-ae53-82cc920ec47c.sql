-- 2. RLS policy on ai_elevenlabs_config (if not exists)
ALTER TABLE public.ai_elevenlabs_config ENABLE ROW LEVEL SECURITY;
