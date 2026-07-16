-- Ponte render AI → preventivo: il render viaggia col preventivo e il PDF
-- esce con una pagina finale "Anteprima render AI" (audit 16/07).
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS render_url text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS render_session_id uuid;
COMMENT ON COLUMN public.quotes.render_url IS 'URL pubblico del render AI allegato: genera la pagina Anteprima render AI nel PDF preventivo';
