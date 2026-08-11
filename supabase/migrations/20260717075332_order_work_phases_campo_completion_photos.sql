-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Avanzamento fasi dal campo: l'operaio/subappaltatore assegnato al cantiere
-- segna se ha fatto o meno la SUA fase, allegando le foto.
-- La policy UPDATE "Campo workers can update phases of assigned orders" esiste
-- già e copre order_campo_assignments (USING + WITH CHECK) → nessuna nuova
-- policy necessaria: queste colonne ricadono sotto quella.

ALTER TABLE public.order_work_phases
  ADD COLUMN IF NOT EXISTS foto_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completata_da uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completata_il timestamptz;

COMMENT ON COLUMN public.order_work_phases.foto_urls IS
  'Foto di avanzamento caricate dal campo (array di path storage nel bucket campo-rapportini).';
COMMENT ON COLUMN public.order_work_phases.completata_da IS
  'Chi ha segnato la fase come completata dall''area campo (operaio o subappaltatore).';
COMMENT ON COLUMN public.order_work_phases.completata_il IS
  'Quando la fase è stata segnata completata dal campo.';

-- Indice per la vista "le mie fasi": fasi dei cantieri, ordinate.
CREATE INDEX IF NOT EXISTS idx_owp_order_position
  ON public.order_work_phases (order_id, position);
