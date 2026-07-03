-- Catalogo Prodotti/Servizi AEDIX (Fase 1 della feature "Servizi vari").
--
-- Il frontend (CrmProductCards, tab "Cluster & LTV" della dashboard CRM) era già
-- scritto per leggere public.aedix_product_lines, ma la tabella non era mai stata
-- creata → cadeva sui DEFAULTS hardcoded ("dati fuorvianti"). Questa migration crea
-- la tabella (colonne attese dal frontend + categoria/ricorrenza per gestire la
-- natura del servizio) e la seeda con gli stessi valori, così le card restano
-- identiche ma diventano editabili dal catalogo in impostazioni.
--
-- categoria: saas | consulenza | agenzia | performance | una_tantum
-- ricorrenza: mensile | annuale | una_tantum
CREATE TABLE IF NOT EXISTS public.aedix_product_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'consulenza',
  tipo text,
  descrizione text,
  colore text,
  icona text,
  ltv_target numeric NOT NULL DEFAULT 0,
  quota_mensile integer NOT NULL DEFAULT 0,
  prezzo_indicativo numeric NOT NULL DEFAULT 0,
  ricorrenza text NOT NULL DEFAULT 'mensile',
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aedix_product_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aedix_product_lines super admin all" ON public.aedix_product_lines;
CREATE POLICY "aedix_product_lines super admin all" ON public.aedix_product_lines
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

INSERT INTO public.aedix_product_lines
  (slug, nome, categoria, tipo, colore, icona, ltv_target, quota_mensile, prezzo_indicativo, ricorrenza, ordine)
VALUES
  ('eic_saas',        'Edilizia in Cloud',  'saas',       'SaaS · abbonamento annuale',        'hsl(var(--chart-3))', 'Cloud',     2670, 15, 1200, 'annuale',    1),
  ('marketing_edile', 'Marketing Edile',    'agenzia',    'Agenzia · retainer mensile',        'hsl(var(--chart-2))', 'Megaphone', 8400,  5, 1500, 'mensile',    2),
  ('vendita_edile',   'Vendita Edile',      'una_tantum', 'Corso · una tantum + upsell',       'hsl(var(--chart-4))', 'Trophy',    1490,  8,  990, 'una_tantum', 3),
  ('numeri_edilizia', 'Numeri in Edilizia', 'consulenza', 'Controllo gestione · continuativo', 'hsl(var(--chart-1))', 'BarChart3', 5760,  4,  800, 'mensile',    4),
  ('delega_edilizia', 'Delega in Edilizia', 'agenzia',    'Outsourcing · retainer mensile',    'hsl(var(--chart-5))', 'Handshake',14400,  2, 2000, 'mensile',    5)
ON CONFLICT (slug) DO NOTHING;
