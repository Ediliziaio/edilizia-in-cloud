-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- silvio_tool_apply_capture_review inserisce created_by/source_channel su
-- marketing_contacts ma le colonne non esistevano: il "Crea preventivo" del
-- flusso AI capture falliva con 42703. Le aggiungiamo (tracciano chi ha
-- creato il contatto e da quale canale).
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS source_channel text;
