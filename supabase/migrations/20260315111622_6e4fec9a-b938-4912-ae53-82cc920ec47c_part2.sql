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
