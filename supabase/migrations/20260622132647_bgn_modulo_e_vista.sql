-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Bagni · Verticale preventivo (clone di Ristrutturazione, namespace bgn_*).
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
CREATE INDEX IF NOT EXISTS idx_bgn_progetti_company ON public.bgn_progetti(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bgn_computo_progetto ON public.bgn_computo_voci(progetto_id, ordine);
CREATE INDEX IF NOT EXISTS idx_bgn_listino_voci_company ON public.bgn_listino_voci(company_id, capitolo_id, ordine);
CREATE INDEX IF NOT EXISTS idx_bgn_media_progetto ON public.bgn_progetti_media(progetto_id, ordine);
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
CREATE OR REPLACE VIEW public.v_preventivi_unificati
WITH (security_invoker = true) AS
  SELECT q.id, q.company_id, 'classico'::text AS tipo, COALESCE(q.quote_number, '—') AS numero,
    q.client_name AS cliente, q.salesperson_id AS commerciale_id, q.status::text AS stato_raw,
    CASE q.status::text
      WHEN 'bozza' THEN 'bozza' WHEN 'draft' THEN 'bozza'
      WHEN 'inviata' THEN 'in_corso' WHEN 'sent' THEN 'in_corso' WHEN 'viewed' THEN 'in_corso'
      WHEN 'visualizzata' THEN 'in_corso' WHEN 'pending' THEN 'in_corso'
      WHEN 'accettata' THEN 'vinto' WHEN 'accepted' THEN 'vinto' WHEN 'firmata' THEN 'vinto'
      WHEN 'signed' THEN 'vinto' WHEN 'convertita' THEN 'vinto'
      WHEN 'rifiutata' THEN 'perso' WHEN 'rejected' THEN 'perso' WHEN 'scaduta' THEN 'perso' WHEN 'expired' THEN 'perso'
      ELSE 'altro' END AS stato_unificato,
    q.total::numeric AS totale, q.opportunity_id AS opportunity_id, q.contact_id AS contact_id,
    COALESCE(q.updated_at, q.created_at) AS data, q.created_at, q.updated_at
  FROM public.quotes q WHERE q.deleted_at IS NULL
  UNION ALL
  SELECT s.id, s.company_id, 'serramenti'::text AS tipo, COALESCE(s.code, '—') AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', s.cliente_nome, s.cliente_cognome)), '') AS cliente,
    s.consulente_id AS commerciale_id, s.stato::text AS stato_raw,
    CASE s.stato::text
      WHEN 'bozza' THEN 'bozza' WHEN 'da_consegnare' THEN 'in_corso' WHEN 'consegnato' THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso' WHEN 'accettato' THEN 'vinto' WHEN 'rifiutato' THEN 'perso' WHEN 'scaduto' THEN 'perso'
      ELSE 'altro' END AS stato_unificato,
    CASE WHEN s.totale_min IS NOT NULL AND s.totale_max IS NOT NULL THEN (s.totale_min::numeric + s.totale_max::numeric) / 2.0 ELSE NULL END AS totale,
    s.opportunita_id AS opportunity_id, s.cliente_id AS contact_id,
    COALESCE(s.updated_at, s.created_at) AS data, s.created_at, s.updated_at
  FROM public.sr_progetti s
  UNION ALL
  SELECT f.id, f.company_id, 'fotovoltaico'::text AS tipo, COALESCE(f.numero, '—') AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', mc.first_name, mc.last_name)), '') AS cliente,
    f.created_by AS commerciale_id, f.stato::text AS stato_raw,
    CASE f.stato::text
      WHEN 'bozza' THEN 'bozza' WHEN 'configurato' THEN 'in_corso' WHEN 'emesso' THEN 'in_corso'
      WHEN 'firmato' THEN 'vinto' WHEN 'annullato' THEN 'perso' ELSE 'altro' END AS stato_unificato,
    f.prezzo_vendita_iva_inclusa::numeric AS totale, f.opportunita_crm_id AS opportunity_id, f.cliente_id AS contact_id,
    COALESCE(f.updated_at, f.created_at) AS data, f.created_at, f.updated_at
  FROM public.fv_progetti f LEFT JOIN public.marketing_contacts mc ON mc.id = f.cliente_id WHERE f.annullato = false
  UNION ALL
  SELECT r.id, r.company_id, 'ristrutturazione'::text AS tipo, COALESCE(r.code, '—') AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', r.cliente_nome, r.cliente_cognome)), '') AS cliente,
    r.created_by AS commerciale_id, r.stato::text AS stato_raw,
    CASE r.stato::text
      WHEN 'bozza' THEN 'bozza' WHEN 'da_consegnare' THEN 'in_corso' WHEN 'consegnato' THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso' WHEN 'accettato' THEN 'vinto' WHEN 'rifiutato' THEN 'perso' WHEN 'scaduto' THEN 'perso'
      ELSE 'altro' END AS stato_unificato,
    r.totale::numeric AS totale, r.opportunita_id AS opportunity_id, r.cliente_id AS contact_id,
    COALESCE(r.created_at, r.updated_at) AS data, r.created_at, r.updated_at
  FROM public.rst_progetti r
  UNION ALL
  SELECT g.id, g.company_id, 'bagni'::text AS tipo, COALESCE(g.code, '—') AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', g.cliente_nome, g.cliente_cognome)), '') AS cliente,
    g.created_by AS commerciale_id, g.stato::text AS stato_raw,
    CASE g.stato::text
      WHEN 'bozza' THEN 'bozza' WHEN 'da_consegnare' THEN 'in_corso' WHEN 'consegnato' THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso' WHEN 'accettato' THEN 'vinto' WHEN 'rifiutato' THEN 'perso' WHEN 'scaduto' THEN 'perso'
      ELSE 'altro' END AS stato_unificato,
    g.totale::numeric AS totale, g.opportunita_id AS opportunity_id, g.cliente_id AS contact_id,
    COALESCE(g.created_at, g.updated_at) AS data, g.created_at, g.updated_at
  FROM public.bgn_progetti g;
