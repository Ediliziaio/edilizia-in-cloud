-- tesoreria_enabled
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tesoreria_enabled boolean DEFAULT false;
