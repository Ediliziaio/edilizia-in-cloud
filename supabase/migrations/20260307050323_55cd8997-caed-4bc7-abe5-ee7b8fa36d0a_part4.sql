-- 5. Add tts_model to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS tts_model TEXT DEFAULT 'eleven_multilingual_v2';
