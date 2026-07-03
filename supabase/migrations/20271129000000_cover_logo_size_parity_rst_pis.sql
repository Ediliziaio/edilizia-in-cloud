-- Parity cover: "Dimensione logo" (pdf_cover_logo_size, 60–160%) esisteva in
-- 6 moduli (bgn/clm/ele/idr/tetti[cover_logo_size]/serramenti) ma mancava del
-- tutto in ristrutturazione e piscine (colonna+editor+renderer); pavimenti
-- aveva la colonna morta (mai letta/scritta). Audit template 2026-07-02:
-- ora slider in editor + lettura nel renderer per tutti e tre; qui le due
-- colonne mancanti. Nullable senza default: i renderer clampano ?? 100%.
-- Applicata in prod via MCP il 2026-07-02.
ALTER TABLE public.rst_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_size integer;
ALTER TABLE public.pis_template_pdf ADD COLUMN IF NOT EXISTS pdf_cover_logo_size integer;
