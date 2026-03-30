-- 5. platform_elevenlabs_config (platform-level, super_admin only)
CREATE TABLE IF NOT EXISTS public.platform_elevenlabs_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text,
  default_llm text NOT NULL DEFAULT 'gemini-2.5-flash',
  markup_multiplier numeric NOT NULL DEFAULT 2.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
