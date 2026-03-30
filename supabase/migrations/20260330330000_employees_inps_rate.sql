ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS inps_rate DECIMAL(5,2) DEFAULT 28.00;
COMMENT ON COLUMN public.employees.inps_rate IS
  'Aliquota contributi INPS a carico azienda (%). Default 28% artigiani edili INPS 2024';
