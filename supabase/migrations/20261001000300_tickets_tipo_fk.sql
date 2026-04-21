-- ============================================================
-- B3 — FK tickets.tipo_impianto_id + tipo_intervento_id
-- ============================================================
-- Motivazione:
--   `useListinoSuggerito` fa **by-name matching** su `impianti_cliente.tipo_impianto`
--   (TEXT) e `tickets.category` (TEXT) contro `tipi_impianto.nome` / `tipi_intervento.nome`.
--   Se un admin rinomina un tipo, il match si rompe silenziosamente e tutti i
--   ticket storici "perdono" il loro prezzo di listino. Non-deterministico.
--
-- Fix: aggiungi FK dirette nullable a tickets, con backfill opzionale.
--   Backward-compatible: tutto funziona anche senza le FK popolate (il hook
--   ha un fallback by-name e un fallback "manutenzione_ordinaria").
--
-- Upgrade path documentato:
--   1. Apply migration → nuove FK null per tutti i ticket esistenti.
--   2. Opzionale: backfill script che prova a popolare le FK per ticket
--      esistenti facendo lo stesso matching che fa il hook.
--   3. Una volta stabili le FK, `useListinoSuggerito` può diventare un
--      semplice JOIN senza fallback by-name.
-- ============================================================

-- Aggiungi colonne nullable (non rompe nulla)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS tipo_impianto_id UUID REFERENCES public.tipi_impianto(id) ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS tipo_intervento_id UUID REFERENCES public.tipi_intervento(id) ON DELETE SET NULL;

-- Indici per query lookup
CREATE INDEX IF NOT EXISTS idx_tickets_tipo_impianto ON public.tickets(tipo_impianto_id)
  WHERE tipo_impianto_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_tipo_intervento ON public.tickets(tipo_intervento_id)
  WHERE tipo_intervento_id IS NOT NULL;

-- BACKFILL BEST-EFFORT
-- Strategia: per ogni ticket con `impianto_id` non nullo, prova a matchare
-- impianti_cliente.tipo_impianto (TEXT) contro tipi_impianto.nome (case-insensitive).
-- Per il tipo_intervento, proviamo a matchare tickets.category contro tipi_intervento.nome.
-- Se il match fallisce, la colonna resta NULL (fallback del hook ancora attivo).

UPDATE public.tickets t
SET tipo_impianto_id = ti.id
FROM public.impianti_cliente ic,
     public.tipi_impianto ti
WHERE t.tipo_impianto_id IS NULL
  AND t.impianto_id IS NOT NULL
  AND ic.id = t.impianto_id
  AND ti.company_id = t.company_id
  AND ti.attivo = true
  AND lower(trim(ti.nome)) = lower(trim(COALESCE(ic.tipo_impianto, '')))
  AND COALESCE(ic.tipo_impianto, '') <> '';

UPDATE public.tickets t
SET tipo_intervento_id = tin.id
FROM public.tipi_intervento tin
WHERE t.tipo_intervento_id IS NULL
  AND t.category IS NOT NULL
  AND tin.company_id = t.company_id
  AND tin.attivo = true
  AND lower(trim(tin.nome)) = lower(trim(COALESCE(t.category, '')))
  AND COALESCE(t.category, '') <> '';

-- Comment per chiarire semantica
COMMENT ON COLUMN public.tickets.tipo_impianto_id IS
  'FK esplicita a tipi_impianto (preferita su impianti_cliente.tipo_impianto TEXT). Nullable per backward compat.';

COMMENT ON COLUMN public.tickets.tipo_intervento_id IS
  'FK esplicita a tipi_intervento (preferita sulla deduzione da tickets.category TEXT). Nullable per backward compat.';

NOTIFY pgrst, 'reload schema';
