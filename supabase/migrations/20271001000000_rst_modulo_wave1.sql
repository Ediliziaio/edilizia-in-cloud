-- Ristrutturazione · Wave 1 — tabelle verticale (pattern sr_*)
-- ADDITIVA/IDEMPOTENTE. RLS company-scoped (has_role super_admin OR company match).

-- Listino lavorazioni aziendale ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_listino_capitoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.rst_listino_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_id uuid REFERENCES public.rst_listino_capitoli(id) ON DELETE SET NULL,
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Progetto (hub) ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_progetti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text,
  stato text NOT NULL DEFAULT 'bozza',
  tipo_intervento text,
  cliente_nome text, cliente_cognome text, cliente_email text, cliente_telefono text,
  cantiere_indirizzo text, cantiere_citta text, cantiere_provincia text, cantiere_cap text,
  immobile_tipo text, immobile_superficie_mq numeric, immobile_anno int, immobile_piani int,
  opportunita_id uuid, cliente_id uuid,
  template_id uuid,
  sconto_pct numeric NOT NULL DEFAULT 0,
  iva_pct numeric NOT NULL DEFAULT 22,
  detrazione_pct numeric NOT NULL DEFAULT 0,
  totale_imponibile numeric NOT NULL DEFAULT 0,
  totale numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.rst_progetti
    ADD CONSTRAINT rst_progetti_stato_chk CHECK (
      stato IN ('bozza','da_consegnare','consegnato','in_valutazione','accettato','rifiutato','scaduto','archiviato')
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Computo del singolo preventivo (snapshot) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_computo_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.rst_progetti(id) ON DELETE CASCADE,
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
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Media ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_progetti_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.rst_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'situazione',
  url text NOT NULL,
  caption text,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Template PDF (un record per azienda) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rst_template_pdf (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_rst_progetti_company ON public.rst_progetti(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rst_computo_progetto ON public.rst_computo_voci(progetto_id, ordine);
CREATE INDEX IF NOT EXISTS idx_rst_listino_voci_company ON public.rst_listino_voci(company_id, capitolo_id, ordine);
CREATE INDEX IF NOT EXISTS idx_rst_media_progetto ON public.rst_progetti_media(progetto_id, ordine);

-- RLS (pattern sr_*: super_admin OR company_id = get_user_company_id) su tutte le tabelle
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rst_listino_capitoli','rst_listino_voci','rst_progetti','rst_computo_voci','rst_progetti_media','rst_template_pdf'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($q$DROP POLICY IF EXISTS "rst super admin all" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "rst super admin all" ON public.%I FOR ALL
      USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role))$q$, t);
    EXECUTE format($q$DROP POLICY IF EXISTS "rst company members" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "rst company members" ON public.%I FOR ALL TO authenticated
      USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()))$q$, t);
  END LOOP;
END $$;
