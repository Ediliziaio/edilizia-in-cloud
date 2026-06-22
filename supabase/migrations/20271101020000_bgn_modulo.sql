-- Bagni · Verticale preventivo (clone di Ristrutturazione, namespace bgn_*).
-- Greenfield: un'unica migrazione con lo schema FINALE (base + builder + personalizzazione
-- + fonte) e gli adattamenti bagno (numero_bagni, iva default 10). ADDITIVA/IDEMPOTENTE.
-- RLS company-scoped (super_admin OR company match). LOCALE: applicata in pubblicazione.

-- Listino lavorazioni aziendale ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bgn_listino_capitoli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bgn_listino_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  capitolo_id uuid REFERENCES public.bgn_listino_capitoli(id) ON DELETE SET NULL,
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

-- Progetto (hub) ──────────────────────────────────────────────────────────────
-- Adattamenti bagno: numero_bagni (nuovo), iva_pct default 10 (bagni); superficie
-- e tipo intervento riusano immobile_superficie_mq / tipo_intervento (DRY).
CREATE TABLE IF NOT EXISTS public.bgn_progetti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text,
  stato text NOT NULL DEFAULT 'bozza',
  tipo_intervento text,
  numero_bagni int,
  cliente_nome text, cliente_cognome text, cliente_email text, cliente_telefono text,
  cantiere_indirizzo text, cantiere_citta text, cantiere_provincia text, cantiere_cap text,
  immobile_tipo text, immobile_superficie_mq numeric, immobile_anno int, immobile_piani int,
  -- Migliorie bagno: calcolatore rivestimenti, accessibilità, massimale detrazione:
  perimetro_ml numeric, altezza_rivestimento_m numeric,
  accessibile boolean NOT NULL DEFAULT false, massimale_detrazione numeric,
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
  ALTER TABLE public.bgn_progetti
    ADD CONSTRAINT bgn_progetti_stato_chk CHECK (
      stato IN ('bozza','da_consegnare','consegnato','in_valutazione','accettato','rifiutato','scaduto','archiviato')
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Computo del singolo preventivo (snapshot) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bgn_computo_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.bgn_progetti(id) ON DELETE CASCADE,
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
COMMENT ON COLUMN public.bgn_computo_voci.fonte IS 'Prezzario regionale di provenienza della voce (per citazione base d''asta). NULL = voce libera/listino.';

-- Media ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bgn_progetti_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progetto_id uuid NOT NULL REFERENCES public.bgn_progetti(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'situazione',
  url text NOT NULL,
  caption text,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Template PDF (un record per azienda) — schema finale completo ───────────────
CREATE TABLE IF NOT EXISTS public.bgn_template_pdf (
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

-- Indici
CREATE INDEX IF NOT EXISTS idx_bgn_progetti_company ON public.bgn_progetti(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bgn_computo_progetto ON public.bgn_computo_voci(progetto_id, ordine);
CREATE INDEX IF NOT EXISTS idx_bgn_listino_voci_company ON public.bgn_listino_voci(company_id, capitolo_id, ordine);
CREATE INDEX IF NOT EXISTS idx_bgn_media_progetto ON public.bgn_progetti_media(progetto_id, ordine);

-- RLS (super_admin OR company_id = get_user_company_id) su tutte le tabelle
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bgn_listino_capitoli','bgn_listino_voci','bgn_progetti','bgn_computo_voci','bgn_progetti_media','bgn_template_pdf'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($q$DROP POLICY IF EXISTS "bgn super admin all" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "bgn super admin all" ON public.%I FOR ALL
      USING (has_role(auth.uid(),'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(),'super_admin'::app_role))$q$, t);
    EXECUTE format($q$DROP POLICY IF EXISTS "bgn company members" ON public.%I$q$, t);
    EXECUTE format($q$CREATE POLICY "bgn company members" ON public.%I FOR ALL TO authenticated
      USING (company_id = get_user_company_id(auth.uid())) WITH CHECK (company_id = get_user_company_id(auth.uid()))$q$, t);
  END LOOP;
END $$;
