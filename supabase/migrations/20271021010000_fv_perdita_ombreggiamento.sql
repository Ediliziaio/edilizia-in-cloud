ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS perdita_ombreggiamento_pct numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.fv_progetti.perdita_ombreggiamento_pct IS
  'Perdita frazionaria 0..1 da ombreggiamento vicino (alberi/edifici adiacenti). 0 = nessuno. L''orizzonte lontano è già in PVGIS H(i)_y.';
