CREATE TABLE IF NOT EXISTS public.simulazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','finalizzata','archiviata')),
  is_template boolean NOT NULL DEFAULT false,
  costo_totale numeric(14,2) NOT NULL DEFAULT 0,
  ricavo_imponibile numeric(14,2) NOT NULL DEFAULT 0,
  margine_valore numeric(14,2) NOT NULL DEFAULT 0,
  margine_pct numeric(6,2) NOT NULL DEFAULT 0,
  iva_totale numeric(14,2) NOT NULL DEFAULT 0,
  prezzo_cliente numeric(14,2) NOT NULL DEFAULT 0,
  rata_mensile numeric(12,2),
  voci jsonb NOT NULL DEFAULT '[]'::jsonb,
  fasi jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenari jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.simulazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "simulazioni_company" ON public.simulazioni;
CREATE POLICY "simulazioni_company" ON public.simulazioni FOR ALL USING (company_id = public.get_my_company_id());
DROP POLICY IF EXISTS "simulazioni_sa" ON public.simulazioni;
CREATE POLICY "simulazioni_sa" ON public.simulazioni FOR ALL USING (public.is_super_admin());
CREATE INDEX IF NOT EXISTS simulazioni_company_idx ON public.simulazioni(company_id, updated_at DESC);
