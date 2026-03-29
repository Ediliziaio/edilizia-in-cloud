-- Drop view before recreating with new column layout (column rename not allowed with CREATE OR REPLACE)
DROP VIEW IF EXISTS public.v_preventivo_analisi;
