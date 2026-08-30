-- ============================================================================
-- I progetti Pavimenti non si aprivano e non si potevano cestinare.
--
-- La migration del cestino a 30 giorni (20260713131656_cestino_preventivi_30gg)
-- ha aggiunto deleted_at a bgn_/clm_/ele_/idr_/pis_/rst_/tet_progetti — e a
-- fv_/sr_progetti — ma ha SALTATO pav_progetti: e' l'unica delle dieci tabelle
-- progetti a non averla.
--
-- Il codice pero' la usa come tutte le altre: usePavimentiProgetto filtra la
-- lista con .is("deleted_at", null) e cancella con .update({deleted_at}). Con
-- la colonna assente Postgres risponde 42703, l'hook rilancia l'errore e la
-- lista progetti Pavimenti resta rotta; la cancellazione non funziona affatto.
--
-- Qui si allinea pav_progetti alle sorelle. La tabella e' vuota, quindi
-- nessun dato da sistemare: le righe future nascono con deleted_at NULL,
-- cioe' "non cestinato", esattamente come per gli altri configuratori.
-- Nessun indice: le sorelle non ne hanno, e il filtro gira su volumi minimi.
-- ============================================================================

ALTER TABLE public.pav_progetti
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

COMMENT ON COLUMN public.pav_progetti.deleted_at IS
  'Cestino: valorizzata = progetto cestinato. Allineata alle altre *_progetti.';
