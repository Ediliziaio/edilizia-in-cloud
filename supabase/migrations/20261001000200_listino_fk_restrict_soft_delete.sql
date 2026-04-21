-- ============================================================
-- B2 — FK ON DELETE RESTRICT + soft delete per tipi_impianto/intervento
-- ============================================================
-- Motivazione:
--   `listino_prezzi.tipo_impianto_id` e `.tipo_intervento_id` erano
--   `ON DELETE CASCADE`. Se un admin elimina un tipo impianto, TUTTE
--   le righe di listino collegate vengono cancellate **senza warning**
--   nell'UI. Perdita dati silenziosa.
--
-- Fix:
--   1. Passiamo a ON DELETE RESTRICT → l'eliminazione del tipo fallisce
--      se ci sono righe di listino collegate, costringendo l'utente a
--      disattivare (`attivo=false`) o a rimuovere prima le righe.
--   2. Il campo `attivo` esiste già su tipi_impianto/intervento:
--      ufficialmente la UX corretta è "disattiva" (soft delete), non
--      "elimina". L'eliminazione resta possibile solo a listino vuoto.
--
-- Side-effect accettabile: la UI deve gestire l'errore FK (codice
-- Postgres 23503) e suggerire di disattivare il tipo. Il componente
-- è già preparato — vedi TipiManager.tsx che mostra toast on error.
-- ============================================================

-- Drop FK CASCADE esistenti
ALTER TABLE public.listino_prezzi
  DROP CONSTRAINT IF EXISTS listino_prezzi_tipo_impianto_id_fkey;

ALTER TABLE public.listino_prezzi
  DROP CONSTRAINT IF EXISTS listino_prezzi_tipo_intervento_id_fkey;

-- Ricrea come RESTRICT
ALTER TABLE public.listino_prezzi
  ADD CONSTRAINT listino_prezzi_tipo_impianto_id_fkey
  FOREIGN KEY (tipo_impianto_id)
  REFERENCES public.tipi_impianto(id)
  ON DELETE RESTRICT;

ALTER TABLE public.listino_prezzi
  ADD CONSTRAINT listino_prezzi_tipo_intervento_id_fkey
  FOREIGN KEY (tipo_intervento_id)
  REFERENCES public.tipi_intervento(id)
  ON DELETE RESTRICT;

-- Anche override cliente: se un listino viene cancellato, non deve
-- portare via silenziosamente gli override contrattuali di un cliente.
ALTER TABLE public.listino_override_cliente
  DROP CONSTRAINT IF EXISTS listino_override_cliente_listino_prezzo_id_fkey;

ALTER TABLE public.listino_override_cliente
  ADD CONSTRAINT listino_override_cliente_listino_prezzo_id_fkey
  FOREIGN KEY (listino_prezzo_id)
  REFERENCES public.listino_prezzi(id)
  ON DELETE RESTRICT;

-- RPC: conta righe di listino collegate a un tipo (per il dialog UI)
CREATE OR REPLACE FUNCTION public.count_listino_usages_for_tipo_impianto(
  p_tipo_impianto_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.listino_prezzi
  WHERE tipo_impianto_id = p_tipo_impianto_id;
  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.count_listino_usages_for_tipo_intervento(
  p_tipo_intervento_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.listino_prezzi
  WHERE tipo_intervento_id = p_tipo_intervento_id;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_listino_usages_for_tipo_impianto(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_listino_usages_for_tipo_intervento(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
