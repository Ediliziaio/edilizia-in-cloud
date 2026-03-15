
-- 1. Create safe view for ai_elevenlabs_config (masks api_key_encrypted)
CREATE OR REPLACE VIEW public.ai_elevenlabs_config_safe AS
SELECT
  id,
  company_id,
  CASE 
    WHEN api_key_encrypted IS NOT NULL AND length(api_key_encrypted) > 4 
    THEN '****' || right(api_key_encrypted, 4)
    WHEN api_key_encrypted IS NOT NULL THEN '****'
    ELSE NULL
  END AS api_key_masked,
  api_key_valida,
  piano,
  crediti_rimanenti,
  crediti_totali,
  ultima_verifica,
  creato_il,
  aggiornato_il
FROM public.ai_elevenlabs_config;

-- 2. RLS policy on ai_elevenlabs_config (if not exists)
ALTER TABLE public.ai_elevenlabs_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_elevenlabs_config' AND policyname = 'Company members can view own config'
  ) THEN
    CREATE POLICY "Company members can view own config"
      ON public.ai_elevenlabs_config
      FOR SELECT
      TO authenticated
      USING (company_id = public.get_my_company_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_elevenlabs_config' AND policyname = 'Company members can update own config'
  ) THEN
    CREATE POLICY "Company members can update own config"
      ON public.ai_elevenlabs_config
      FOR UPDATE
      TO authenticated
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_elevenlabs_config' AND policyname = 'Company members can insert own config'
  ) THEN
    CREATE POLICY "Company members can insert own config"
      ON public.ai_elevenlabs_config
      FOR INSERT
      TO authenticated
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
END $$;

-- 3. Performance index on ai_elevenlabs_config
CREATE INDEX IF NOT EXISTS idx_ai_elevenlabs_config_company_id ON public.ai_elevenlabs_config(company_id);
