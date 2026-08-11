-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Dataset comuni ISTAT completo (nome → cap → provincia → regione) per
-- arricchimento geografico lato server (trigger). Caricato da edge function
-- load-comuni-geo che scarica public/data/comuni-istat.json. Reference data globale.
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
