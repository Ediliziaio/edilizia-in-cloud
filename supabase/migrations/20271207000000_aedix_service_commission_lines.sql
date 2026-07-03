-- Provvigioni ricorrenti multi-riga che il CLIENTE paga ad AEDIX (Fase 5).
--
-- Un cliente-servizio a modello "provvigione" può pagare una o PIÙ provvigioni,
-- ciascuna su una base scelta (FATTURATO o INCASSATO mensile del cliente) con una
-- sua percentuale. Ogni mese si inserisce la base del periodo e si calcola
-- provvigione = base × %.

-- 1) Definizione delle righe provvigione (ricorrenti) per cliente-servizio.
CREATE TABLE IF NOT EXISTS public.aedix_service_commission_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  etichetta text,                              -- es. "Fatturato prodotto A", "Incassato cantieri"
  base text NOT NULL DEFAULT 'fatturato',      -- fatturato | incassato (del cliente)
  percentuale numeric NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aedix_service_commission_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_service_commission_lines super admin all" ON public.aedix_service_commission_lines;
CREATE POLICY "aedix_service_commission_lines super admin all" ON public.aedix_service_commission_lines
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE INDEX IF NOT EXISTS idx_ascl_client ON public.aedix_service_commission_lines(service_client_id);

-- 2) Dettaglio mensile per-riga sul billing: per ogni riga provvigione la base del
--    mese e l'importo calcolato. importo_dovuto del billing = somma degli importi.
--    Array di oggetti { line_id, etichetta, base, base_valore, percentuale, importo }.
ALTER TABLE public.aedix_service_billings
  ADD COLUMN IF NOT EXISTS righe_provvigione jsonb NOT NULL DEFAULT '[]'::jsonb;
