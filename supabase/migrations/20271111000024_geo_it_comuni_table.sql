-- Dataset comuni ISTAT completo (nome → cap → provincia → regione) per
-- arricchimento geografico lato server (trigger). Caricato dall'edge function
-- load-comuni-geo che scarica public/data/comuni-istat.json (8456 comuni).
-- Reference data globale. Applicata in prod via MCP il 2026-06-30.
CREATE TABLE IF NOT EXISTS public.it_comuni (
  comune    text NOT NULL,
  cap       text,
  sigla     text NOT NULL,
  provincia text,
  regione   text
);
CREATE INDEX IF NOT EXISTS it_comuni_comune_lower ON public.it_comuni (lower(comune));
CREATE INDEX IF NOT EXISTS it_comuni_cap ON public.it_comuni (cap);

ALTER TABLE public.it_comuni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS it_comuni_read ON public.it_comuni;
CREATE POLICY it_comuni_read ON public.it_comuni FOR SELECT TO authenticated USING (true);
