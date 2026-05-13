-- ============================================================================
-- 20270513 — Toggle "Escludi posa" per riga BOM (Serramenti + Accessori)
-- ============================================================================
--
-- BUSINESS CASE
-- Il listino prodotti ha gia' la manodopera configurata di default sull'articolo
-- (Step 4 FamilyEditor): scelta fra Tariffa Aziendale / Importo manuale / Nessuna.
-- Quando il commerciale aggiunge l'articolo al preventivo, la posa viene
-- automaticamente sommata al prezzo unitario (vedi calcolaPosaInclusa).
--
-- Caso d'uso: a volte il commerciale vuole vendere SOLO la fornitura (no posa)
-- su una specifica riga. Esempi:
--   * Cliente si fa installare da altro installatore
--   * Riga "ricambio" (consegna senza installazione)
--   * Sconto commerciale: "le ultime 2 finestre te le installo io a sconto" → posa esclusa
--
-- Senza un flag dedicato, oggi il commerciale dovrebbe modificare a mano il
-- prezzo unitario sottraendo la posa — error-prone e poco tracciabile.
--
-- IMPLEMENTAZIONE
-- Booleano default FALSE (= posa inclusa, comportamento attuale). Quando TRUE,
-- la posa NON viene piu' sommata al prezzo unitario in ricalcolo e il PDF
-- evidenzia "Solo fornitura" nella riga.
--
-- Migrazione idempotente: no record toccati, solo schema additivo.
-- ============================================================================

ALTER TABLE public.sr_serramenti_progetto
  ADD COLUMN IF NOT EXISTS posa_esclusa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sr_serramenti_progetto.posa_esclusa IS
  'Se TRUE, esclude la manodopera dal prezzo unitario di questa riga BOM '
  '(default FALSE = posa inclusa come configurata sul listino prodotto).';

ALTER TABLE public.sr_accessori_progetto
  ADD COLUMN IF NOT EXISTS posa_esclusa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sr_accessori_progetto.posa_esclusa IS
  'Se TRUE, esclude la manodopera dal prezzo unitario di questo accessorio '
  '(default FALSE = posa inclusa come configurata sul listino).';
