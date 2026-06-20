ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.rst_listino_voci ADD COLUMN IF NOT EXISTS fonte text;
COMMENT ON COLUMN public.rst_computo_voci.fonte IS 'Prezzario regionale di provenienza della voce (per citazione base d''asta). NULL = voce libera/listino.';
