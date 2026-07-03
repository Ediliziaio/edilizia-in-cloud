-- Registro incassi servizi (Fase 3 della feature "Prodotti & Servizi").
--
-- Per ogni cliente-servizio, una riga per PERIODO (mese) con quanto è DOVUTO
-- (fatturato) e quanto è INCASSATO, la data incasso e la SOCIETÀ del gruppo su cui
-- è stato incassato (un cliente può pagare su società diverse). Alimenta la tab
-- "Servizi" di /admin/fatturato: fatturato + incassato per servizio, categoria,
-- società e mese.
CREATE TABLE IF NOT EXISTS public.aedix_service_billings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  periodo date NOT NULL,                        -- primo giorno del mese di competenza
  importo_dovuto numeric NOT NULL DEFAULT 0,    -- fatturato
  importo_incassato numeric NOT NULL DEFAULT 0, -- incassato
  data_incasso date,
  societa text,                                 -- società del gruppo su cui è stato incassato
  stato text NOT NULL DEFAULT 'dovuto',         -- dovuto | parziale | incassato
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_client ON public.aedix_service_billings(service_client_id);
CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_periodo ON public.aedix_service_billings(periodo);
CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_societa ON public.aedix_service_billings(societa);

ALTER TABLE public.aedix_service_billings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_service_billings super admin all" ON public.aedix_service_billings;
CREATE POLICY "aedix_service_billings super admin all" ON public.aedix_service_billings
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
