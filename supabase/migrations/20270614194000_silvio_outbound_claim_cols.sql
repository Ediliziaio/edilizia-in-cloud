-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-ACTIONS-EXTERNAL-01 · consegna outbound (audit senior 2026-05-30)
-- ────────────────────────────────────────────────────────────────────────────
-- FIX CRITICO: silvio_outbound_messages veniva accodato (status='queued') ma
-- nessun processo lo consegnava → email mai inviate. Aggiungo le colonne per il
-- claim atomico + reconciliation usate dal nuovo worker silvio-outbound-worker.
--   claimed_at: timestamp del claim (worker). NULL = libero, prelevabile.
--   attempts:   contatore claim (cap anti-loop in caso di crash del worker).
-- Additivo, nessun impatto su righe esistenti.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.silvio_outbound_messages
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;

-- Indice parziale: il worker prende solo le righe libere in coda.
CREATE INDEX IF NOT EXISTS idx_silvio_outbound_claimable
  ON public.silvio_outbound_messages (created_at)
  WHERE status = 'queued' AND claimed_at IS NULL;
