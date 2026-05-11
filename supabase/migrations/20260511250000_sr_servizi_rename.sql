-- ═══════════════════════════════════════════════════════════════════════════
-- Rinomino sr_manodopera_progetto → sr_servizi_progetto
-- ---------------------------------------------------------------------------
-- Concettualmente la manodopera/posa è ora INCLUSA nel prezzo del prodotto
-- (calcolo da FamilyEditor.posa_tariffa_default_id). La tabella precedente
-- viene riusata per "Servizi aggiuntivi" del preventivo (trasporto, tiro al
-- piano, pratica ENEA, smaltimento, sopralluogo extra…).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE IF EXISTS public.sr_manodopera_progetto
  RENAME TO sr_servizi_progetto;

ALTER INDEX IF EXISTS sr_manodopera_progetto_idx
  RENAME TO sr_servizi_progetto_idx;
ALTER INDEX IF EXISTS sr_manodopera_company_idx
  RENAME TO sr_servizi_company_idx;

-- Rinomino anche i nomi delle policy
DO $$ BEGIN
  ALTER POLICY sr_manodopera_progetto_select ON public.sr_servizi_progetto
    RENAME TO sr_servizi_progetto_select;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER POLICY sr_manodopera_progetto_insert ON public.sr_servizi_progetto
    RENAME TO sr_servizi_progetto_insert;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER POLICY sr_manodopera_progetto_update ON public.sr_servizi_progetto
    RENAME TO sr_servizi_progetto_update;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER POLICY sr_manodopera_progetto_delete ON public.sr_servizi_progetto
    RENAME TO sr_servizi_progetto_delete;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Rinomino trigger (era 'sr_manodopera_touch')
DROP TRIGGER IF EXISTS sr_manodopera_touch ON public.sr_servizi_progetto;
DROP TRIGGER IF EXISTS sr_servizi_touch ON public.sr_servizi_progetto;
CREATE TRIGGER sr_servizi_touch
  BEFORE UPDATE ON public.sr_servizi_progetto
  FOR EACH ROW EXECUTE FUNCTION public.sr_progetti_touch_updated_at();

COMMIT;
