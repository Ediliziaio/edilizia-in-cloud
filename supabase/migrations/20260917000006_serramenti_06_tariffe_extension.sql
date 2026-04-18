-- ━━━ FASE 6 — Tariffe aziendali extension ━━━
-- Aggiunge UM di fatturazione flessibili, costo_interno separato da prezzo_vendita,
-- associazione per vertical, e amplia i tipi di tariffa per supportare il
-- vertical serramentista (manodopera, sopralluogo, progettazione, ponteggio,
-- lattoneria, sigillatura, contorno, falso_telaio).
--
-- La colonna `unita` esistente resta invariata per retro-compatibilità;
-- `unita_fatturazione` è la NUOVA UM canonica, backfillata dalla vecchia.
-- `costo_interno` si affianca al legacy `prezzo_costo` (che resta come backup);
-- backfill iniziale: costo_interno = prezzo_costo.

ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS unita_fatturazione TEXT DEFAULT 'pz'
    CHECK (unita_fatturazione IN (
      'pz','mq','ml','mc','kg','gg','h','a_corpo','km','piano'
    )),
  ADD COLUMN IF NOT EXISTS costo_interno       NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vertical_associato  TEXT,
  ADD COLUMN IF NOT EXISTS attivo              BOOLEAN DEFAULT true;

-- Backfill: mappa vecchia UM -> nuova unita_fatturazione
UPDATE public.tariffe_aziendali
SET unita_fatturazione = CASE
  WHEN unita IN ('pz','mq','ml','mc','h','km','piano') THEN unita
  WHEN unita = 'fisso'    THEN 'a_corpo'
  WHEN unita = 'cad'      THEN 'pz'
  WHEN unita = 'giornata' THEN 'gg'
  WHEN unita = 'ora'      THEN 'h'
  ELSE 'pz'
END
WHERE unita_fatturazione IS NULL OR unita_fatturazione = 'pz';

-- Backfill costo_interno dal legacy prezzo_costo
UPDATE public.tariffe_aziendali
SET costo_interno = prezzo_costo
WHERE (costo_interno IS NULL OR costo_interno = 0)
  AND prezzo_costo IS NOT NULL AND prezzo_costo > 0;

-- Backfill attivo dal legacy attiva
UPDATE public.tariffe_aziendali
SET attivo = COALESCE(attiva, true)
WHERE attivo IS NULL;

-- Amplia CHECK tipo per supportare tariffe serramentista
DO $$ BEGIN
  ALTER TABLE public.tariffe_aziendali
    DROP CONSTRAINT IF EXISTS tariffe_aziendali_tipo_check;
  ALTER TABLE public.tariffe_aziendali
    ADD CONSTRAINT tariffe_aziendali_tipo_check
    CHECK (tipo IN (
      'posa','trasporto','smaltimento','nolo','tiro_piano','pratica',
      'manodopera','sopralluogo','progettazione','ponteggio',
      'lattoneria','sigillatura','contorno','falso_telaio',
      'altro'
    ));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Indice per filtro rapido "tariffe del mio vertical"
CREATE INDEX IF NOT EXISTS idx_tariffe_aziendali_vertical
  ON public.tariffe_aziendali(company_id, vertical_associato)
  WHERE attivo = true;

COMMENT ON COLUMN public.tariffe_aziendali.unita_fatturazione IS
  'FASE 6: UM canonica per il calcolo preventivi. La UM è FISSA alla creazione tariffa.';
COMMENT ON COLUMN public.tariffe_aziendali.costo_interno IS
  'FASE 6: costo interno (posatore, attrezzatura, etc.) per calcolo margine. Non visibile al cliente.';
COMMENT ON COLUMN public.tariffe_aziendali.vertical_associato IS
  'FASE 6: vertical per cui la tariffa è tipica. NULL = tariffa globale.';
