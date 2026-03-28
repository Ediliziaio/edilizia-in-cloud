ALTER TABLE public.hr_profili ADD CONSTRAINT hr_profili_orario_tipo_check CHECK (orario_tipo = ANY (ARRAY['fisso', 'flessibile', 'turnista', 'standard', 'turni', 'part_time']));
