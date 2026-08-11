-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Tetti · Verticale preventivo (namespace tet_*).
CREATE TABLE IF NOT EXISTS public.tet_listino_capitoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tet_listino_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_id uuid REFERENCES public.tet_listino_capitoli(id) ON DELETE SET NULL,
  codice text,
  descrizione text NOT NULL,
  unita_misura text NOT NULL DEFAULT 'cad',
  costo_materiali numeric NOT NULL DEFAULT 0,
  costo_manodopera numeric NOT NULL DEFAULT 0,
  ricarico_pct numeric NOT NULL DEFAULT 0,
  prezzo_unitario numeric NOT NULL DEFAULT 0,
  articolo_id uuid,
  tariffa_id uuid,
  note text,
  ordine int NOT NULL DEFAULT 0,
  fonte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tet_progetti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text,
  stato text NOT NULL DEFAULT 'bozza',
  tipo_intervento text,
  numero_falde int,
  cliente_nome text, cliente_cognome text, cliente_email text, cliente_telefono text,
  cantiere_indirizzo text, cantiere_citta text, cantiere_provincia text, cantiere_cap text,
  immobile_tipo text, immobile_superficie_mq numeric, immobile_anno int, immobile_piani int,
  superficie_pianta_mq numeric, pendenza_pct numeric, perimetro_ml numeric,
  amianto boolean NOT NULL DEFAULT false,
  opportunita_id uuid, cliente_id uuid,
  template_id uuid,
  sconto_pct numeric NOT NULL DEFAULT 0,
  iva_pct numeric NOT NULL DEFAULT 10,
  detrazione_pct numeric NOT NULL DEFAULT 0,
  totale_imponibile numeric NOT NULL DEFAULT 0,
  totale numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.tet_progetti
    ADD CONSTRAINT tet_progetti_stato_chk CHECK (
      stato IN ('bozza','da_consegnare','consegnato','in_valutazione','accettato','rifiutato','scaduto','archiviato')
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.tet_computo_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.tet_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_nome text NOT NULL DEFAULT 'Generale',
  descrizione text NOT NULL,
  unita_misura text NOT NULL DEFAULT 'cad',
  quantita numeric NOT NULL DEFAULT 0,
  prezzo_unitario numeric NOT NULL DEFAULT 0,
  costo_materiali numeric NOT NULL DEFAULT 0,
  costo_manodopera numeric NOT NULL DEFAULT 0,
  sconto_pct numeric NOT NULL DEFAULT 0,
  importo numeric NOT NULL DEFAULT 0,
  margine_eur numeric NOT NULL DEFAULT 0,
  margine_pct numeric NOT NULL DEFAULT 0,
  listino_voce_id uuid,
  ordine int NOT NULL DEFAULT 0,
  fonte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tet_progetti_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.tet_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'situazione',
  url text NOT NULL,
  caption text,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tet_template_pdf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  logo_url text,
  color_primary text DEFAULT '#1E3A5F', color_secondary text DEFAULT '#F97316',
  color_accent text DEFAULT '#16A34A', color_text text DEFAULT '#212529',
  chi_siamo text, chi_siamo_foto_url text,
  esigenze jsonb DEFAULT '[]'::jsonb, soluzione jsonb DEFAULT '[]'::jsonb,
  usp jsonb DEFAULT '[]'::jsonb, testimonianze jsonb DEFAULT '[]'::jsonb,
  cronoprogramma jsonb DEFAULT '[]'::jsonb,
  consulente_default jsonb,
  cover_title text, cover_subtitle text, cover_image_url text,
  payment_terms_text text, validity_text text, footer_text text,
  show_chi_siamo boolean DEFAULT true, show_cronoprogramma boolean DEFAULT true,
  show_margine boolean DEFAULT false,
  ragione_sociale text, indirizzo_completo text, telefono text, email text, partita_iva text,
  font_family text DEFAULT 'helvetica',
  show_footer_version boolean DEFAULT true, show_footer_legal boolean DEFAULT false,
  cover_logo_position text DEFAULT 'top_left', cover_text_color text DEFAULT '#FFFFFF',
  cover_overlay_opacity numeric DEFAULT 0.4,
  garanzie jsonb DEFAULT '[]'::jsonb, faq jsonb DEFAULT '[]'::jsonb, percorso jsonb DEFAULT '[]'::jsonb,
  show_garanzie boolean DEFAULT true, show_percorso boolean DEFAULT true,
  cover_title_size numeric DEFAULT 30, cover_text_align text DEFAULT 'left',
  default_iva_pct numeric DEFAULT 10, default_detrazione_pct numeric DEFAULT 50,
  default_validita_giorni integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tet_progetti_company ON public.tet_progetti(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tet_computo_progetto ON public.tet_computo_voci(progetto_id, ordine);
CREATE INDEX IF NOT EXISTS idx_tet_listino_voci_company ON public.tet_listino_voci(company_id, capitolo_id, ordine);
CREATE INDEX IF NOT EXISTS idx_tet_media_progetto ON public.tet_progetti_media(progetto_id, ordine);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tet_listino_capitoli','tet_listino_voci','tet_progetti','tet_computo_voci','tet_progetti_media','tet_template_pdf'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($q$DROP POLICY IF EXISTS "tet super admin all" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "tet super admin all" ON public.%I FOR ALL
      USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role))$q$, t);
    EXECUTE format($q$DROP POLICY IF EXISTS "tet company members" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "tet company members" ON public.%I FOR ALL TO authenticated
      USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()))$q$, t);
  END LOOP;
END $$;
