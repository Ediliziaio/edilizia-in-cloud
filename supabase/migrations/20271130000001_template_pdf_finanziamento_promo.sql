-- Finanziamento "lite" nei PDF dei moduli (audit commerciale 2026-07-02):
-- l'azienda configura la promo nel template (attivo, rate, TAN) e ogni
-- preventivo mostra "da €X/mese" calcolato sul totale. jsonb:
-- { attivo: bool, rate: int, tan_pct: numeric }. Parse difensivo lato client
-- (parseFinanziamentoPromo). Applicata in prod via MCP il 2026-07-02.
ALTER TABLE public.rst_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.tet_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.bgn_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.clm_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.ele_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.idr_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.pav_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
ALTER TABLE public.pis_template_pdf ADD COLUMN IF NOT EXISTS finanziamento_promo jsonb;
