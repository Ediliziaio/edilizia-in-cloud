-- Clienti-Servizio (Fase 2 della feature "Prodotti & Servizi").
--
-- Relazione RICORRENTE cliente ↔ servizio/pacchetto: es. le 10 aziende clienti di
-- "Marketing Edile" che pagano una provvigione mensile. Il cliente è FLESSIBILE:
-- può puntare a un contatto CRM (marketing_contacts) OPPURE a un'azienda della
-- piattaforma (companies) — o solo un nome, se esterno. Un'opportunità vinta la
-- genera (opportunity_id). Base per il registro incassi mensile + tab Fatturato
-- Servizi (Fase 3).
CREATE TABLE IF NOT EXISTS public.aedix_service_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id uuid NOT NULL REFERENCES public.aedix_product_lines(id) ON DELETE RESTRICT,
  package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL,
  billing_model text NOT NULL DEFAULT 'retainer_fisso',  -- retainer_fisso | provvigione | una_tantum | performance
  importo numeric NOT NULL DEFAULT 0,                     -- retainer/importo di riferimento
  provvigione_pct numeric,                               -- se billing_model = provvigione
  ricorrenza text NOT NULL DEFAULT 'mensile',            -- mensile | annuale | una_tantum
  stato text NOT NULL DEFAULT 'attivo',                  -- attivo | pausa | cessato
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

-- Tag opzionale del servizio/pacchetto sull'opportunità CRM (segmentazione pipeline
-- + generazione del cliente-servizio alla chiusura).
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS product_line_id uuid REFERENCES public.aedix_product_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE SET NULL;
