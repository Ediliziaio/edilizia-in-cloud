-- Drive documentale aziendale: cartelle personalizzate e nuove tipologie operative.

CREATE TABLE IF NOT EXISTS public.media_library_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) >= 2),
  slug text NOT NULL,
  description text,
  match_query text,
  icon text NOT NULL DEFAULT 'folder',
  color text NOT NULL DEFAULT 'orange',
  sort_order integer NOT NULL DEFAULT 1000,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_media_library_folders_company
  ON public.media_library_folders(company_id, sort_order, created_at)
  WHERE archived_at IS NULL;

ALTER TABLE public.media_library_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_library_folders_select ON public.media_library_folders;
CREATE POLICY media_library_folders_select
  ON public.media_library_folders FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS media_library_folders_modify ON public.media_library_folders;
CREATE POLICY media_library_folders_modify
  ON public.media_library_folders FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP TRIGGER IF EXISTS update_media_library_folders_updated_at ON public.media_library_folders;
CREATE TRIGGER update_media_library_folders_updated_at
  BEFORE UPDATE ON public.media_library_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE ON public.media_library_folders TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_analysis_results_doc_type_check'
      AND conrelid = 'public.document_analysis_results'::regclass
  ) THEN
    ALTER TABLE public.document_analysis_results
      DROP CONSTRAINT document_analysis_results_doc_type_check;
  END IF;
END $$;

ALTER TABLE public.document_analysis_results
  ADD CONSTRAINT document_analysis_results_doc_type_check CHECK (doc_type IN (
    'computo_metrico', 'preventivo', 'ddt', 'fattura', 'ricevuta',
    'contratto', 'listino_prezzi', 'biglietto_visita',
    'foto_cantiere', 'foto_generale', 'tabella_finanziamento',
    'documento_identita', 'verbale_collaudo', 'polizza_assicurativa',
    'documento_pa', 'scheda_tecnica', 'documento_generico',
    'fattura_attiva', 'fattura_passiva', 'ddt_in', 'ddt_out',
    'pos_sicurezza', 'duvri', 'durc', 'soa', 'cedolino',
    'modulo_f24', 'estratto_conto', 'visura_camerale',
    'scheda_prodotto', 'catalogo_prodotti', 'certificazione_prodotto',
    'manuale_prodotto', 'manuale_installazione', 'distinta_materiali',
    'piano_finanziario', 'finanziamento', 'finanziaria',
    'noleggio_operativo', 'leasing', 'contratto_finanziario',
    'render', 'render_ai', 'foto_render', 'immagine_render',
    'offerta', 'proposta_commerciale',
    'altro', 'generico'
  ));

COMMENT ON TABLE public.media_library_folders IS
  'Cartelle personalizzate del drive documentale aziendale. Le regole match_query raggruppano documenti gia filtrati dai permessi applicativi.';
