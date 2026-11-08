BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS management_mode text NOT NULL DEFAULT 'complete';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_management_mode_check') THEN
  ALTER TABLE public.companies ADD CONSTRAINT companies_management_mode_check CHECK(management_mode IN ('complete','accounting'));
 END IF;
END $$;
COMMENT ON COLUMN public.companies.management_mode IS 'Profilo di navigazione: completo oppure amministrazione, contabilità, fatturazione e finanza. Distinto dal piano commerciale e dai permessi delle persone.';
CREATE OR REPLACE FUNCTION public.company_management_mode_superadmin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ BEGIN
 IF NEW.management_mode IS DISTINCT FROM OLD.management_mode
    AND (SELECT auth.uid()) IS NOT NULL
    AND NOT public.has_role((SELECT auth.uid()),'super_admin'::public.app_role) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Il profilo di gestione si modifica dal superadmin.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.company_management_mode_superadmin() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.companies'::regclass AND tgname='company_management_mode_superadmin') THEN
CREATE TRIGGER company_management_mode_superadmin BEFORE UPDATE OF management_mode ON public.companies FOR EACH ROW EXECUTE FUNCTION public.company_management_mode_superadmin();
END IF; END $$;
COMMIT;
