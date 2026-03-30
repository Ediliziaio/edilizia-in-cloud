-- 9. Trigger: auto-create credits when company is created
DROP FUNCTION IF EXISTS public.init_company_credits() CASCADE;
CREATE OR REPLACE FUNCTION public.init_company_credits() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ai_credits (company_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
