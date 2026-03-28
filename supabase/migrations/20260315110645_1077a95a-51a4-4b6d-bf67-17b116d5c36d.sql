-- =====================================================
-- UNIF-AGE-05: Campaigns enhancements, credit transactions, analytics
-- =====================================================

-- 1. ALTER ai_campaigns_v2 — add scheduling, target, settings, stats, metadata columns
ALTER TABLE public.ai_campaigns_v2
  ADD COLUMN IF NOT EXISTS descrizione text,
  ADD COLUMN IF NOT EXISTS data_inizio timestamptz,
  ADD COLUMN IF NOT EXISTS data_fine timestamptz,
  ADD COLUMN IF NOT EXISTS orario_inizio time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS orario_fine time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS giorni_settimana int[] DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS fuso_orario text DEFAULT 'Europe/Rome',
  ADD COLUMN IF NOT EXISTS contatti_falliti int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tentativi_max int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS intervallo_tentativi_minuti int DEFAULT 60,
  ADD COLUMN IF NOT EXISTS messaggio_iniziale text,
  ADD COLUMN IF NOT EXISTS durata_media_secondi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasso_risposta numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crediti_utilizzati numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tag text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS aggiornato_il timestamptz DEFAULT now();
