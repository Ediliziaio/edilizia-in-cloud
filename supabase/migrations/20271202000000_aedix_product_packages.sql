-- Pacchetti/livelli di un servizio (Fase 1b della feature "Prodotti & Servizi").
--
-- Ogni servizio (aedix_product_lines) può avere più PACCHETTI con prezzo/ricorrenza
-- propri. Es: "Vendita Edile" con un pacchetto da 500€ e uno da 5000€; "Edilizia in
-- Cloud" con i vari piani. Serve a taggare le opportunità/clienti sul pacchetto
-- specifico (Fase 2) e a calcolarne fatturato/incassato (Fase 3).
CREATE TABLE IF NOT EXISTS public.aedix_product_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id uuid NOT NULL REFERENCES public.aedix_product_lines(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descrizione text,
  prezzo numeric NOT NULL DEFAULT 0,
  ricorrenza text NOT NULL DEFAULT 'mensile',   -- mensile | annuale | una_tantum
  ltv_target numeric NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aedix_product_packages_line ON public.aedix_product_packages(product_line_id);

ALTER TABLE public.aedix_product_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aedix_product_packages super admin all" ON public.aedix_product_packages;
CREATE POLICY "aedix_product_packages super admin all" ON public.aedix_product_packages
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
