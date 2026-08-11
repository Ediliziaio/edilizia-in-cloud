-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.rst_template_pdf
  ADD COLUMN IF NOT EXISTS ragione_sociale text,
  ADD COLUMN IF NOT EXISTS indirizzo_completo text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS partita_iva text,
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'helvetica',
  ADD COLUMN IF NOT EXISTS show_footer_version boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_footer_legal boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cover_logo_position text DEFAULT 'top_left',
  ADD COLUMN IF NOT EXISTS cover_text_color text DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS cover_overlay_opacity numeric DEFAULT 0.4;
