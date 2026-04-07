-- Migration: elevenlabs_voices table for SuperAdmin voice management
-- Module 5 (P0): ElevenLabs Voice Configuration

CREATE TABLE IF NOT EXISTS public.elevenlabs_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text UNIQUE NOT NULL,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'it',
  gender text CHECK (gender IN ('male', 'female', 'neutral')),
  preview_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  use_case text CHECK (use_case IN ('agent', 'narration', 'general')),
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.elevenlabs_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_elevenlabs_voices"
  ON public.elevenlabs_voices
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Ensure only one default voice at a time via unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS elevenlabs_voices_single_default
  ON public.elevenlabs_voices (is_default)
  WHERE is_default = true;

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.set_elevenlabs_voices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_elevenlabs_voices_updated_at
  BEFORE UPDATE ON public.elevenlabs_voices
  FOR EACH ROW EXECUTE FUNCTION public.set_elevenlabs_voices_updated_at();
