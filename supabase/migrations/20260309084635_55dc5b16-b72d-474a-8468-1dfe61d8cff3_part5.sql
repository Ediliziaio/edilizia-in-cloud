-- 3. Add trigger on bank_provider_configs (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_provider_configs') THEN
    DROP TRIGGER IF EXISTS trg_bank_provider_configs_updated_at ON public.bank_provider_configs;
    CREATE TRIGGER trg_bank_provider_configs_updated_at BEFORE UPDATE ON public.bank_provider_configs FOR EACH ROW EXECUTE FUNCTION public.banking_set_updated_at();
  END IF;
END $$;
