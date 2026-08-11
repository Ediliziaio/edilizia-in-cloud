-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.aedix_service_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id uuid NOT NULL REFERENCES public.aedix_product_lines(id) ON DELETE RESTRICT,
  package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL,
  billing_model text NOT NULL DEFAULT 'retainer_fisso',
  importo numeric NOT NULL DEFAULT 0,
  provvigione_pct numeric,
  ricorrenza text NOT NULL DEFAULT 'mensile',
  stato text NOT NULL DEFAULT 'attivo',
  data_inizio date NOT NULL DEFAULT current_date,
  data_fine date,
  opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aedix_service_clients_line ON public.aedix_service_clients(product_line_id);
CREATE INDEX IF NOT EXISTS idx_aedix_service_clients_contact ON public.aedix_service_clients(contact_id);
CREATE INDEX IF NOT EXISTS idx_aedix_service_clients_company ON public.aedix_service_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_aedix_service_clients_stato ON public.aedix_service_clients(stato);
ALTER TABLE public.aedix_service_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_service_clients super admin all" ON public.aedix_service_clients;
CREATE POLICY "aedix_service_clients super admin all" ON public.aedix_service_clients
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS product_line_id uuid REFERENCES public.aedix_product_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE SET NULL;
