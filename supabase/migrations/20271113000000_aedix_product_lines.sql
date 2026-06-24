-- Catalogo delle LINEE DI SERVIZIO AEDIX (i prodotti che VENDIAMO noi, non i
-- piani di fatturazione SaaS): EiC SaaS, Marketing Edile, Vendita Edile, Numeri
-- in Edilizia, Delega in Edilizia, + consulenze future. È una tabella gestibile:
-- aggiungere un servizio = inserire una riga, e la Dashboard commerciale diventa
-- product-driven (LTV, quote, matrice cluster×prodotto per linea).
--
-- + collega le opportunità a una linea (product_line_id) e a un canale (channel).
-- Additivo e idempotente.

CREATE TABLE IF NOT EXISTS public.aedix_product_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  tipo text,                       -- SaaS | agenzia | corso | controllo | outsourcing | consulenza
  descrizione text,
  colore text,                     -- es. 'hsl(var(--chart-3))' o hex
  icona text,                      -- nome icona lucide
  ltv_target numeric NOT NULL DEFAULT 0,
  quota_mensile int NOT NULL DEFAULT 0,
  prezzo_indicativo numeric NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  ordine int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aedix_product_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apl super admin all" ON public.aedix_product_lines;
CREATE POLICY "apl super admin all" ON public.aedix_product_lines
  FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "apl read authenticated" ON public.aedix_product_lines;
CREATE POLICY "apl read authenticated" ON public.aedix_product_lines
  FOR SELECT TO authenticated USING (true);

-- Seed dei 5 servizi attuali (idempotente). Colori = palette --chart-*.
INSERT INTO public.aedix_product_lines (slug, nome, tipo, descrizione, colore, icona, ltv_target, quota_mensile, prezzo_indicativo, ordine)
VALUES
  ('eic_saas',      'Edilizia in Cloud', 'SaaS',        'Gestionale cloud — abbonamento annuale',     'hsl(var(--chart-3))', 'Cloud',     2670, 15, 1200, 1),
  ('marketing_edile','Marketing Edile',  'agenzia',     'Agenzia marketing — retainer mensile',       'hsl(var(--chart-2))', 'Megaphone', 8400,  5, 1500, 2),
  ('vendita_edile', 'Vendita Edile',     'corso',       'Corso vendita — una tantum + upsell',        'hsl(var(--chart-4))', 'Trophy',    1490,  8,  990, 3),
  ('numeri_edilizia','Numeri in Edilizia','controllo',  'Controllo di gestione — continuativo',        'hsl(var(--chart-1))', 'BarChart3', 5760,  4,  800, 4),
  ('delega_edilizia','Delega in Edilizia','outsourcing','Outsourcing — retainer mensile',             'hsl(var(--chart-5))', 'Handshake', 14400, 2, 2000, 5)
ON CONFLICT (slug) DO NOTHING;

-- Collega le opportunità a una linea di servizio + canale commerciale.
ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS product_line_id uuid REFERENCES public.aedix_product_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel text;  -- vendita_diretta | referral | partner_rivenditore

CREATE INDEX IF NOT EXISTS idx_mkt_opp_product_line ON public.marketing_opportunities(company_id, product_line_id);
