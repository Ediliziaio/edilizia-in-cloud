-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: interruttore per chiudere da sola, ogni notte, la banca senza
-- fattura (commissioni, bolli, F24, stipendi, rate, anticipi) — 18/11/2026
-- ════════════════════════════════════════════════════════════════════════════
-- Preparazione di 20290419150100: una colonna su company_governance_settings,
-- spenta per tutte le aziende. Solo aggiunta, nessuna riga cambia comportamento.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

ALTER TABLE public.company_governance_settings
  ADD COLUMN IF NOT EXISTS chiusura_senza_fattura_automatica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_governance_settings.chiusura_senza_fattura_automatica IS
  'Ogni notte, dopo le conferme automatiche, le regole di cassa assegnano la voce e i movimenti senza fattura (costi bancari, tributi, stipendi, rate di finanziamento, anticipi) si chiudono: costo e prima nota per i costi, sola prima nota per gli altri.';
