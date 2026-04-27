-- ============================================================================
-- Tabella audit: richieste di attivazione moduli vendita verticali
-- ============================================================================
-- Tracking delle richieste utente azienda → staff EiC, generate dall'edge
-- function `richiesta-attivazione-modulo` quando un utente clicca "Richiedi
-- attivazione" su una card modulo bloccato (stato "Premium" nel tab Moduli
-- Vendita dell'Hub Preventivi).
--
-- Permette al team commerciale di:
--   - tracciare interesse su moduli specifici per company
--   - misurare conversion funnel (pending → contacted → activated)
--   - evitare duplicati (stessa company che richiede 10 volte lo stesso modulo)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.modulo_richieste_attivazione (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id              UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo_slug          TEXT         NOT NULL,
  modulo_nome          TEXT         NOT NULL,
  feature_key          TEXT         NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'contacted', 'activated', 'declined', 'expired')),
  requested_by_email   TEXT,
  requested_by_name    TEXT,
  staff_notes          TEXT,
  handled_by           UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indice per dashboard staff (filtri per status + ordinamento data)
CREATE INDEX IF NOT EXISTS idx_modulo_richieste_status_created
  ON public.modulo_richieste_attivazione (status, created_at DESC);

-- Indice per lookup per-company (history nella tab subscription)
CREATE INDEX IF NOT EXISTS idx_modulo_richieste_company
  ON public.modulo_richieste_attivazione (company_id, created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_modulo_richieste_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS modulo_richieste_set_updated_at
  ON public.modulo_richieste_attivazione;
CREATE TRIGGER modulo_richieste_set_updated_at
  BEFORE UPDATE ON public.modulo_richieste_attivazione
  FOR EACH ROW EXECUTE FUNCTION public.tg_modulo_richieste_set_updated_at();

-- RLS
ALTER TABLE public.modulo_richieste_attivazione ENABLE ROW LEVEL SECURITY;

-- Lettura: solo super_admin può vedere TUTTE le richieste (dashboard staff).
-- Pattern canonico EiC: la fonte di verità per il ruolo applicativo è
-- `user_roles` via SECURITY DEFINER `public.has_role(uid, app_role)`.
-- (NON usare `profiles.role` — quella colonna non esiste in profiles.)
DROP POLICY IF EXISTS "super_admin_read_richieste" ON public.modulo_richieste_attivazione;
CREATE POLICY "super_admin_read_richieste"
  ON public.modulo_richieste_attivazione
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Update: solo super_admin (gestione status + note interne)
DROP POLICY IF EXISTS "super_admin_update_richieste" ON public.modulo_richieste_attivazione;
CREATE POLICY "super_admin_update_richieste"
  ON public.modulo_richieste_attivazione
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Insert: gestito esclusivamente da edge function con SERVICE_ROLE_KEY
-- (nessuna policy esplicita per authenticated → bloccato by RLS deny-default)

COMMENT ON TABLE public.modulo_richieste_attivazione IS
  'Audit log delle richieste di attivazione moduli vendita verticali generate dall''edge function richiesta-attivazione-modulo (introdotta 2026-04-27).';
