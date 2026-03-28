-- 3. ALTER ai_whatsapp_numbers - add missing columns
ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS webhook_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS messaggio_benvenuto text,
  ADD COLUMN IF NOT EXISTS messaggio_fuori_orario text,
  ADD COLUMN IF NOT EXISTS orario_attivo jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
