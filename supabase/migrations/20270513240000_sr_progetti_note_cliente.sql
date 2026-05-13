-- ════════════════════════════════════════════════════════════════════════════
-- sr_progetti.note_cliente — note visibili nel PDF cliente
-- ────────────────────────────────────────────────────────────────────────────
-- Già esiste `sr_progetti.note_interne` (testo libero solo backoffice).
-- Aggiungiamo `note_cliente`: testo che compare nel PDF emesso al cliente
-- (es. condizioni speciali, tempi consegna, scelte di stile concordate, ecc.).
--
-- Separare i 2 ambiti evita errori di leak (note interne tipo "cliente
-- difficile" finite per sbaglio nel PDF).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_progetti
  ADD COLUMN IF NOT EXISTS note_cliente TEXT;

COMMENT ON COLUMN public.sr_progetti.note_cliente IS
  'Note destinate al cliente: appaiono nel PDF preventivo. Distinte da '
  'note_interne (solo backoffice, mai esposte).';

NOTIFY pgrst, 'reload schema';
