-- Override PER-PREVENTIVO della rata di finanziamento nel PDF: la promo è
-- configurata nel template (finanziamento_promo, 20271130000000) ma il
-- venditore deve poterla togliere sul singolo preventivo (cliente che paga
-- cash). NULL = segui il template (default), false = nascondi, true = mostra.
-- Applicata in prod via MCP il 2026-07-02.
ALTER TABLE public.rst_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.tet_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.bgn_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.clm_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.ele_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.idr_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.pav_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
ALTER TABLE public.pis_progetti ADD COLUMN IF NOT EXISTS mostra_finanziamento boolean;
