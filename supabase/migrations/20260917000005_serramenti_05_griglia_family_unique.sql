-- Preventivatore Verticalizzato Serramentisti — FASE 4.5
--
-- Indice UNIQUE parziale su listino_griglia(family_id, valore_x, valore_y)
-- per righe con family_id NOT NULL. Necessario per upsert idempotente dalla
-- UI editor famiglia (matrice L×H). Non tocca le righe legacy con
-- prodotto_id perché il WHERE filtra su family_id IS NOT NULL.
--
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS idx_griglia_family_xy_unique
  ON public.listino_griglia(family_id, valore_x, valore_y)
  WHERE family_id IS NOT NULL;

COMMENT ON INDEX public.idx_griglia_family_xy_unique IS
  'Unicità cella griglia per una famiglia (solo righe family_id NOT NULL). Usato dal FamilyGridEditor per upsert.';
